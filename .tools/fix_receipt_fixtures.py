import io, re

p = r"B:\B\tax-app\apps\api\test\receipt-scanning.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

helpers = """
/**
 * The upload endpoint now sniffs the bytes instead of trusting the declared
 * MIME type, so a simulated receipt has to start with the real signature of the
 * format it claims to be. The OCR text still follows the signature.
 */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from('%PDF-1.4\\n', 'ascii');

const asJpeg = (text: string): Buffer => Buffer.concat([JPEG_MAGIC, Buffer.from(text)]);
const asPng = (text: string): Buffer => Buffer.concat([PNG_MAGIC, Buffer.from(text)]);
const asPdf = (text: string): Buffer => Buffer.concat([PDF_MAGIC, Buffer.from(text)]);
"""

anchor = "describe("
assert s.count(anchor) >= 1
first_describe = s.index(anchor)
s = s[:first_describe] + helpers.strip() + "\n\n" + s[first_describe:]

replacements = [
    (
        """    const simulatedChildcareReceiptImage = Buffer.from(
      'FACTURE CRECHE LA MAISON DES ENFANTS LUXEMBOURG Garde d enfant Octobre 2025 Montant Total EUR 450.00 TVA 0.00 EUR Net a payer 450.00 EUR'
    ).toString('base64');""",
        """    const simulatedChildcareReceiptImage = asJpeg(
      'FACTURE CRECHE LA MAISON DES ENFANTS LUXEMBOURG Garde d enfant Octobre 2025 Montant Total EUR 450.00 TVA 0.00 EUR Net a payer 450.00 EUR',
    ).toString('base64');""",
    ),
    (
        """    const simulatedDonationReceiptImage = Buffer.from(
      'CROIX-ROUGE LUXEMBOURGEOISE ATTESTATION DE DON ART 112 LIR Nous certifions avoir recu un don de 250.00 EUR pour l annee 2025'
    ).toString('base64');""",
        """    const simulatedDonationReceiptImage = asPng(
      'CROIX-ROUGE LUXEMBOURGEOISE ATTESTATION DE DON ART 112 LIR Nous certifions avoir recu un don de 250.00 EUR pour l annee 2025',
    ).toString('base64');""",
    ),
    (
        "    const simulatedImage = Buffer.from('DUPLICATE RECEIPT SCAN CONTENT').toString('base64');",
        "    const simulatedImage = asJpeg('DUPLICATE RECEIPT SCAN CONTENT').toString('base64');",
    ),
    (
        """    const courseInvoice = Buffer.from(
      'INSTITUT DE FORMATION LUXEMBOURG Facture Formation Continue Professionnelle Data Analytics & AI Course Total EUR 850.00 Net a payer 850.00 EUR'
    ).toString('base64');""",
        """    const courseInvoice = asPdf(
      'INSTITUT DE FORMATION LUXEMBOURG Facture Formation Continue Professionnelle Data Analytics & AI Course Total EUR 850.00 Net a payer 850.00 EUR',
    ).toString('base64');""",
    ),
]

for old, new in replacements:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)

# the work receipt fixture
m = re.search(r"    const workReceipt = Buffer\.from\(\n      '([^']*)'\n    \)\.toString\('base64'\);", s)
if m:
    s = s.replace(m.group(0), "    const workReceipt = asJpeg(\n      '%s',\n    ).toString('base64');" % m.group(1))
else:
    print("workReceipt pattern not found — check manually")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("fixtures patched")
