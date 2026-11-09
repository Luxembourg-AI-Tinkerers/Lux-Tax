import io

# ---------- 1) extractor: 111bis must not fall into the 672 envelope
p = "apps/api/src/modules/documents/receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    // --- E. INSURANCE & PENSION (Art. 111 / 111bis) ---
    if (textLower.includes('assurance') || textLower.includes('prévoyance') || textLower.includes('art 111')) {
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\\s*111(?:bis)?/i]);
      if (amount) {
        fields.push({
          name: 'insurancePremium',
          value: amount.value,
          confidence: 0.9,
          snippet: amount.snippet,
          category: FactCategory.INSURANCE_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.INSURANCE_CERTIFICATE,
        confidence: 0.9,
        extractedSnippet: rawText.substring(0, 300) || `Scanned insurance certificate: ${fileName}`,
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }"""
new = """    // --- E1. THIRD-PILLAR PENSION (Art. 111bis / 111ter) ---
    // Must be detected before the generic insurance branch: these premiums are
    // NOT part of the EUR 672 Art. 111 envelope.
    if (
      textLower.includes('prévoyance') ||
      textLower.includes('prevoyance') ||
      textLower.includes('111bis') ||
      textLower.includes('111 ter') ||
      textLower.includes('art 111bis') ||
      textLower.includes('epargne retraite') ||
      textLower.includes('épargne retraite') ||
      textLower.includes('pepp')
    ) {
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\\s*111bis/i]);
      if (amount) {
        fields.push({
          name: 'pensionSavings111bis',
          value: amount.value,
          confidence: 0.93,
          snippet: amount.snippet,
          category: FactCategory.PENSION_SAVINGS_111BIS,
        });
      }

      return {
        documentType: DocumentType.INSURANCE_CERTIFICATE,
        confidence: 0.93,
        extractedSnippet: rawText.substring(0, 300) || `Scanned pension contract: ${fileName}`,
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- E2. PRIVATE INSURANCE (Art. 111, EUR 672 envelope) ---
    if (textLower.includes('assurance') || textLower.includes('art 111')) {
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\\s*111(?:bis)?/i]);
      if (amount) {
        fields.push({
          name: 'insurancePremium',
          value: amount.value,
          confidence: 0.9,
          snippet: amount.snippet,
          category: FactCategory.INSURANCE_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.INSURANCE_CERTIFICATE,
        confidence: 0.9,
        extractedSnippet: rawText.substring(0, 300) || `Scanned insurance certificate: ${fileName}`,
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("extractor ok")
