// Temporary: syntax-check the e2e specs that are outside every tsconfig.
const ts = require('./node_modules/typescript');
const fs = require('fs');

const files = process.argv.slice(2);
let bad = 0;
for (const file of files) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  const diagnostics = out.diagnostics || [];
  if (diagnostics.length) {
    bad++;
    console.log('FAIL', file);
    for (const d of diagnostics) {
      console.log('  ', ts.flattenDiagnosticMessageText(d.messageText, ' '));
    }
  } else {
    console.log('ok  ', file, '0 diagnostics');
  }
}
process.exit(bad ? 1 : 0);
