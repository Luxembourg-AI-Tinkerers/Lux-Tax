import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# Assessment: one per workspace and tax year, enforced by the database.
old = """  workspace             TaxYearWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("assessments")"""
new = """  workspace             TaxYearWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  /// One assessment notice per declarable year: a second import is an amendment,
  /// not a second row. Enforced here because the service alone could not stop two
  /// concurrent imports.
  @@unique([workspaceId, taxYear])
  @@index([workspaceId])
  @@map("assessments")"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# Drop the phantom "encrypted" column: nothing ever wrote or read it.
old_col = """  matriculeEncrypted String?"""
assert s.count(old_col) == 1, s.count(old_col)
s = s.replace(
    old_col,
    """  // The ACD matricule is not stored yet. A column named "encrypted" that no code
  // ever encrypts is worse than no column: when it is added it must be sealed
  // with a real AEAD (see auth/secret-box.ts) and documented as such.""",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("schema ok")
