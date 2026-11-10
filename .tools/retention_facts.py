import io

# --- 1. facts.service.ts: clear the raw snippet once fully confirmed ---------
p = r"B:\B\tax-app\apps\api\src\modules\facts\facts.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

anchor = """    if (input.extractedFactId) {
      await this.prisma.extractedFact.update({
        where: { id: input.extractedFactId },
        data: {
          isConfirmed: true,
          confirmedAt: new Date(),
          confirmedById: userId,
        },
      });
    }
"""
replacement = """    if (input.extractedFactId) {
      await this.prisma.extractedFact.update({
        where: { id: input.extractedFactId },
        data: {
          isConfirmed: true,
          confirmedAt: new Date(),
          confirmedById: userId,
        },
      });

      // M10 data minimisation: the extracted snippet and the model's raw JSON are
      // held only so the user can check what was recognised. Once every fact of
      // this document is confirmed they are redundant, so they are cleared —
      // a health-insurance certificate must not leave its text in the database
      // for the lifetime of the workspace.
      const remaining = await this.prisma.extractedFact.count({
        where: { documentId: sourceDocumentId, isConfirmed: false },
      });
      if (remaining === 0 && sourceDocumentId) {
        await this.prisma.documentExtraction.updateMany({
          where: { documentId: sourceDocumentId },
          data: { extractedText: null, rawJson: Prisma.JsonNull },
        });
      }
    }
"""
assert t.count(anchor) == 1, "confirm block"
t = t.replace(anchor, replacement, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("facts.service.ts: extraction text cleared when fully confirmed")
