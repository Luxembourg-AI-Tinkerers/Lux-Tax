const ts = require("typescript");
const fs = require("fs");
const files = [
  "apps/api/src/modules/calculations/calculations.service.ts",
  "apps/api/src/modules/calculations/calculations.controller.ts",
  "apps/api/src/modules/calculations/class-resolution.ts",
  "apps/api/src/modules/filing/filing.service.ts",
  "apps/api/src/modules/filing/return-approvals.service.ts",
  "apps/api/src/modules/filing/return-approvals.module.ts",
  "apps/api/src/modules/filing/return-version-history.ts",
  "apps/api/src/modules/filing/assessment-dates.ts",
  "apps/api/src/modules/filing/form100-case-map.ts",
  "apps/api/src/modules/freelance/freelance.service.ts",
  "apps/api/src/modules/freelance/freelance.module.ts",
  "apps/web/src/components/TaxCalculatorView.tsx",
  "apps/web/src/components/QuestionnaireView.tsx",
  "apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx",
  "apps/web/src/components/NotificationCenter.tsx",
  "apps/web/src/components/FilingPackageView.tsx",
  "apps/api/src/modules/documents/receipt-ai-vision.service.ts",
  "apps/mobile/app/(tabs)/estimate.tsx",
  "apps/mobile/app/(tabs)/documents.tsx",
  "apps/mobile/src/components/DocumentCameraScanner.tsx",
  "apps/mobile/src/lib/workspace.ts",
  "apps/mobile/app/(tabs)/tasks.tsx",
  "apps/mobile/src/components/OfflineBanner.tsx",
  "apps/mobile/src/components/AppLockScreen.tsx",
  "packages/validation/src/questionnaire.schema.ts",
  "packages/tax-engine/src/pending.ts",
  "packages/tax-engine/test/pending.spec.ts",
  "apps/mobile/test/render.spec.ts",
  "packages/tax-engine/test/certificate160.spec.ts",
  "packages/tax-engine/test/invariants.spec.ts",
  "packages/tax-engine/test/hostile-input.spec.ts",
  "packages/validation/src/questionnaire.schema.ts",
  "packages/validation/test/mortgage-year.spec.ts",
  "packages/tax-engine/test/loss-ledger.spec.ts",
  "apps/api/test/param-wiring.spec.ts",
  "packages/tax-engine/test/mixed-couple.spec.ts",
  "packages/validation/test/mixed-couple.spec.ts",
  "apps/web/test/tax-calculator-view.spec.ts",
  "apps/web/test/fact-inclusion.spec.ts",
  "apps/web/test/questionnaire-view.spec.ts",
  "packages/design-tokens/test/translations.spec.ts",
  "apps/api/src/modules/admin/admin.controller.ts",
  "apps/api/src/common/guards/platform-admin.guard.ts",
  "apps/api/src/common/guards/household.guard.ts",
  "apps/api/src/common/auth/platform-admin.ts",
  "apps/api/src/modules/documents/documents.controller.ts",
  "apps/api/src/modules/documents/documents.service.ts",
  "apps/api/src/modules/facts/facts.controller.ts",
  "apps/api/src/modules/facts/facts.service.ts",
  "apps/api/src/modules/facts/fact-visibility.ts",
  "apps/api/src/modules/filing/filing.controller.ts",
  "apps/api/src/modules/freelance/freelance.controller.ts",
  "apps/api/src/modules/households/households.controller.ts",
  "packages/validation/src/household.schema.ts",
  "apps/web/src/lib/fact-inclusion.ts",
  "apps/web/src/components/FactsView.tsx",
  "apps/api/src/modules/questionnaire/questionnaire.controller.ts",
  "apps/web/src/components/DocumentsView.tsx",
  "apps/web/src/components/CameraScanModal.tsx",
  "apps/web/src/components/FreelanceBusinessView.tsx",
  "packages/api-client/src/client.ts",
  "apps/api/src/modules/notifications/notification-rules.ts",
  "apps/api/src/modules/notifications/notifications.service.ts",
  "apps/api/src/modules/notifications/notifications.controller.ts",
  "apps/api/src/modules/notifications/notifications.module.ts",
  "apps/api/test/notification-rules.spec.ts",
  "apps/api/test/return-version-history.spec.ts",
  "apps/api/test/assessment-dates.spec.ts",
  "apps/api/src/modules/households/households.service.ts",
  "apps/api/src/modules/households/households.module.ts",
  "apps/api/src/modules/filing/annex-pdf.service.ts",
  "apps/api/src/modules/filing/annex-pdf.builder.ts",
];
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const out = ts.transpileModule(src, {
    fileName: f,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const diags = out.diagnostics || [];
  if (diags.length) {
    bad++;
    console.log("FAIL", f);
    for (const d of diags) console.log("  ", ts.flattenDiagnosticMessageText(d.messageText, " "));
  } else {
    console.log("ok  ", f);
  }
}
process.exit(bad ? 1 : 0);

