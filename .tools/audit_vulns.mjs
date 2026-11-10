// Audit the pnpm lockfile against the npm/GitHub advisory database.
// Usage: node .tools/audit_vulns.mjs [--json <out>]
import fs from 'node:fs';
import https from 'node:https';

const LOCK = 'pnpm-lock.yaml';

function parseLock(text) {
  const lines = text.split(/\r?\n/);
  let inPackages = false;
  const out = new Map();
  for (const line of lines) {
    if (/^[A-Za-z]/.test(line)) {
      inPackages = line.startsWith('packages:') || line.startsWith('snapshots:');
      continue;
    }
    if (!inPackages) continue;
    const m = /^ {2}'?([^':]+)'?:$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const at = key.startsWith('@') ? key.lastIndexOf('@') : key.indexOf('@');
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const version = key.slice(at + 1).split('(')[0];
    if (!/^\d/.test(version)) continue;
    if (!out.has(name)) out.set(name, new Set());
    out.get(name).add(version);
  }
  return out;
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      path,
      { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

function parseVersion(v) {
  const [core, pre] = v.split('-');
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, pre: pre ? pre.split('.') : [] };
}

function cmp(a, b) {
  const A = parseVersion(a), B = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] < B.nums[i] ? -1 : 1;
  }
  if (!A.pre.length && !B.pre.length) return 0;
  if (!A.pre.length) return 1;
  if (!B.pre.length) return -1;
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i += 1) {
    const x = A.pre[i], y = B.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function satisfies(version, range) {
  if (!range || range === '*' || range === 'x') return true;
  return range.split('||').some((alt) => {
    const part = alt.trim();
    if (!part) return true;
    if (/\s-\s/.test(part)) {
      const [lo, hi] = part.split(/\s-\s/);
      return cmp(version, lo.trim()) >= 0 && cmp(version, hi.trim()) <= 0;
    }
    return part.split(/\s+/).every((tok) => {
      const m = /^(>=|<=|>|<|=|\^|~)?\s*v?(.+)$/.exec(tok);
      if (!m) return true;
      const [, op = '=', ver] = m;
      const c = cmp(version, ver);
      switch (op) {
        case '>': return c > 0;
        case '>=': return c >= 0;
        case '<': return c < 0;
        case '<=': return c <= 0;
        case '^': return c >= 0 && cmp(version, ver.split('.')[0] + '.0.0') >= 0
          ? cmp(version, `${Number(ver.split('.')[0]) + 1}.0.0`) < 0 : false;
        case '~': return c >= 0 && cmp(version, `${ver.split('.').slice(0, 2).join('.')}.0`) >= 0
          ? cmp(version, `${ver.split('.')[0]}.${Number(ver.split('.')[1] || 0) + 1}.0`) < 0 : false;
        default: return c === 0;
      }
    });
  });
}

const pkgs = parseLock(fs.readFileSync(LOCK, 'utf8'));
const names = [...pkgs.keys()].sort();
const bodies = {};
for (const n of names) bodies[n] = [...pkgs.get(n)];

const found = [];
const chunk = 250;
for (let i = 0; i < names.length; i += chunk) {
  const slice = {};
  for (const n of names.slice(i, i + chunk)) slice[n] = bodies[n];
  const res = await post('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', slice);
  for (const [name, advisories] of Object.entries(res)) {
    for (const adv of advisories) {
      for (const version of pkgs.get(name) || []) {
        if (satisfies(version, adv.vulnerable_versions)) {
          found.push({
            package: name,
            version,
            severity: adv.severity,
            id: adv.id,
            ghsa: (adv.url || '').split('/').pop(),
            title: adv.title,
            range: adv.vulnerable_versions,
            url: adv.url,
            direct: null,
          });
        }
      }
    }
  }
}

const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
found.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.package.localeCompare(b.package));

// Mark direct dependencies from the importers section.
const lockText = fs.readFileSync(LOCK, 'utf8');
for (const f of found) {
  f.direct = new RegExp(`^ {6}'?${f.package.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?:$`, 'm').test(lockText);
}

if (process.argv.includes('--json')) {
  const idx = process.argv.indexOf('--json');
  fs.writeFileSync(process.argv[idx + 1], JSON.stringify(found, null, 2));
}
const counts = found.reduce((a, f) => ({ ...a, [f.severity]: (a[f.severity] || 0) + 1 }), {});
console.log(JSON.stringify(counts));
for (const f of found) {
  console.log(`${f.severity.padEnd(8)} ${f.package}@${f.version} ${f.direct ? '[direct]' : '[transitive]'} ${f.ghsa} ${f.range}`);
}
console.log(`total ${found.length} across ${new Set(found.map((f) => f.package)).size} packages`);
