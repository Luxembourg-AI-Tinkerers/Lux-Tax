import io
p = "apps/api/prisma/schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""  notifications       Notification[]""",
"""  notifications       Notification[]
  calculationSnapshots CalculationSnapshot[]""")

rep("""model TaxYearWorkspace {""",
"""/// Append-only history of tax calculations (API-9). `TaxYearWorkspace.calculationResult`
/// keeps the latest result for reads; every calculation also lands here so the
/// trajectory of a return can be audited.
model CalculationSnapshot {
  id                 String       @id @default(uuid()) @db.Uuid
  workspaceId        String       @db.Uuid
  taxYear            Int
  taxClass           TaxClass
  rulePackageVersion String
  /// SHA-256 of the canonical JSON of `resultJson`.
  resultSha256       String
  resultJson         Json
  createdById        String?      @db.Uuid
  createdAt          DateTime     @default(now())

  workspace          TaxYearWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt])
  @@map("calculation_snapshots")
}

model TaxYearWorkspace {""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
