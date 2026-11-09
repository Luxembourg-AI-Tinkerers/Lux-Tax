import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

start = s.index("## 3. Remaining gaps — partial by design, with reasons")
end = s.index("## 4. Claim-by-claim check of the tracker")
new_section = """## 3. Gap-closure phase (same day)

After the first pass, the remaining items were implemented:

| Gap | What was added | Status |
|---|---|---|
| R1 securities | `securities[]` ledger: qualifying dividend 50 %, RELIBI 20 % **final** election, creditable foreign withholding, then the €1,500 tranche; one-row UI entry | ✅ closed |
| R2 rental | `rentalProperties[]` asset register: amortisation 4 % (recent, max two buildings) / 1.5 % / 2 % / 3 % by age, energy-renovation rate (6 % 2025 → 10 % 2026), charges and loan interest; UI entry | ✅ closed |
| R3 Art. 3 d) | `spouseResidence` + `mixedCoupleCollectiveRequested`; the ≥ 90 % professional-income gate now admits a mixed couple to Class 2, otherwise warns and keeps separate treatment | ✅ closed |
| R4 Class U | `classUTransition { years: 25, method: 'NONE' }` hook plus an explicit warning for couples in a single-class year | ✅ hook |
| R5 extractor | Dedicated Art. 111bis branch **and** pension certificate (modèle 170, codes 200/201/203/205) | ✅ closed |
| R8 annexes | `annexes[]` (190/210, 700, 104, CIM request) computed from the return, persisted, rendered with a **Print / Save as PDF** action | ✅ data + print |
| R10 precision | `addMoney`/`sumMoney`; 29 accumulation sites moved to integer cents | ✅ closed |
| R6 CIC 2026 | Not modelled — amounts not published; engine emits a warning | ⛔ blocked |
| R7 Loi 8775 | 2025/2026 law applied (40-year limit); suppression not pinned | ⛔ blocked |
| R9 migration execution | Two migration folders committed; no PostgreSQL here | ⛔ blocked |

**What is still genuinely not produced:** an official ACD annex *PDF* (the data and a printable view exist, the official layout does not), and execution of the migrations against a live database.

"""
s = s[:start] + new_section + s[end:]

s = s.replace("""If “everything” means the audit’s P0 list → **done**. If it means full resident-return breadth including a securities ledger and an asset register → **R1, R2, R3, R5, R8 remain**.""",
"""If “everything” means the audit’s P0 **and** P1 breadth lists → **done**, except the three items that depend on something outside the repository: the CIC 2026 amounts, the loi 8775 text, and a live database for the migrations.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
