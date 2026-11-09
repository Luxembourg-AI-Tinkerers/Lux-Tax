import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """      {
        sectionIndex: 4,
        sectionTitle: 'Etape 4 - Recapitulation et signature',"""
new = """      {
        sectionIndex: 4,
        sectionTitle: 'Annexe - report du certificat de remuneration (modele 160)',
        instructions: [
          "Cette etape est un controle croise : les codes 101/103/105 appartiennent au certificat 160 et servent a verifier les montants, pas a etre saisis comme cases du modele 100.",
        ],
        fieldsToEnter: certificateImport.map((c) => ({
          fieldLabel: c.label,
          form100Box: `Code ${c.code}`,
          value: c.amount,
        })),
      },
      {
        sectionIndex: 5,
        sectionTitle: 'Etape 5 - Recapitulation et signature',"""
assert s.count(old) == 1
s = s.replace(old, new)

out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("ok")
