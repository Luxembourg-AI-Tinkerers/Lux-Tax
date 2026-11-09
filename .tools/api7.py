import io

# 1) schema: evidence history column
p = "apps/api/prisma/schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  myGuichetGuideJson Json          @default("[]")
  packageSha256      String"""
new = """  myGuichetGuideJson Json          @default("[]")
  packageSha256      String
  /// Append-only evidence index: { sha256, generatedAt, supersededAt? }[]. The last
  /// entry without supersededAt is the package currently in force (API-7).
  historyJson        Json          @default("[]")"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# 2) service: guard + append history
p2 = "apps/api/src/modules/filing/filing.service.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

def rep(old, new):
    global s2
    assert s2.count(old) == 1, (s2.count(old), old[:80])
    s2 = s2.replace(old, new)

rep("""import { assertFilingYearAllowed, FilingPackageNotAllowedError } from './filing-year-guard';""",
"""import { assertFilingYearAllowed, FilingPackageNotAllowedError } from './filing-year-guard';
import {
  appendPackageEvidence,
  assertPackageRegenerationAllowed,
  FilingPackageImmutableError,
  type PackageEvidenceEntry,
} from './filing-package-evidence';""")

rep("""    const filingPackage = await this.prisma.filingPackage.upsert({
      where: { returnVersionId: returnVersion.id },
      create: {
        returnVersionId: returnVersion.id,
        taxYear: workspace.taxYear,
        taxClass: (workspace.taxClass as TaxClass) || TaxClass.CLASS_1,
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },
    });""",
"""    // API-7: the package is evidence once the return is filed, and every
    // regeneration is recorded instead of overwriting the previous hash.
    const existingFilingRecord = await this.prisma.filingRecord.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    try {
      assertPackageRegenerationAllowed(Boolean(existingFilingRecord));
    } catch (error) {
      if (error instanceof FilingPackageImmutableError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const existingPackage = returnVersion.filingPackage;
    const generatedAt = new Date().toISOString();
    const history = appendPackageEvidence(
      (existingPackage?.historyJson as unknown as PackageEvidenceEntry[]) ?? [],
      { sha256: packageSha256, generatedAt },
    );

    const filingPackage = await this.prisma.filingPackage.upsert({
      where: { returnVersionId: returnVersion.id },
      create: {
        returnVersionId: returnVersion.id,
        taxYear: workspace.taxYear,
        taxClass: (workspace.taxClass as TaxClass) || TaxClass.CLASS_1,
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
        historyJson: history as any,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
        historyJson: history as any,
      },
    });""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
