import io
p = "apps/api/src/modules/documents/receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """    // --- D. MORTGAGE INTEREST (Attestation d'intérêts débiteurs) ---"""
block = """    // --- C2. PENSION CERTIFICATE (modèle 170) ---
    // Guarded against the third-pillar contract branch: a prévoyance document
    // mentions "pension" but belongs to Art. 111bis.
    const looksLikeThirdPillar =
      textLower.includes('prévoyance') ||
      textLower.includes('prevoyance') ||
      textLower.includes('111bis') ||
      textLower.includes('épargne retraite') ||
      textLower.includes('epargne retraite');

    if (
      !looksLikeThirdPillar &&
      (textLower.includes('certificat de pension') ||
        textLower.includes('modèle 170') ||
        textLower.includes('modele 170') ||
        textLower.includes('caisse de pension') ||
        textLower.includes('pension ou rente') ||
        textLower.includes('rentes et pensions'))
    ) {
      const grossMatch =
        rawText.match(/(?:code\\s*20[01]|pension\\s*brute|rente\\s*brute|montant\\s*brut)[^\\d]*([\\d.,]+)/i) ||
        rawText.match(/([\\d]+[.,][\\d]{2})/);
      if (grossMatch) {
        fields.push({
          name: 'grossPension',
          value: this.normalizeAmount(grossMatch[1]),
          confidence: 0.94,
          snippet: grossMatch[0],
          category: FactCategory.PENSION_INCOME,
        });
      }

      const taxMatch = rawText.match(/(?:code\\s*20[35]|retenue\\s*d['’]impôt|withholding)[^\\d]*([\\d.,]+)/i);
      if (taxMatch) {
        fields.push({
          name: 'withholdingTax',
          value: this.normalizeAmount(taxMatch[1]),
          confidence: 0.93,
          snippet: taxMatch[0],
          category: FactCategory.PENSION_INCOME,
        });
      }

      return {
        documentType: DocumentType.PENSION_CERTIFICATE,
        confidence: 0.94,
        extractedSnippet: rawText.substring(0, 300),
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- D. MORTGAGE INTEREST (Attestation d'intérêts débiteurs) ---"""
assert s.count(anchor) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(anchor, block).replace("\n", "\r\n"))
print("ok")
