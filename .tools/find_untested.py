import io, os, re

spec_texts = []
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in (".git", "node_modules", ".tools", ".next")]
    for f in files:
        if f.endswith(".spec.ts"):
            p = os.path.join(root, f)
            spec_texts.append(io.open(p, encoding="utf-8", errors="ignore").read())
joined = "\n".join(spec_texts)

rows = []
for base in ("packages", os.path.join("apps", "api", "src"), os.path.join("apps", "web", "src"), os.path.join("apps", "mobile", "src")):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".next")]
        for f in files:
            if not f.endswith((".ts", ".tsx")) or f.endswith(".d.ts"):
                continue
            p = os.path.join(root, f)
            stem = f.rsplit(".", 2)[0]
            hit = stem in joined
            if not hit:
                rows.append((os.path.getsize(p), p))

rows.sort(reverse=True)
print("untested-by-name files:", len(rows))
for size, p in rows[:22]:
    print("%7d  %s" % (size, p))
