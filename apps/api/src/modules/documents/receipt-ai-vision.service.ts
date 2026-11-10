import { Injectable, Logger } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { DocumentType, FactCategory } from '@luxtax/contracts';

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  snippet: string;
  category?: FactCategory;
}

export interface ReceiptAiExtractionResult {
  documentType: DocumentType;
  confidence: number;
  extractedSnippet: string;
  modelUsed: string;
  fields: ExtractedField[];
}

/**
 * Lower-case text with diacritics stripped (é → e, ü → u …).
 *
 * Document text arrives from OCR, from PDFs and from hand-typed samples, and the
 * same certificate spells "rémunération" both ways. Matching on the de-accented
 * form makes the keyword lists independent of that.
 */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

@Injectable()
export class ReceiptAiVisionService {
  private readonly logger = new Logger(ReceiptAiVisionService.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * Process document or receipt through the AI Model Route.
   * If custom multimodal AI endpoint (Gemini/OpenAI/Qwen-VL) is registered and active,
   * dispatches to vision model. Otherwise runs the deterministic OCR & receipt extraction engine.
   */
  async processReceiptOrDocument(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ReceiptAiExtractionResult> {
    // 1. Resolve active AI route
    const routes = await this.adminService.getModelRoutes();
    const receiptRoute = routes.find((r) => r.taskName === 'document.ocr.receipt_scan');
    const primaryModelId = receiptRoute?.primaryModelId || 'mdl-paddle-v3';

    // 2. Read text or metadata from image / PDF / text buffer
    const rawString = fileBuffer.toString('utf-8');
    const isImage = mimeType.startsWith('image/');

    // 3. Check for external Vision AI model execution if configured
    try {
      const models = await this.adminService.getModels();
      const activeModel = models.find((m) => m.id === primaryModelId);

      if (activeModel?.endpointUrl && activeModel.status === 'ACTIVE' && activeModel.capabilities.includes('VISION')) {
        const aiResult = await this.callExternalVisionModel(activeModel, fileBuffer, mimeType, fileName);
        if (aiResult) {
          return {
            ...aiResult,
            modelUsed: activeModel.displayName || activeModel.id,
          };
        }
      }
    } catch (err) {
      this.logger.warn(`External AI vision call failed, falling back to local extraction: ${err}`);
    }

    // 4. Fallback: Local deterministic multimodal & pattern extraction engine
    return this.extractLocally(rawString, fileName, isImage, primaryModelId);
  }

  /**
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
      // Both layouts occur: "101. Rémunération brute …" and
      // "Code 101 - Rémunération brute …". The code may be prefixed by the
      // word "Code" and is followed by a separator or the label itself.
      const linePattern = new RegExp(`^\\s*(?:code\\s*)?${code}\\b[^\\n]*$`, 'im');
      const line = linePattern.exec(text);
      if (!line) continue;

      const amounts = line[0].match(/\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}/g);
      if (!amounts || amounts.length === 0) continue;

      return {
        value: amounts[amounts.length - 1],
        snippet: line[0].trim().slice(0, 160),
      };
    }
    return null;
  }

  private async callExternalVisionModel(
    model: any,
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<ReceiptAiExtractionResult | null> {
    const base64Data = fileBuffer.toString('base64');
    const prompt = `You are a Luxembourg tax document and receipt specialist.
Analyze this scanned image or invoice (${fileName}).
Extract:
1. Document Type: one of FREELANCE_INVOICE, BUSINESS_EXPENSE, PROFIT_AND_LOSS_STATEMENT, VAT_RETURN, CHILDCARE_INVOICE, DONATION_CERTIFICATE, SALARY_CERTIFICATE, MORTGAGE_CERTIFICATE, INSURANCE_CERTIFICATE, or UNKNOWN.
2. Total amount in EUR.
3. Merchant / client / school / employer / organization name.
4. Transaction date.
5. Tax deductible field name:
   - "freelanceRevenue" for client invoices issued, freelance billings, consulting fees (Art 14 & 91 LIR)
   - "businessExpense" for business operating expenses (software subscriptions, hardware, office, coworking, travel, accounting, subcontracting)
   - "trainingCourseExpense" for courses, certifications, tuition, and professional training
   - "workRelatedExpense" for employee work equipment, laptop, travel, professional expenses
   - "medicalExpense" for doctor, dentist, pharmacy, hospital, optical invoices
   - "childcareExpense" for crèche, daycare, after-school care
   - "domesticServiceExpense" for cleaning, home help
   - "donationAmount" for charity donations (Art 112)
   - "grossSalary", "socialSecurity", "withholdingTax" for salary certificates
   - "mortgageInterest" for home loan statements
Return JSON with format:
{"documentType": "FREELANCE_INVOICE", "confidence": 0.95, "snippet": "...", "fields": [{"name": "freelanceRevenue", "value": "4500.00", "confidence": 0.95, "snippet": "..."}]}`;


    try {
      const response = await fetch(model.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model.modelIdentifier,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return null;
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return {
        documentType: parsed.documentType as DocumentType,
        confidence: parsed.confidence || 0.9,
        extractedSnippet: parsed.snippet || content.substring(0, 300),
        modelUsed: model.displayName,
        fields: parsed.fields || [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Deterministic local engine for Luxembourg receipts, crèche invoices, and tax certificates.
   */
  private extractLocally(
    rawText: string,
    fileName: string,
    isImage: boolean,
    modelUsed: string,
  ): ReceiptAiExtractionResult {
    const textLower = (rawText + ' ' + fileName).toLowerCase();
    // Taxpayers, employers and the ACD all produce documents with and without
    // accents ("CERTIFICAT DE REMUNERATION" vs "Certificat de Rémunération").
    // Keyword matching runs on the de-accented text so neither spelling is
    // missed — the sample this app ships is the unaccented one.
    const textPlain = stripAccents(textLower);
    const fields: ExtractedField[] = [];

    // --- A. CHILDCARE & CRÈCHE INVOICES (Frais de garde d'enfants) ---
    if (
      textLower.includes('crèche') ||
      textLower.includes('creche') ||
      textLower.includes('garde d') ||
      textLower.includes('garderie') ||
      textLower.includes('maison relais') ||
      textLower.includes('foyer de jour') ||
      textLower.includes('childcare') ||
      textLower.includes('babysitt')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'childcareExpense',
          value: amount.value,
          confidence: 0.95,
          snippet: amount.snippet,
          category: FactCategory.CHILDCARE_EXPENSE,
        });
      }

      return {
        documentType: DocumentType.CHILDCARE_INVOICE,
        confidence: 0.95,
        extractedSnippet: rawText.substring(0, 300) || `Scanned receipt: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }

    // --- B. CHARITABLE DONATIONS (Art. 112 L.I.R.) ---
    if (
      textLower.includes('don ') ||
      textLower.includes('dons') ||
      textLower.includes('donation') ||
      textLower.includes('libéralité') ||
      textLower.includes('croix-rouge') ||
      textLower.includes('caritas') ||
      textLower.includes('unicef')
    ) {
      // Find amount ignoring "art 112"
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\s*112/i, /code\s*112/i]);
      if (amount) {
        fields.push({
          name: 'donationAmount',
          value: amount.value,
          confidence: 0.94,
          snippet: amount.snippet,
          category: FactCategory.DONATION_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.DONATION_CERTIFICATE,
        confidence: 0.94,
        extractedSnippet: rawText.substring(0, 300) || `Scanned donation receipt: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }

    // --- C. SALARY CERTIFICATE (Certificat de Rémunération) ---
    if (
      textPlain.includes('certificat de remuneration') ||
      textPlain.includes('certificat de salaire') ||
      textPlain.includes('salary certificate') ||
      textPlain.includes('salary') ||
      textPlain.includes('remuneration') ||
      textPlain.includes('code 101') ||
      textPlain.includes('code 102')
    ) {
      // A certificat de rémunération is a printed table of numbered lines
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

      return {
        documentType: DocumentType.SALARY_CERTIFICATE,
        confidence: 0.95,
        extractedSnippet: rawText.substring(0, 300),
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- C2. PENSION CERTIFICATE (modèle 170) ---
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
        rawText.match(/(?:code\s*20[01]|pension\s*brute|rente\s*brute|montant\s*brut)[^\d]*([\d.,]+)/i) ||
        rawText.match(/([\d]+[.,][\d]{2})/);
      if (grossMatch) {
        fields.push({
          name: 'grossPension',
          value: this.normalizeAmount(grossMatch[1]),
          confidence: 0.94,
          snippet: grossMatch[0],
          category: FactCategory.PENSION_INCOME,
        });
      }

      const taxMatch = rawText.match(/(?:code\s*20[35]|retenue\s*d['’]impôt|withholding)[^\d]*([\d.,]+)/i);
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

    // --- D. MORTGAGE INTEREST (Attestation d'intérêts débiteurs) ---
    if (
      textLower.includes('intérêts débiteurs') ||
      textLower.includes('prêt immobilier') ||
      textLower.includes('mortgage') ||
      textLower.includes('emprunt')
    ) {
      const match = rawText.match(/(?:intérêts|total|montant)[^\d]*([\d.,]+)/i);
      if (match) {
        fields.push({
          name: 'mortgageInterest',
          value: this.normalizeAmount(match[1]),
          confidence: 0.9,
          snippet: match[0],
          category: FactCategory.MORTGAGE_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.MORTGAGE_CERTIFICATE,
        confidence: 0.9,
        extractedSnippet: rawText.substring(0, 300),
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- E1. THIRD-PILLAR PENSION (Art. 111bis / 111ter) ---
    // Detected before the generic insurance branch: these premiums are NOT part
    // of the EUR 672 Art. 111 envelope and must not be capped at 672.
    if (
      textLower.includes('prévoyance') ||
      textLower.includes('prevoyance') ||
      textLower.includes('111bis') ||
      textLower.includes('111 ter') ||
      textLower.includes('épargne retraite') ||
      textLower.includes('epargne retraite') ||
      textLower.includes('pepp')
    ) {
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\s*111bis/i]);
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
        extractedSnippet: rawText.substring(0, 300),
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- E2. PRIVATE INSURANCE (Art. 111, EUR 672 envelope) ---
    if (textLower.includes('assurance') || textLower.includes('art 111')) {
      const amount = this.extractAmountExcludingPatterns(rawText, [/art(?:icle)?\s*111(?:bis)?/i]);
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
        extractedSnippet: rawText.substring(0, 300),
        modelUsed: `${modelUsed} (Docling AI Parser)`,
        fields,
      };
    }

    // --- F. COURSES & PROFESSIONAL TRAINING (Formation Continue) ---
    if (
      textLower.includes('formation') ||
      textLower.includes('training') ||
      textLower.includes('course') ||
      textLower.includes('cours') ||
      textLower.includes('séminaire') ||
      textLower.includes('seminar') ||
      // NOT 'certif': it is a substring of "certificat", so every
      // certificate — a salary certificate included — was read as a
      // training invoice and produced a bogus trainingCourseExpense.
      textPlain.includes('certificat de formation') ||
      textLower.includes('webinar') ||
      textLower.includes('tuition') ||
      textLower.includes('atelier') ||
      textLower.includes('workshop')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'trainingCourseExpense',
          value: amount.value,
          confidence: 0.94,
          snippet: amount.snippet,
          category: FactCategory.OTHER_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.CHILDCARE_INVOICE,
        confidence: 0.94,
        extractedSnippet: rawText.substring(0, 300) || `Training Course Invoice: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }

    // --- G. WORK EXPENSES & PROFESSIONAL EQUIPMENT (Frais d'obtention) ---
    if (
      textLower.includes('travail') ||
      textLower.includes('télétravail') ||
      textLower.includes('work') ||
      textLower.includes('ordinateur') ||
      textLower.includes('laptop') ||
      textLower.includes('screen') ||
      textLower.includes('bureau') ||
      textLower.includes('office') ||
      textLower.includes('équipement professionnel') ||
      textLower.includes('outillage') ||
      textLower.includes('déplacement professionnel') ||
      textLower.includes('cotisation professionnelle') ||
      textLower.includes('syndicat') ||
      textLower.includes('frais d\'obtention')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'workRelatedExpense',
          value: amount.value,
          confidence: 0.93,
          snippet: amount.snippet,
          category: FactCategory.OTHER_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.CHILDCARE_INVOICE,
        confidence: 0.93,
        extractedSnippet: rawText.substring(0, 300) || `Work Expense Receipt: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }

    // --- H. MEDICAL & HEALTHCARE INVOICES (Dépenses extraordinaires Art. 127) ---
    if (
      textLower.includes('médical') ||
      textLower.includes('medical') ||
      textLower.includes('docteur') ||
      textLower.includes('doctor') ||
      textLower.includes('médecin') ||
      textLower.includes('dentiste') ||
      textLower.includes('dentist') ||
      textLower.includes('pharmacie') ||
      textLower.includes('pharmacy') ||
      textLower.includes('cns') ||
      textLower.includes('clinique') ||
      textLower.includes('hôpital') ||
      textLower.includes('hospital') ||
      textLower.includes('optique') ||
      textLower.includes('lunettes') ||
      textLower.includes('ordonnance')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'medicalExpense',
          value: amount.value,
          confidence: 0.92,
          snippet: amount.snippet,
          category: FactCategory.OTHER_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.CHILDCARE_INVOICE,
        confidence: 0.92,
        extractedSnippet: rawText.substring(0, 300) || `Medical Invoice: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }

    // --- I. FREELANCE CLIENT INVOICE & REVENUE (Articles 14 & 91 L.I.R.) ---
    if (
      textLower.includes('freelance') ||
      textLower.includes('honoraires') ||
      textLower.includes('prestation de service') ||
      textLower.includes('facture client') ||
      textLower.includes('client invoice') ||
      textLower.includes('bill to') ||
      textLower.includes('consulting fee') ||
      textLower.includes('daily rate') ||
      textLower.includes('taux journalier') ||
      textLower.includes('tjm') ||
      fileName.toLowerCase().includes('freelance') ||
      fileName.toLowerCase().includes('invoice_issued') ||
      fileName.toLowerCase().includes('facture_emise')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'freelanceRevenue',
          value: amount.value,
          confidence: 0.96,
          snippet: amount.snippet,
          category: FactCategory.FREELANCE_INCOME,
        });
      }

      return {
        documentType: DocumentType.FREELANCE_INVOICE,
        confidence: 0.96,
        extractedSnippet: rawText.substring(0, 300) || `Freelance Client Invoice: ${fileName}`,
        modelUsed: `${modelUsed} (Freelance AI Parser)`,
        fields,
      };
    }

    // --- J. BUSINESS & OPERATING EXPENSES (Frais d'exploitation Art 14/91) ---
    if (
      textLower.includes('frais d\'exploitation') ||
      textLower.includes('dépense professionnelle') ||
      textLower.includes('business expense') ||
      textLower.includes('saas') ||
      textLower.includes('aws') ||
      textLower.includes('cloud') ||
      textLower.includes('github') ||
      textLower.includes('jetbrains') ||
      textLower.includes('figma') ||
      textLower.includes('notion') ||
      textLower.includes('coworking') ||
      textLower.includes('fiduciaire') ||
      textLower.includes('comptable') ||
      textLower.includes('hardware') ||
      textLower.includes('laptop') ||
      fileName.toLowerCase().includes('business_expense') ||
      fileName.toLowerCase().includes('freelance_expense')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'businessExpense',
          value: amount.value,
          confidence: 0.94,
          snippet: amount.snippet,
          category: FactCategory.BUSINESS_EXPENSE,
        });
      }

      return {
        documentType: DocumentType.BUSINESS_EXPENSE,
        confidence: 0.94,
        extractedSnippet: rawText.substring(0, 300) || `Business Operating Expense: ${fileName}`,
        modelUsed: `${modelUsed} (Freelance AI Parser)`,
        fields,
      };
    }

    // --- K. VAT RETURNS & TAX ASSESSMENTS (Déclaration TVA / Acomptes) ---
    if (
      textLower.includes('tva') ||
      textLower.includes('vat return') ||
      textLower.includes('déclaration périodique') ||
      textLower.includes('enregistrement et domaines')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'vatAmount',
          value: amount.value,
          confidence: 0.93,
          snippet: amount.snippet,
          category: FactCategory.OTHER_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.VAT_RETURN,
        confidence: 0.93,
        extractedSnippet: rawText.substring(0, 300) || `VAT Declaration: ${fileName}`,
        modelUsed: `${modelUsed} (VAT AI Parser)`,
        fields,
      };
    }

    // --- L. PROFIT & LOSS STATEMENT (Compte de résultat / Bilan) ---
    if (
      textLower.includes('compte de résultat') ||
      textLower.includes('bilan') ||
      textLower.includes('profit and loss') ||
      textLower.includes('p&l') ||
      textLower.includes('recettes et dépenses')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'freelanceRevenue',
          value: amount.value,
          confidence: 0.95,
          snippet: amount.snippet,
          category: FactCategory.FREELANCE_INCOME,
        });
      }

      return {
        documentType: DocumentType.PROFIT_AND_LOSS_STATEMENT,
        confidence: 0.95,
        extractedSnippet: rawText.substring(0, 300) || `P&L Statement: ${fileName}`,
        modelUsed: `${modelUsed} (P&L AI Parser)`,
        fields,
      };
    }

    // --- M. GENERAL RECEIPT / ARTISAN / SERVICE INVOICE ---
    if (
      textLower.includes('facture') ||
      textLower.includes('invoice') ||
      textLower.includes('reçu') ||
      textLower.includes('receipt') ||
      textLower.includes('ticket') ||
      textLower.includes('artisan') ||
      textLower.includes('rénovation') ||
      textLower.includes('travaux') ||
      textLower.includes('net a payer') ||
      textLower.includes('total eur')
    ) {
      const amount = this.extractAmount(rawText);
      if (amount) {
        fields.push({
          name: 'invoiceExpense',
          value: amount.value,
          confidence: 0.88,
          snippet: amount.snippet,
          category: FactCategory.OTHER_DEDUCTION,
        });
      }

      return {
        documentType: DocumentType.CHILDCARE_INVOICE,
        confidence: 0.88,
        extractedSnippet: rawText.substring(0, 300) || `Invoice/Receipt: ${fileName}`,
        modelUsed: `${modelUsed} (Receipt AI Engine)`,
        fields,
      };
    }


    return {
      documentType: DocumentType.UNKNOWN,
      confidence: 0.5,
      extractedSnippet: rawText.substring(0, 300) || `Document: ${fileName}`,
      modelUsed,
      fields: [],
    };
  }

  private extractAmount(raw: string): { value: string; snippet: string } | null {
    // Looks for patterns like "250.00 EUR", "EUR 450.00", "Total EUR 450.00", "Net a payer 450.00"
    const regexes = [
      /([\d]+[.,][\d]{2})\s*(?:eur|€)/i,
      /(?:eur|€)\s*([\d]+[.,][\d]{2})/i,
      /(?:total|net\s*à\s*payer|montant|somme|don)[^\d]*([\d]+[.,][\d]{2})/i,
      /(?:total|net\s*à\s*payer|montant|somme|don)[^\d]*([\d.,]+)/i,
      /([\d]+[.,][\d]{2})/,
    ];

    for (const rx of regexes) {
      const match = raw.match(rx);
      if (match) {
        const val = this.normalizeAmount(match[1]);
        const num = Number(val);
        // Avoid treating a calendar tax year (e.g., 2024, 2025, 2026, 2027) as an amount unless specified with decimals
        const isYear = num >= 2020 && num <= 2030 && !match[1].includes('.') && !match[1].includes(',');
        if (num > 0 && !isYear) {
          return { value: val, snippet: match[0] };
        }
      }
    }
    return null;
  }

  private extractAmountExcludingPatterns(
    raw: string,
    excludeList: RegExp[],
  ): { value: string; snippet: string } | null {
    // Strip out excluded patterns (like "Art 112") before finding money amounts
    let sanitized = raw;
    for (const ex of excludeList) {
      sanitized = sanitized.replace(ex, ' ');
    }
    return this.extractAmount(sanitized);
  }

  private normalizeAmount(raw: string): string {
    const clean = raw.replace(/\s/g, '').replace(/,/g, '.');
    const num = parseFloat(clean);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }
}
