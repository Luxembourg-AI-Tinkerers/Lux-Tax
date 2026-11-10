import io

p = r"B:\B\tax-app\apps\api\test\receipt-scanning.e2e-spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = """    expect(confirmRes.statusCode).toBe(201);
    const confirmed = JSON.parse(confirmRes.payload);
    expect(confirmed.id).toBeDefined();
    expect(confirmed.extractedFactId).toBe(unconfirmed.id);
    // The scan was promoted before confirmation, so the fact may join the return.
    expect(confirmed.isIncludedInReturn).toBe(true);
  });
"""
new = """    expect(confirmRes.statusCode).toBe(201);
    const confirmed = JSON.parse(confirmRes.payload);
    expect(confirmed.id).toBeDefined();
    expect(confirmed.extractedFactId).toBe(unconfirmed.id);
    // The scan was promoted before confirmation, so the fact may join the return.
    expect(confirmed.isIncludedInReturn).toBe(true);

    // M10: the snippet the model read exists only for the review. Once no fact of
    // the document is left unconfirmed, the text and the raw model JSON are
    // cleared — a health-insurance certificate must not keep its text for the
    // lifetime of the workspace.
    const documentId = unconfirmed.documentId as string;
    const stillUnconfirmed = await prisma.extractedFact.count({
      where: { documentId, isConfirmed: false },
    });
    if (stillUnconfirmed === 0) {
      const extraction = await prisma.documentExtraction.findFirst({
        where: { documentId },
        select: { extractedText: true, rawJson: true },
      });
      expect(extraction).not.toBeNull();
      expect(extraction?.extractedText).toBeNull();
      expect(extraction?.rawJson).toBeNull();
    }
  });
"""
assert t.count(old) == 1, "confirm block"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("receipt spec: retention assertion added")
