import { Injectable, Logger } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { DocumentType, FactCategory } from '@luxtax/contracts';
import { readDocumentText } from './text/document-text';
import { extractPdfPageImages, type PdfPageImage } from './text/pdf-images';
import { TesseractCliOcrEngine, type OcrEngine } from './ocr/ocr-engine';
import {
  buildVisionPrompt,
  parseVisionExtraction,
  resolveVisionChain,
  type VisionField,
} from './extraction/vision-contract';

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  snippet: string;
  category?: FactCategory;
}

/** Where the figures came from. Persisted so the UI can explain a document. */
export type ExtractionSource =
  | 'TEXT_LAYER'
  | 'EMBEDDED_TEXT'
  | 'PLAIN_TEXT'
  | 'VISION'
  | 'OCR'
  | 'NONE';

export interface ReceiptAiExtractionResult {
  documentType: DocumentType;
  confidence: number;
  extractedSnippet: string;
  modelUsed: string;
  fields: ExtractedField[];
  source: ExtractionSource;
  pageCount: number;
  /** True when nothing could be read and the user must act (OCR or manual entry). */
  needsOcr: boolean;
  /** User-facing explanation when `needsOcr` is true, or when a model misbehaved. */
  reason: string | null;
  textCharacters: number;
  /** Field names a model returned that this application cannot store. */
  rejectedFields: string[];
}

export { stripAccents };

/**
 * Lower-case text with diacritics stripped (é → e, ü → u …).
 *
 * Document text arrives from OCR, from PDFs and from hand-typed samples, and the
 * same certificate spells "rémunération" both ways. Matching on the de-accented
 * form makes the keyword lists independent of that.
 */
function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const VISION_TIMEOUT_MS = 20_000;

@Injectable()
export class ReceiptAiVisionService {
  private readonly logger = new Logger(ReceiptAiVisionService.name);

  constructor(
    private readonly adminService: AdminService,
    // Supplied by the module's factory (and by tests) as any implementation of
    // the port. The default keeps a plain `new ReceiptAiVisionService(admin)`
    // working, with OCR simply unconfigured.
    private readonly ocrEngine: OcrEngine = new TesseractCliOcrEngine(),
  ) {}

  /**
   * Turns an uploaded document into candidate tax facts.
   *
   * Three outcomes, and the third is the one that used to lie:
   *  1. the file has a text layer (PDF) or is text → the deterministic parser
   *     reads it, and every figure carries the printed line it came from;
   *  2. it has no text layer (photo, scan) and a vision model is registered →
   *     the model reads it, through a validated JSON contract;
   *  3. neither → the document is stored, marked as needing OCR, and the user
   *     is told so. It is never silently reported as "no facts found".
   */
  async processReceiptOrDocument(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    hint: DocumentType | null = null,
  ): Promise<ReceiptAiExtractionResult> {
    const documentText = readDocumentText(fileBuffer, mimeType);

    if (!documentText.needsOcr) {
      const parsed = this.extractLocally(documentText.text, fileName, documentText.source);
      return { ...parsed, pageCount: documentText.pageCount, textCharacters: documentText.detail.characters };
    }

    const vision = await this.tryVisionModels(fileBuffer, fileName, mimeType, hint);
    if (vision) {
      return { ...vision, pageCount: documentText.pageCount, textCharacters: documentText.detail.characters };
    }

    // A model endpoint is optional; a local OCR run is not. This is the path a
    // photographed receipt takes on a machine with no model registered.
    const ocr = await this.tryOcr(fileBuffer, fileName, mimeType);
    if (ocr) {
      return { ...ocr, pageCount: documentText.pageCount, textCharacters: ocr.textCharacters };
    }

    return {
      documentType: DocumentType.UNKNOWN,
      confidence: 0,
      extractedSnippet: '',
      modelUsed: 'none',
      fields: [],
      source: 'NONE',
      pageCount: documentText.pageCount,
      needsOcr: true,
      reason:
        documentText.reason ??
        'This document could not be read. Configure an OCR engine or a vision model, or enter the figures manually.',
      textCharacters: documentText.detail.characters,
      rejectedFields: [],
    };
  }

  /**
   * Calls the registered vision models in route order until one returns a
   * usable answer. A model that answers with prose, or with a field the engine
   * does not know, is a failed attempt — not a stored fact.
   */
  private async tryVisionModels(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    hint: DocumentType | null,
  ): Promise<ReceiptAiExtractionResult | null> {
    let chain;
    try {
      const routes = await this.adminService.getModelRoutes();
      const models = await this.adminService.getModels();
      const route = routes.find((candidate) => candidate.taskName === 'document.ocr.receipt_scan') ?? null;
      chain = resolveVisionChain(route, models);
    } catch (error) {
      this.logger.warn(`Could not resolve the OCR model chain: ${error}`);
      return null;
    }

    if (chain.length === 0) return null;

    const prompt = buildVisionPrompt(fileName, hint);
    const failures: string[] = [];

    for (const model of chain) {
      try {
        const content = await this.callModel(model, fileBuffer, mimeType, prompt);
        if (!content) {
          failures.push(`${model.displayName}: no answer`);
          continue;
        }

        const parsed = parseVisionExtraction(content);
        if (!parsed) {
          failures.push(`${model.displayName}: unreadable answer`);
          continue;
        }

        return {
          documentType: parsed.documentType,
          confidence: parsed.confidence,
          extractedSnippet: parsed.extractedSnippet,
          modelUsed: model.displayName,
          fields: parsed.fields.map((field) => this.toExtractedField(field)),
          source: 'VISION',
          pageCount: 1,
          needsOcr: parsed.fields.length === 0,
          reason:
            parsed.fields.length === 0
              ? 'The OCR model read this document but found no amount to extract. Check the scan or enter the figures manually.'
              : null,
          textCharacters: 0,
          rejectedFields: parsed.rejectedFields,
        };
      } catch (error) {
        failures.push(`${model.displayName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.logger.warn(`Every OCR model failed for ${fileName}: ${failures.join('; ')}`);
    return null;
  }

  /**
   * Reads pixels with the configured local OCR engine.
   *
   * Returns `null` when this is not an image, or when the engine is absent or
   * broken — the caller then reports the document as unreadable with the reason
   * the engine gave. A successful read goes through the same deterministic
   * parser as a PDF text layer, so a figure from a photo carries the printed
   * line it came from exactly like a text-layer figure does.
   */
  private async tryOcr(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<Omit<ReceiptAiExtractionResult, 'pageCount'> | null> {
    const pageImages = this.pageImagesFor(fileBuffer, mimeType);
    if (pageImages.length === 0) return null;

    const texts: string[] = [];
    let sawFailure = false;
    let emptyReason: string | null = null;

    for (const page of pageImages) {
      const result = await this.ocrEngine.recognize(page.data, page.mimeType);

      if (result.status === 'NOT_CONFIGURED') {
        // The operator has to fix this, and the message has to say what to set.
        return this.unreadable(
          `${result.reason ?? 'No OCR engine is configured.'} Alternatively, register a vision model in the admin console.`,
          result.engine,
        );
      }

      if (result.status === 'TEXT') {
        texts.push(result.text);
        continue;
      }

      if (result.status === 'EMPTY') {
        emptyReason = result.reason;
        continue;
      }

      if (result.status === 'FAILED') {
        // The engine's own message is Leptonica's ("Corrupt JPEG data…"), which
        // is for the log, not for the person holding the receipt.
        sawFailure = true;
        this.logger.warn(`Local OCR failed for ${fileName}: ${result.reason}`);
      }
    }

    if (texts.length === 0) {
      // A blank page and a broken file need different advice.
      return this.unreadable(
        sawFailure
          ? 'The OCR engine could not read this file. The scan may be damaged, or too small or blurry to recognise. Try a sharper photo or enter the figures manually.'
          : emptyReason ?? 'The OCR engine found no readable text in this document.',
        this.ocrEngine.name,
      );
    }

    // Pages are joined with a newline: the parser reads line by line, and a
    // figure that continues the previous page would otherwise merge into it.
    const text = texts.join('\n');
    const parsed = this.extractLocally(text, fileName, 'OCR');
    return { ...parsed, textCharacters: text.length, rejectedFields: [] };
  }

  /**
   * The images OCR should look at, for either kind of upload.
   *
   * An image is one page. A PDF has no pixels of its own unless it is a scan, in
   * which case each page carries one image XObject — that is what this pulls
   * out. A vector PDF with a text layer never reaches here, and a vector PDF
   * without one yields nothing, which the caller reports honestly.
   */
  private pageImagesFor(fileBuffer: Buffer, mimeType: string): PdfPageImage[] {
    if (mimeType.startsWith('image/')) {
      return [{ pageIndex: 0, mimeType: mimeType as 'image/jpeg' | 'image/png', data: fileBuffer, width: 0, height: 0 }];
    }

    if (mimeType === 'application/pdf') {
      const images = extractPdfPageImages(fileBuffer);
      if (images.length > 0) {
        this.logger.log(`Rendering ${images.length} page image(s) from a scanned PDF for OCR`);
      }
      return images;
    }

    return [];
  }

  /** A stored-but-unread document, with the reason the reader gave. */
  private unreadable(reason: string | null, engine: string): Omit<ReceiptAiExtractionResult, 'pageCount'> {
    return {
      documentType: DocumentType.UNKNOWN,
      confidence: 0,
      extractedSnippet: '',
      modelUsed: engine,
      fields: [],
      source: 'NONE',
      needsOcr: true,
      reason,
      textCharacters: 0,
      rejectedFields: [],
    };
  }

  /** POSTs the document to an OpenAI-compatible chat completion endpoint. */
  private async callModel(
    model: { endpointUrl?: string; modelIdentifier: string; apiKey?: string },
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<string | null> {
    if (!model.endpointUrl) return null;

    const response = await fetch(model.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelIdentifier,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${fileBuffer.toString('base64')}` },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  }

  /** Attaches the fact category the engine expects to a model-provided field. */
  private toExtractedField(field: VisionField): ExtractedField {
    const categoryByField: Record<string, FactCategory> = {
      grossSalary: FactCategory.EMPLOYMENT_INCOME,
      socialSecurity: FactCategory.EMPLOYMENT_INCOME,
      withholdingTax: FactCategory.EMPLOYMENT_INCOME,
      fraisObtention: FactCategory.EMPLOYMENT_INCOME,
      grossPension: FactCategory.PENSION_INCOME,
      capitalIncome: FactCategory.CAPITAL_INCOME,
      qualifyingDividend: FactCategory.CAPITAL_INCOME,
      rentalGross: FactCategory.RENTAL_INCOME,
      rentalCharges: FactCategory.RENTAL_INCOME,
      foreignIncome: FactCategory.FOREIGN_INCOME,
      freelanceRevenue: FactCategory.FREELANCE_INCOME,
      businessExpense: FactCategory.BUSINESS_EXPENSE,
      trainingCourseExpense: FactCategory.OTHER_DEDUCTION,
      workRelatedExpense: FactCategory.OTHER_DEDUCTION,
      medicalExpense: FactCategory.OTHER_DEDUCTION,
      invoiceExpense: FactCategory.OTHER_DEDUCTION,
      childcareExpense: FactCategory.CHILDCARE_EXPENSE,
      domesticServiceExpense: FactCategory.HOUSEHOLD_HELP_EXPENSE,
      donationAmount: FactCategory.DONATION_DEDUCTION,
      insurancePremium: FactCategory.INSURANCE_DEDUCTION,
      pensionSavings111bis: FactCategory.PENSION_SAVINGS_111BIS,
      savingsHousing: FactCategory.SAVINGS_HOUSING,
      lrcp: FactCategory.LRCP_CONTRIBUTION,
      mortgageInterest: FactCategory.MORTGAGE_INTEREST,
    };

    return {
      name: field.name,
      value: field.value,
      confidence: field.confidence,
      snippet: field.snippet,
      category: categoryByField[field.name],
    };
  }

  /**
   * Read the amount printed on a numbered line of a certificate, e.g.
   * "105. Retenue d'impôt sur traitements et salaires: 13950.00 EUR".
   *
   * Returns the LAST number on that line, which is the amount in every layout
   * seen so far (the label may itself contain numbers such as "Art. 111").
   *
   * A PDF prints the label and the figure in two columns, which the text layer
   * often yields as two lines; the window below covers that without reaching
   * into the next code's line.
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

      // Same line first; then up to two following lines that hold only a figure
      // (a table column), stopping at the next code or a blank line.
      const after = text.slice(line.index + line[0].length).split('\n').slice(1, 4);
      const candidates = [line[0], ...after.filter((next) => /^[\s\d.,'’€%-]+$/.test(next))];

      for (const candidate of candidates) {
        const amounts = candidate.match(/\d{1,3}(?:[ .,'’]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}/g);
        if (!amounts || amounts.length === 0) continue;

        return {
          value: amounts[amounts.length - 1],
          snippet: candidate.trim().slice(0, 160),
        };
      }
    }
    return null;
  }

  /**
   * Deterministic engine for Luxembourg receipts, crèche invoices, and tax
   * certificates. Runs over the text layer of a PDF or the body of a text file.
   */
  private extractLocally(
    rawText: string,
    fileName: string,
    source: ExtractionSource,
  ): Omit<ReceiptAiExtractionResult, 'pageCount' | 'textCharacters'> {
    const textLower = (rawText + ' ' + fileName).toLowerCase();
    // Taxpayers, employers and the ACD all produce documents with and without
    // accents ("CERTIFICAT DE REMUNERATION" vs "Certificat de Rémunération").
    // Keyword matching runs on the de-accented text so neither spelling is
    // missed — the sample this app ships is the unaccented one.
    const textPlain = stripAccents(textLower);
    const fields: ExtractedField[] = [];
    const modelUsed = 'local rule parser (no model)';

    const wrap = (
      documentType: DocumentType,
      confidence: number,
      snippet: string,
    ): Omit<ReceiptAiExtractionResult, 'pageCount' | 'textCharacters'> => ({
      documentType,
      confidence,
      extractedSnippet: snippet,
      modelUsed,
      fields,
      source,
      needsOcr: false,
      reason: null,
      rejectedFields: [],
    });

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

      return wrap(
        DocumentType.CHILDCARE_INVOICE,
        0.95,
        rawText.substring(0, 300) || `Scanned receipt: ${fileName}`,
      );
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

      return wrap(
        DocumentType.DONATION_CERTIFICATE,
        0.94,
        rawText.substring(0, 300) || `Scanned donation receipt: ${fileName}`,
      );
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

      return wrap(DocumentType.SALARY_CERTIFICATE, 0.95, rawText.substring(0, 300));
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

      return wrap(DocumentType.PENSION_CERTIFICATE, 0.94, rawText.substring(0, 300));
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

      return wrap(DocumentType.MORTGAGE_CERTIFICATE, 0.9, rawText.substring(0, 300));
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

      return wrap(DocumentType.INSURANCE_CERTIFICATE, 0.93, rawText.substring(0, 300));
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

      return wrap(DocumentType.INSURANCE_CERTIFICATE, 0.9, rawText.substring(0, 300));
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

      return wrap(
        DocumentType.TRAINING_INVOICE,
        0.94,
        rawText.substring(0, 300) || `Training Course Invoice: ${fileName}`,
      );
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
      textLower.includes("frais d'obtention")
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

      return wrap(
        DocumentType.RECEIPT,
        0.93,
        rawText.substring(0, 300) || `Work Expense Receipt: ${fileName}`,
      );
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

      return wrap(
        DocumentType.MEDICAL_INVOICE,
        0.92,
        rawText.substring(0, 300) || `Medical Invoice: ${fileName}`,
      );
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

      return wrap(
        DocumentType.FREELANCE_INVOICE,
        0.96,
        rawText.substring(0, 300) || `Freelance Client Invoice: ${fileName}`,
      );
    }

    // --- J. BUSINESS & OPERATING EXPENSES (Frais d'exploitation Art 14/91) ---
    if (
      textLower.includes("frais d'exploitation") ||
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

      return wrap(
        DocumentType.BUSINESS_EXPENSE,
        0.94,
        rawText.substring(0, 300) || `Business Operating Expense: ${fileName}`,
      );
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

      return wrap(DocumentType.VAT_RETURN, 0.93, rawText.substring(0, 300) || `VAT Declaration: ${fileName}`);
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

      return wrap(
        DocumentType.PROFIT_AND_LOSS_STATEMENT,
        0.95,
        rawText.substring(0, 300) || `P&L Statement: ${fileName}`,
      );
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

      return wrap(
        DocumentType.RECEIPT,
        0.88,
        rawText.substring(0, 300) || `Invoice/Receipt: ${fileName}`,
      );
    }

    return wrap(DocumentType.UNKNOWN, 0.5, rawText.substring(0, 300) || `Document: ${fileName}`);
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
