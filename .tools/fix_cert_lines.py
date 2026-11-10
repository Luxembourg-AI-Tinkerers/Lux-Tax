import io

p = r"B:\B\tax-app\apps\api\src\modules\documents\receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# Locate the salary branch body: from the gross match to just before `return`.
start = s.index("      const grossMatch =")
end = s.index("      return {\n        documentType: DocumentType.SALARY_CERTIFICATE", start)

new_body = """      // A certificat de rémunération is a printed table of numbered lines
      // ("101. Rémunération brute … 76800.00 EUR"). Parsing it by prose failed
      // as soon as the sender dropped an accent — "Retenue d'impot" did not
      // match /retenue d'impôt/, so the withholding and the mortgage interest
      // of the app's own sample were silently lost. Matching the line number
      // instead is accent-, wording- and language-independent.
      const grossMatch = this.codeAmount(rawText, ['101', '102']);
      if (grossMatch) {
        fields.push({
          name: 'grossSalary',
          value: this.normalizeAmount(grossMatch.value),
          confidence: 0.95,
          snippet: grossMatch.snippet,
          category: FactCategory.EMPLOYMENT_INCOME,
        });
      }

      const socialMatch = this.codeAmount(rawText, ['103']);
      if (socialMatch) {
        fields.push({
          name: 'socialSecurity',
          value: this.normalizeAmount(socialMatch.value),
          confidence: 0.95,
          snippet: socialMatch.snippet,
        });
      }

      const taxMatch = this.codeAmount(rawText, ['105']);
      if (taxMatch) {
        fields.push({
          name: 'withholdingTax',
          value: this.normalizeAmount(taxMatch.value),
          confidence: 0.95,
          snippet: taxMatch.snippet,
        });
      }

      // Line 141 on a 160 is the deductible owner-occupier interest. It is
      // extracted here so it is not silently dropped; the certificate's own
      // mortgage document carries the same figure, and the user confirms once.
      const mortgageMatch = this.codeAmount(rawText, ['141']);
      if (mortgageMatch) {
        fields.push({
          name: 'mortgageInterest',
          value: this.normalizeAmount(mortgageMatch.value),
          confidence: 0.9,
          snippet: mortgageMatch.snippet,
          category: FactCategory.MORTGAGE_INTEREST,
        });
      }

"""

s = s[:start] + new_body + s[end:]

# Add the helper method just before processReceiptOrDocument's sibling helpers.
anchor = "  private async callExternalVisionModel("
helper = """  /**
   * Read the amount printed on a numbered line of a certificate, e.g.
   * "105. Retenue d'impôt sur traitements et salaires: 13950.00 EUR".
   *
   * Returns the LAST number on that line, which is the amount in every layout
   * seen so far (the label may itself contain numbers such as "Art. 111").
   */
  private codeAmount(
    text: string,
    codes: readonly string[],
  ): { value: string; snippet: string } | null {
    for (const code of codes) {
      const linePattern = new RegExp(`^\\\\s*${code}\\\\s*[.):-]?[^\\\\n]*$`, 'im');
      const line = linePattern.exec(text);
      if (!line) continue;

      const amounts = line[0].match(/\\d{1,3}(?:[ .,]\\d{3})*(?:[.,]\\d{2})|\\d+[.,]\\d{2}/g);
      if (!amounts || amounts.length === 0) continue;

      return {
        value: amounts[amounts.length - 1],
        snippet: line[0].trim().slice(0, 160),
      };
    }
    return null;
  }

"""
assert s.count(anchor) == 1
s = s.replace(anchor, helper + anchor)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
