import { DocumentType } from '@luxtax/contracts';
import type { ModelDefinitionDto, ModelRouteDto } from '@luxtax/contracts';

/**
 * The contract between this application and whatever vision model an
 * administrator registers.
 *
 * Two failures made this necessary. A model that answers with prose instead of
 * JSON used to throw and silently fall back to the local parser; a model that
 * answered with a field name the engine does not know created a fact that no
 * calculation would ever read. Both are now decided here, in pure functions,
 * before anything reaches the database.
 */

/** Fields an extracted fact may carry. Anything else is dropped and reported. */
export const EXTRACTION_FIELD_NAMES: readonly string[] = [
  'grossSalary',
  'socialSecurity',
  'withholdingTax',
  'fraisObtention',
  'grossPension',
  'capitalIncome',
  'qualifyingDividend',
  'rentalGross',
  'rentalCharges',
  'foreignIncome',
  'freelanceRevenue',
  'businessExpense',
  'trainingCourseExpense',
  'workRelatedExpense',
  'medicalExpense',
  'childcareExpense',
  'domesticServiceExpense',
  'donationAmount',
  'insurancePremium',
  'pensionSavings111bis',
  'savingsHousing',
  'lrcp',
  'mortgageInterest',
  'invoiceExpense',
];

const FIELD_NAMES = new Set(EXTRACTION_FIELD_NAMES);

/** The document types a model may answer with; anything else becomes UNKNOWN. */
const DOCUMENT_TYPES = new Set(Object.values(DocumentType).map((value) => String(value)));

export interface VisionField {
  name: string;
  value: string;
  confidence: number;
  snippet: string;
}

export interface VisionExtraction {
  documentType: DocumentType;
  confidence: number;
  extractedSnippet: string;
  fields: VisionField[];
  /** Field names the model returned that this application cannot store. */
  rejectedFields: string[];
}

/**
 * The prompt. It pins the JSON shape and the field vocabulary, and it forbids
 * the two habits that damage a tax return: inventing a figure and rounding a
 * printed one.
 */
export function buildVisionPrompt(fileName: string, hint: DocumentType | null): string {
  const hintLine =
    hint && hint !== DocumentType.UNKNOWN
      ? `The uploader says this is a ${hint}. Confirm or correct that.`
      : 'The document type is not known in advance.';

  return [
    'You read Luxembourg tax documents for a resident income tax return.',
    `Analyse the attached document "${fileName}". ${hintLine}`,
    '',
    'Rules:',
    '- Copy figures exactly as printed. Do not round, and do not compute a total that is not printed.',
    '- If a figure is not visible, omit that field. Never guess.',
    '- One field per amount. Use the printed amount, not a rate or a year.',
    '- Amounts in EUR; use "." as the decimal separator and no thousands separators.',
    '',
    `Classify the document as exactly one of: ${[...DOCUMENT_TYPES].join(', ')}.`,
    `Name each amount with exactly one of: ${EXTRACTION_FIELD_NAMES.join(', ')}.`,
    '',
    'Answer with JSON only, no prose and no code fence:',
    '{"documentType":"SALARY_CERTIFICATE","confidence":0.95,"snippet":"the printed line you read it from",',
    '"fields":[{"name":"grossSalary","value":"76800.00","confidence":0.95,"snippet":"101. Remuneration brute 76800.00"}]}',
  ].join('\n');
}

/**
 * Normalises a printed amount to `1234.56`.
 *
 * Both European and English conventions arrive in practice (`1.234,56` from a
 * Luxembourg bank, `1,234.56` from an international one). The rule: the
 * right-most separator is the decimal one when it is followed by one or two
 * digits; everything else is grouping.
 */
export function normalizeAmount(raw: unknown): string | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw.toFixed(2) : null;
  }
  if (typeof raw !== 'string') return null;

  const trimmed = raw.replace(/[^\d.,\-+]/g, '').trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  const decimals = decimalAt >= 0 ? trimmed.length - decimalAt - 1 : 0;

  let normalised: string;
  if (decimalAt >= 0 && decimals > 0 && decimals <= 2) {
    const whole = trimmed.slice(0, decimalAt).replace(/[.,]/g, '');
    const fraction = trimmed.slice(decimalAt + 1).replace(/[.,]/g, '');
    normalised = `${whole}.${fraction}`;
  } else {
    normalised = trimmed.replace(/[.,]/g, '');
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  // A negative fact is a credit in this domain, not an amount the engine can
  // use; the sign is dropped rather than creating a deduction that increases tax.
  return Math.abs(value).toFixed(2);
}

/** Clamps a model's self-reported confidence to a usable number. */
function confidenceOf(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (value > 1 && value <= 100) return Math.min(1, value / 100);
  return Math.min(1, Math.max(0, value));
}

function snippetOf(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return raw.trim().slice(0, 200);
}

/**
 * Validates and normalises one model answer.
 *
 * Returns `null` when the payload is not a usable extraction at all — that is
 * the signal to try the next model in the chain rather than to store a
 * half-parsed answer.
 */
export function parseVisionExtraction(content: string): VisionExtraction | null {
  const json = extractJsonObject(content);
  if (!json) return null;

  const rawType = typeof json.documentType === 'string' ? json.documentType.toUpperCase() : '';
  const documentType = DOCUMENT_TYPES.has(rawType) ? (rawType as DocumentType) : DocumentType.UNKNOWN;

  const rawFields = Array.isArray(json.fields) ? json.fields : [];
  const rejectedFields: string[] = [];
  const byName = new Map<string, VisionField>();

  for (const entry of rawFields) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!FIELD_NAMES.has(name)) {
      if (name) rejectedFields.push(name);
      continue;
    }

    const value = normalizeAmount(candidate.value);
    if (value === null) {
      rejectedFields.push(name);
      continue;
    }
    if (value === '0.00') continue;

    const field: VisionField = {
      name,
      value,
      confidence: confidenceOf(candidate.confidence, 0.85),
      snippet: snippetOf(candidate.snippet, ''),
    };

    // Two entries for one field would double-count in the engine: keep the one
    // the model was most sure about.
    const existing = byName.get(name);
    if (!existing || existing.confidence < field.confidence) byName.set(name, field);
  }

  const fields = [...byName.values()].slice(0, 25);
  if (fields.length === 0 && documentType === DocumentType.UNKNOWN) return null;

  return {
    documentType,
    confidence: confidenceOf(json.confidence, documentType === DocumentType.UNKNOWN ? 0.4 : 0.85),
    extractedSnippet: snippetOf(json.snippet, content.slice(0, 300)),
    fields,
    rejectedFields,
  };
}

/** Finds the first JSON object in a reply, tolerating a code fence or preamble. */
function extractJsonObject(content: string): Record<string, unknown> | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Sensitivity ordering of the data classes a route may carry. */
const DATA_CLASS_RANK: Record<string, number> = {
  PUBLIC: 0,
  SYNTHETIC: 1,
  REDACTED_CUSTOMER: 2,
  CUSTOMER_DOCUMENT: 3,
};

/**
 * True when a model is cleared to see the data class a route declares.
 *
 * The policy was previously validated only when a route was registered, so a
 * public model could be pointed at a task whose route declared customer
 * documents. Unknown values fail closed: a typo must not widen what a third
 * party is allowed to read.
 */
export function modelMaySeeDataClass(model: ModelDefinitionDto, routeMaxDataClass: string): boolean {
  const required = DATA_CLASS_RANK[routeMaxDataClass];
  const permitted = DATA_CLASS_RANK[model.permittedDataClass];
  if (required === undefined || permitted === undefined) return false;
  return permitted >= required;
}

/**
 * The models to try, in order: the route's primary, then its fallbacks.
 *
 * A model is eligible only when it can actually be called — active, vision
 * capable, with an endpoint, and cleared for the route's data class. A route
 * pointing at an uncallable model must not stop the chain: the next candidate
 * wins, and an empty chain means "no OCR configured", which is a statement the
 * user is shown rather than an error.
 */
export function resolveVisionChain(
  route: ModelRouteDto | null,
  models: readonly ModelDefinitionDto[],
): ModelDefinitionDto[] {
  // No route means no task is configured for OCR: an empty chain, not a guess.
  if (!route) return [];

  const eligible = new Map(models.map((model) => [model.id, model]));
  const ordered: ModelDefinitionDto[] = [];
  const seen = new Set<string>();

  const consider = (id: string | null | undefined): void => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const model = eligible.get(id);
    if (!model) return;
    if (model.status !== 'ACTIVE') return;
    if (!model.capabilities.includes('VISION')) return;
    if (!model.endpointUrl) return;
    if (!modelMaySeeDataClass(model, route.maxDataClass)) return;
    ordered.push(model);
  };

  consider(route.primaryModelId);
  for (const fallback of route.fallbackModelIds ?? []) consider(fallback);

  return ordered;
}
