# Luxembourg resident taxation — capital, rental, foreign, self-employment, pensions

**Research date:** 8 November 2026  
**Scope:** Resident individuals, tax years 2025 (returns filed in 2026) and 2026.  
**Primary source:** L.I.R. texte coordonné en vigueur au 1er janvier 2026 (ACD, actualisé 08/05/2026) — 363-page PDF.  
**Purpose:** Factual base for auditing a Luxembourg personal-income-tax app. Do not guess numbers; every figure below is tagged to a source.

---

## 1. Conclusion summary

Resident individuals are taxed on worldwide income at progressive rates (2025/2026 barème: 0% to 42%, plus 7%/9% Fonds pour l’emploi). Capital income is Art. 97; rental is Art. 98; speculation/cession gains are Art. 99bis/99ter/100/101; pensions are Art. 96. The 50% dividend exemption is Art. 115(15a), not a general “half-reduction” on all capital income. Interest is fully taxable (option 20% libératoire). Gains on portfolio securities held **more than 6 months** are exempt unless the holding is a substantial participation (>10%). Principal-residence exemption is **Art. 102bis + Art. 99bis(3)/99ter(6)** — there is **no Art. 99a**. Private-pension **premiums** are deducted under Art. 111bis (€4,500 from 2026); the **50% exemption of the annuity** is Art. 115(14)/14a; capital repayment is taxable under Art. 99(4). Confidence: **high** for articles quoted from the 2026 LIR; **medium** where only ACD/guichet practice pages (not the LIR itself) state a figure.

User-prompt article mapping corrections (important for the app):

| Prompt said | Actual 2026 LIR |
|---|---|
| Art. 95–101 “capital income” | Art. 97 = capitaux mobiliers; Art. 95 = salarié; Art. 98 = location; Art. 99–101 = revenus divers |
| Art. 99a principal residence | **Does not exist.** Use Art. 102bis (definition) + Art. 99bis(3) and 99ter(6) (exemption) |
| Art. 115a–115n | There are **no articles 115a–115n**. The relevant items are **Art. 115 numbers 14, 14a, 15, 15a, 15b, 22a** |
| Art. 98–101 rental | Art. 98 = location de biens; Art. 101 = partage de l’actif social (participations importantes) |
| Art. 111bis “pension taxation” | Art. 111bis = **deduction of premiums**; payout taxation is Art. 96 + Art. 99(4) + Art. 115(14)/14a |
| Art. 14, 91, 97, 101 self-employment | Art. 14 (commercial), Art. 91 (libérale) correct; Art. 97/101 are **not** self-employment articles |

---

## 2. Findings

### 2.1 Rate architecture (needed to price every category)

**Fact.** Ordinary PIT is progressive. From AY 2025 the class-1 barème starts at 0% up to €13,200 and reaches 42% above €234,900. Fonds pour l’emploi: 7% of tax if adjusted income ≤ €150,000 (class 1/1a) or ≤ €300,000 (class 2); 9% above those thresholds. Combined statutory maximum ≈ 42% × 1.09 = **45.78%** (class 1, high income). Assurance dépendance **1.4%** is extra (on salaries, pensions and most capital income).

**Evidence.**
- Barème 2025 class 1 table (0% to 42%): taxx.lu guide, last modified 13.02.2026 — https://taxx.lu/fr/guide-de-la-declaration-d-imposition/le-bareme-d-imposition-au-luxembourg (secondary; ACD publishes the same barème in Mémorial A N° 590 of 24.12.2024).
- ACD barèmes page (official index; “dernière adaptation tarifaire … à partir du 1er janvier 2025”): https://impotsdirects.public.lu/fr/baremes.html
- Fonds pour l’emploi 7%/9% and thresholds: taxx.lu barème page (same URL); Chambre des salariés “Tarif de l’impôt sur le revenu”.
- Dependance 1.4% on dividends: guichet.public.lu dividend page — https://guichet.public.lu/fr/citoyens/fiscalite/declaration-impot-decompte/capitaux-mobiliers/banque-dividende-interets/identifier-declarer-dividendes.html
- **Do not use** the old combined “42.80% / 43.60%” still printed on the 2013 guichet dividend page; that is the pre-2025 40% + 7%/9% stack.

**Classes.** Class 1 = single/no child; class 1a = single with child, widow(er), or ≥65 on 1 January; class 2 = joint (marriage/PACS). Same LIR barème shape; class 1a/2 are more favourable.

**Evidence grade:** Official ACD index + Mémorial for the barème; taxx table used only for the numeric brackets (cross-check against Mémorial A 590 before shipping). **High confidence** on 0–42% + 7/9%; **medium** on each intermediate bracket until the Mémorial PDF is parsed.

---

### 2.2 Dividends (Art. 97, Art. 115(15a), Art. 146)

**Fact.** Dividends, parts de bénéfice and similar products from companies within Art. 159/160 are Art. 97(1)1 capital income. Taxed at ordinary progressive rates + 1.4% dependance. Luxembourg WHT **15%** (Art. 146). Residents credit the WHT on the return.

**50% exemption — Art. 115(15a) LIR (2026 text, p. 182):** 50% of capital income specified in Art. 146(1) nos 1 and 3 and al. 2 paid by:
1. a **fully taxable resident capital company**;
2. a capital company resident in a **DTT State**, fully taxable with a tax corresponding to IR des collectivités;
3. an **EU** company within Art. 2 of Directive 2011/96/EU (parent-subsidiary),

provided the income is taxable under Art. 10 nos 1–3 or 6. The taxpayer may **waive** the exemption, year by year, per holding. Related frais d’obtention are only 50% deductible.

**What 15a is not.** It is **not** limited to 10% holdings. Portfolio dividends from a fully taxable LU/EU/DTT company qualify. It does **not** apply to interest. It does **not** exempt fund distributions merely because the fund is Luxembourg-resident (funds are typically not “sociétés de capitaux pleinement imposables”).

**Tranche exemptée — Art. 115(15):** first **€1,500** per year of Art. 97 income taxable par voie d’assiette; **doubled** (€3,000) if imposition collective (Art. 3). The housing-savings interest sentence in the same number is a separate exemption.

**Frais d’obtention:** actual costs, or minimum forfait **€25** (€50 joint) — guichet dividend page. 50% only, if 15a applies.

**Foreign WHT.** Imputable on the Luxembourg tax on those dividends. If not fully imputable, deductible as frais d’obtention (Art. 13). Circulaire L.I.R. n° 115/8 of 15.12.2008: with 15a, credit is computed on the **taxable half**; treaty-excess WHT that the taxpayer did not reclaim is limited to the treaty rate.

**Evidence.**
- Art. 97 and Art. 115(15)/(15a) quoted from ACD LIR 2026 PDF: https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2026-ver-08052026.pdf (pages 132–133, 181–182)
- Guichet dividends (15% WHT, 50% exemption, €1,500, €25 forfait, modèle 180): URL above (last modified 21.01.2013 — legal core still matches 15a; **ignore** the 42.80/43.60% rates)
- Circulaire 115/8 PDF: https://impotsdirects.public.lu/dam-assets/fr/legislation/legi08/L_I_R__n___115-8_du_15_d__cembre_2008.pdf

**Grade:** LIR 2026 = primary. Guichet = official admin. Circular = official admin. **High confidence.**

---

### 2.3 Interest (Art. 97(1)3–6; RELIBI)

**Fact.** Interest on bonds, loans, deposits, savings accounts is Art. 97 capital income, **fully taxable** (no 50% cut). Luxembourg paying agents may apply the **20% retenue libératoire** (loi du 23 décembre 2005, “RELIBI”). If the taxpayer opts (modèle 931), the 20% is **final**: not refundable, not creditable against other LU tax. Interest < **€250** per year per paying agent is not subject to RELIBI withholding. The €1,500 Art. 115(15) tranche still applies when interest is assessed by voie d’assiette.

**2026 special — Art. 115(15b):** exempt are Art. 97 incomes from **euro State bonds** subscribed and issued **15 January 2026 – 15 February 2026**, 3-year maturity, issuer holding the highest rating from at least two major agencies. This is a ** Defence-Bond-type measure, not a fund exemption.**

**Épargne-logement interest:** Art. 115(15) first sentence — exempt if the housing-savings account is used to finance construction/acquisition/renovation of the owner’s home (conditions in the LIR text).

**Evidence.**
- Art. 97(1)3–6: LIR 2026 p. 132.
- Art. 115(15)/(15b): LIR 2026 pp. 181–182.
- RELIBI 20% and option: ACD https://impotsdirects.public.lu/fr/legislation/fiscalite_epargne.html ; loi 23.12.2005 https://legilux.public.lu/eli/etat/leg/loi/2005/12/23/n1/jo
- €250 threshold and non-imputable 20%: taxx.lu capitaux mobiliers guide (secondary).

**Grade:** LIR + ACD/legilux = high. €250 threshold = medium (taxx; confirm in the 2005 law text before hard-coding).

---

### 2.4 Capital gains on movable property (shares, crypto, fund units)

**Holding ≤ 6 months → Art. 99bis speculation.** “Autres biens” than immeubles: **six months**. Ordinary progressive rates (Art. 131(1)(b) stack, not demi-taux). Annual speculation profit **< €500 → exempt** (Art. 99bis(2)). Carried interest has a special always-taxable rule (Art. 99bis(1a)).

**Holding > 6 months, participation < 10% → exempt.** No LIR article taxes the gain; it is neither speculation (99bis) nor Art. 100.

**Holding > 6 months, participation importante → Art. 100.** Substantial = **> 10%** of capital, direct or indirect, alone or with spouse/partner/minor children, at any time in the **5 years** before alienation (Art. 100(2)). Also acquired à titre gratuit with a prior 10% holder in the 5-year window.

**Rate on Art. 100 (and 99ter/101):** Art. 132(2) no. 2 lists “revenus nets visés aux articles 99ter, 100 et 101” as revenus extraordinaires imposables under Art. 131(1)**c** = **moitié du taux global** (half the average rate). ACD states the real-estate demi-taux maximum as **21%** excluding Fonds pour l’emploi (i.e. 42%/2). Taxx states “moitié du taux global, max 21,40%” — the 21.40% figure is the old 42.80%/2; use **half of the current global rate**, not a frozen 21.40%.

**Abattement Art. 130(4):** the **sum of Art. 99ter to 101** income is reduced by **€50,000** (€100,000 joint), no loss allowed, reduced by the same abattements granted in the previous **10 years**. This **does apply to Art. 100 share gains**, not only buildings.

**Acquisition price Art. 100(4):** proceeds minus realisation costs minus acquisition price. No indexation for Art. 100 (indexation Art. 102(6) is only “articles 99ter à 101” wait — the LIR says “en vue de la détermination du revenu visé aux articles 99ter à 101” which **includes 100 and 101**. Coefficients in Art. 102(6) apply. For shares acquired after 2024 the coefficient is 1.00.)

**Crypto:** private sales are revenus divers; **< 6 months = speculation**, **> 6 months generally exempt**; < €500 annual exempt. (taxx; consistent with Art. 99bis “autres biens”.)

**Luxembourg investment fund units.**
- **Gains, non-substantial, held > 6 months: exempt** (same 99bis/100 architecture). This is the practical “fund unit exemption” for long-term private investors.
- **Gains held < 6 months: Art. 99bis.**
- **Distributions:** 2026 Art. 115(15b) is **State bonds**, not OPC. The old “15b = revenus d’OPC” wording is **not** in the 1.1.2026 coordinated text. Fund distributions remain Art. 97 income unless another exemption applies. **Do not hard-code “Luxembourg fund dividends are 100% exempt under 115(15b)”.** Flag as a rule to verify per product (UCITS vs SICAV pleinement imposable vs capitalisation).
- Reverse-hybrid CIV carve-out (Art. 168ter / circulaire 2025) concerns the **fund’s** status, not the resident investor’s return.

**Evidence.**
- Art. 99bis (6 months, €500, main home, 2025 2-year transition): LIR 2026 pp. 136–137.
- Art. 99ter (real estate > 5 years, main home exclusion): LIR 2026 p. 138.
- Art. 100 (10%, 5 years, family): LIR 2026 p. 140.
- Art. 132(2) demi-taux for 99ter/100/101: LIR 2026 p. 214.
- Art. 130(4) €50k/€100k and Art. 130(5) €75k: LIR 2026 p. 212.
- ACD vente d’immeuble (5 years / >5 years, 42% vs 21%, 2025 2-year rule, exemptions): https://impotsdirects.public.lu/fr/az/v/vente_immeuble.html
- Taxx crypto / 6-month table: https://taxx.lu/fr/guide-de-la-declaration-d-imposition/revenus-de-capitaux-mobiliers/ (secondary; **do not copy** its 21.40% or 42.80% figures).

**Grade:** LIR 2026 = high. Fund-distribution exemption = **low / unresolved** (see §4).

---

### 2.5 Real-estate capital gains and principal residence

**Speculation Art. 99bis:** immeubles “récemment acquis” if interval **≤ 5 years**. Ordinary rates. ACD: “taux d’impôt maximal 42% (tarif ordinaire) sans fonds pour l’emploi”.

**Cession Art. 99ter:** alienation **more than 5 years** after acquisition/construction of a built or unbuilt property not in business/professional assets. Proceeds minus indexed acquisition price. Demi-taux global, ACD max **21%** without fonds. Additional abattements Art. 130(4) €50k/€100k and Art. 130(5) **€75,000** if inherited in direct line and used as parents’ principal residence.

**2025 transition (do not generalise):** properties **realised 1.1.2025–30.6.2025** are “recently acquired” if held **≤ 2 years** (not 5). Properties realised **1.7.2025–30.9.2025** same 2-year rule if the compromis was registered at AED by 30.6.2025. From 1.10.2025 the ordinary 5-year split applies again.

**Principal residence — Art. 102bis (definition) + Art. 99bis(3) and 99ter(6) (exemption).** Habitation is résidence principale if it is the habitual residence since acquisition/completion **or at least during the 5 years** preceding the sale. The 5-year condition is waived for **family or professional** relocation. Assimilated: not occupied but previously occupied, no other home, family/professional reason; sold in the year after moving to a new home. Copropriété counts within the taxpayer’s quote-part. Includes normal dépendances.

**Art. 102ter:** speculation and cession gains on immovables sold to the State, communes, syndicats de communes and Fonds du Logement are exempt (not if via legal préemption).

**Art. 102quater:** optional roll-over of Art. 99ter gains realised **1.1.2024–30.9.2025** into replacement properties (social rental / affordable housing); land share of the transferred gain capped at 50%.

**Evidence.**
- Art. 99bis(3), 99ter(6), 102bis, 102ter, 102quater: LIR 2026 pp. 136–148.
- ACD vente_immeuble (numeric rates, 2025 2-year rule, Fonds du Logement exemption): URL above.
- Prompt’s “Art. 99a” and “<6 months principal residence”: **wrong article**; 6 months is movable property. Real estate speculation is **5 years**.

**Grade:** LIR 2026 + ACD A-Z = high.

---

### 2.6 Rental income and owner-occupied valeur locative (Art. 98)

**Fact.** Art. 98(1) rental income includes: (1) location/affermage of meubles/immeubles; (2) mining/extraction; (3) **royalties** (copyright, patents, trademarks, know-how, industrial equipment); (4) proceeds of sale of rental claims; (5) **valeur locative of the habitation occupied by (or destined for) the owner**.

**Net income** = recettes − frais d’obtention (Art. 98 does not itself compute the net; ACD practice / forms 190/210 apply Art. 105–107 mechanics). ACD logem_loc: net is the excess of receipts over frais; **losses are offsetable with other net categories** of the same year.

**Frais réels (unlimited), if not borne by the tenant:** mortgage interest and financing fees; rente viagère arrérages; gérance/concierges; **impôt foncier**; redevances communales; foreign personal taxes (if not creditable); entretien/réparation (large works may be spread 2–5 years); nettoyage; amortissement; insurance; fonds de travaux; letting costs; recovery costs.

**Forfait option (ACD logem_loc):** only if the built property is **entirely private patrimoine** and construction completed **≥ 15 years** on 1 January of the AY. Forfait = **35% of gross rent, max €2,700 per year per building**. Does **not** cover (still deductible in addition): interest and loan fees, rente arrérages, gérance/concierges, impôt foncier, redevances communales, foreign personal taxes. You can return to frais réels; you must then wait **15 years** to re-elect the forfait. RGD 23.10.1980.

**Amortissement (private patrimoine, ACD table):**
- Normal / justifié plus forte usure:
  - completed < 30 years: **1.5% / 2%**
  - 30–60 years inclusive: **2% / 2.5%**
  - > 60 years: **3% / 4%**
- Base = triple valeur unitaire 1.1.1941 (pre-1941): **2.5% / 3%**
- **10%** for durable energy renovation of rental housing (< 9 years) if a Kinolaw aid under the 23.12.2016 law is granted
- **2%** rental housing; **4%** for up to **two** rental buildings completed < 5 years (lifetime limit of two 4% objects; first = oldest completion from 1.1.2023)
- VEFA acquired 1.1.2024–30.6.2025, and 1.7.2025–30.9.2025 with compromis registered by 30.6.2025: **always 2%**
- Land quote-part: **20% of purchase price** if unknown
- Investment works ≤ **€2,500 TTC** always immediately deductible (simplification)

**Social rental — Art. 115(22a):** **90%** of net rental income from **organismes conventionnés** under Art. 49 of the loi du 7 août 2023 (logement abordable), from **AY 2024**. AY 2023: **75%**; AY 2017–2022: **50%**. Circulaire L.I.R. n° 115/10 of 18.08.2023. Losses on such property stay **100%** deductible (taxx; consistent with “tranche” of positive net).

**There is no general 40% or 50% exemption for ordinary residential lets.** The 40%/50%/75%/90% figures that circulate are the **social-rental** tranche history (and 2017–2022 50%). Do not apply 40% to a normal private lease.

**Valeur locative owner-occupied:** taxable as location de biens since the 2023 reform (Art. 98(1)5). ACD A-Z “Habitation personnelle du propriétaire” (cookie-walled in this run; snippet: from AY 2023 every dwelling gets a valeur locative). Mortgage interest and related charges are deductible under the forfait/limitations of Art. 98(4). **App must not treat owner-occupied housing as always exempt from location category.**

**Evidence.**
- Art. 98: LIR 2026 p. 134.
- ACD logem_loc (forfait 35%/€2,700, 15 years, amortissement table, 90/75/50% social, €2,500 works): https://impotsdirects.public.lu/fr/az/l/logem_loc.html (last modified 24.02.2026)
- Art. 115(22a): LIR 2026 p. 183.
- Circulaire 115/10: referenced by ACD logem_loc.
- Taxx location guide (forms 190/210, negative income offset, social 90%): https://taxx.lu/fr/guide-de-la-declaration-d-imposition/revenus-de-location/

**Grade:** LIR + ACD A-Z = high. Owner-occupied VL amounts (the forfait VL itself) = **not extracted** (ACD page cookie-walled) — see §4.

---

### 2.7 Foreign income, treaties, crédit d’impôt vs exemption

**Fact.** Residents are taxable on worldwide income (Art. 5/6 architecture). Double-tax relief is **not** one method.

**No DTT → Art. 134bis ordinary credit.** The Luxembourg tax fraction corresponding to the foreign income is reduced by the equivalent foreign tax paid. Computed per **State of source**. Covered income list in Art. 134bis(2) includes PE, agricultural, liberal, capital gains, salaries, pensions, capitaux mobiliers, location, 99bis/99ter. Art. 134ter = fraction calculation (sous-totaux, losses, extraordinary).

**Art. 13:** foreign personal taxes on LU-taxable income not listed in Art. 156 are **deductible** in the relevant net-income category, but only to the extent **not imputed** under a DTT or Art. 134bis. A RGD may split imputable vs deductible.

**With DTT → the convention decides.** Typical resident patterns (verify per country in the ACD treaty collection — do **not** hard-code one method):
- **France:** largely **exemption with progression** (taux effectif) for employment, business, real property; LU social-security pensions remain taxable in LU under Art. 17 of the convention.
- **Germany / Belgium:** largely **credit method** for employment and similar.
- **Dividends/interest:** usually credit of source WHT up to the treaty rate, on top of domestic 15a (dividends).
- Art. 134bis(3)(b) allows a RGD to extend 134bis mechanics to some treaty income.

**PwC (03.08.2026):** 94 DTTs signed, 88 in force; 41 social-security agreements. List includes FR, DE, BE, US, UK, CH, etc. — https://taxsummaries.pwc.com/luxembourg/individual/foreign-tax-relief-and-treaties (secondary; use ACD’s treaty database as the operational list).

**Taxx “revenus étrangers” page describes only exemption-with-progression and says “double imposition is forbidden in the EU”. That is an oversimplification and is wrong as a general engine.** Model: treaty table → method per country × income type; fallback Art. 134bis credit if no DTT.

**Modèle 180** = annex for foreign dividends under DTT (guichet).

**Evidence.**
- Art. 13, 134bis, 134ter: LIR 2026 pp. 25, 217–219.
- Art. 115(15a) + Circulaire 115/8 for the dividend interaction.
- Guichet modèle 180: dividend page above.
- PwC treaty count: URL above.

**Grade:** LIR 134bis/13 = high. Per-country method table = **not built here**; needs ACD convention texts before the app can compute FR/DE/BE correctly.

---

### 2.8 Self-employment / freelance (Art. 14, Art. 91; CCSS; TVA)

**Commercial vs libérale.**
- **Art. 14 bénéfice commercial:** independent for-profit permanent activity participating in general economic life, if not agricultural/forest and not libérale. Includes coexploitant profits (SNC, SCS, etc.) and commandité profits.
- **Art. 91 bénéfice libérale:** independent scientific, artistic, literary, teaching, medical, legal, technical, etc.; **administrateurs/commissaires** (unless day-to-day management = Art. 95 salarié). Occasional activity still counts (Art. 91(2)).
- **Art. 93:** Arts. 16–60 (BIC profit rules) apply to libérale as far as compatible; actif net investi limited to professional assets.
- Art. 94 (old forfait BIC) **abrogated from AY 2017**.

**Occasional / small.** Art. 99(3): occasional services not in another category (e.g. entremises occasionnelles) — **not taxable if < €500/year**; deficit not offsettable.

**Voluntary / accessory (taxx, ACD practice):** accessory independent activity in ASBL/ONG/sport/culture, **exempt up to €5,000/year**; above that a **€5,000 forfait frais** may apply for listed activities. Jetons de présence: frais forfait **€15 per séance**, max **€45/month**, **€540/year**.

**Small libéral expense forfait (taxx table — confirm against ACD form 100/annex):**

| Recettes annuelles | Forfait dépenses |
|---|---|
| ≤ €2,000 | 30% of recettes |
| €2,000–€6,000 | €600 + 25% × (recettes − 2,000) |
| €6,000–€15,000 | €1,600 + 20% × (recettes − 6,000) |
| > €15,000 | €3,400 |

This is a **declaration forfait**, not a “minimum taxable profit”. **There is no LIR “minimum forfait” that taxes a phantom profit.** The “minimum” that actually bites is the **CCSS minimum cotisable**.

**Social security (independents pay both “employer” and “employee” shares of pension).**

CCSS paramètres (official table):

| Risk | 2025 | 2026 |
|---|---|---|
| Maladie soins de santé | 5.60% | 5.60% |
| Maladie prestations en espèces | 0.50% | 0.50% |
| Dépendance | 1.40% | 1.40% |
| Pension | **16%** | **17%** |
| Accident (× bonus-malus AAA) | 0.70%* | 0.65%* |
| Santé au travail | 0.14% | 0.14% |

Mandatory sum 2026 ≈ **25.15% + accident malus/bonus + mutualité (optional 0.23–2.66%)**. 2025 ≈ **24.20% + accident + mutualité**.

**Assiette (CCSS indépendants page):**
- Base = revenu professionnel (all activities cumulated).
- **Minimum cotisable = salaire social minimum** (maladie, pension, accident).
- **Maximum cotisable = 5 × SMN** (maladie, pension, accident). Dependance: no min/max.
- **First affiliation:** provisional on **SMN**.
- **Complementary to a salaried activity:** provisional on **1/3 of SMN**.
- Conjoint aidant: half of the principal’s professional income, capped at 2 × SMN; individual floor = SMN; couple may request a **pension-risk reduction** if joint income < SMN.
- Definitive assessment after ACD bulletin.

**SMN / cotisable amounts (CCSS paramètres):**

| Date | SMN monthly | Min cotisable | Max cotisable |
|---|---|---|---|
| 01.01.2025 | 2,637.79 | 2,637.79 | 13,188.96 |
| 01.05.2025 | 2,703.74 | 2,703.74 | 13,518.68 |
| 01.01.2026 | 2,703.74 | 2,703.74 | 13,518.68 |
| 01.06.2026 (indice 992.24) | 2,771.33 (non qualifié) | (CCSS 1.1.2026 table not yet restated) | plafond mensuel 13,856.63 / annuel 164,589.81 |

PwC June 2026: employee share 2026 = 2.80 + 0.25 + 8.50 + 1.40 = **12.95%**; employer pension **8.50%**. Independents therefore pay **17% pension** alone in 2026.

**TVA (AED / PFI FAQ 01.02.2025):**
- National franchise from **1.1.2025: €50,000** (was €35,000), **+10% tolerance** (€55,000) in the year of overshoot; excluded the following calendar year.
- EU small-business regime: cross-border franchise + **Union threshold €100,000**.
- Invoice mention: “TVA non applicable – Article 57 bis de la loi modifiée du 12 février 1979”.
- **The old €25,000 franchise is obsolete.** Do not ship €25,000.
- Ordinary rates (not restated in this run from tva.public.lu; well-known LU schedule, verify before shipping): **17% standard, 14% intermediate, 8% reduced, 3% super-reduced**.

**Evidence.**
- Art. 14: LIR 2026 p. 26; Art. 91–94: pp. 125–127; Art. 99(3): p. 135.
- CCSS taux/min/max: https://ccss.public.lu/fr/parametres-sociaux.html (last modified 29.12.2025)
- CCSS indépendant assiette: https://ccss.public.lu/fr/independants/cotisations-sociales/assiette-cotisation-adaptation.html
- PwC June 2026 indexation: https://www.pwc.lu/en/newsletter/2026/parametres-sociaux-juin-2026.html
- TVA franchise €50,000: https://pfi.public.lu/dam-assets/pdf/tva/sme/faq-fr.pdf
- Taxx indépendants forfait: https://taxx.lu/fr/guide-de-la-declaration-d-imposition/revenus-provenant-d-activites-independantes/

**Grade:** LIR Art. 14/91 = high. CCSS rates/min/max = high (official). TVA €50k = high (PFI official FAQ). Taxx forfait table = **medium** (practice; match to ACD form). “Minimum forfait” as a tax = **does not exist**; as CCSS floor = high.

---

### 2.9 Pensions (Art. 96, Art. 111, Art. 111bis, Art. 111ter, Art. 115(14)/14a/7/17a)

**Taxable pensions — Art. 96(1):**
1. Retirement and survivor pensions from a former salaried occupation + related advantages;
2. Rents/pensions from a caisse autonome fed by contributions + forfait d’éducation + Art. 96a rents;
3. Rents of any nature under a title, if not in 1 or 2 and not in another category;
4. Reiterated benevolent allocations not elsewhere classified.

Art. 96(3): category 3–4 only taxable if deductible for the debtor. Free housing enjoyment may be valeur locative.

**State pension (CNP/CNAP) is taxable** as Art. 96(1)1. Withholding on LU legal pensions via fiche de retenue (ACD). Foreign pensions: residents declare; DTT may assign exclusive taxing rights (FR convention Art. 17: LU social-security pension taxable in LU even if the recipient lives in France).

**Art. 115(7):** sickness, dependance and accident **cash** benefits exempt, except Art. 95a (sick pay substituting salary), Art. 96a (accident rents replacing income) and Art. 11(1a). Orphan pensions: Art. 115(14b) exempt.

**Private annuities 50% — Art. 115(14):** 50% of net arrérages of rentes viagères and other periodic viager advantages, and of net income from viager rights, if constituted **à titre onéreux** or indemnitaire, and not in Art. 10 nos 1–3.

**Art. 115(14a):** 50% of **monthly life annuities** from Art. 111bis(2) or 111ter(2) contracts (and of annuities whose early payment was taxed under Art. 99(5)).

**Art. 111bis — deduction of premiums (not the payout rate).**
- Products with an insurer or credit institution established in LU or EU/EEA passported.
- Contract ≥ **10 years**; payout **age 60–75**; capital, monthly life annuity, annual withdrawals, or combined.
- Early repayment (other than invalidity/serious illness ≥ 50% professional incapacity) → **fully taxable Art. 99(5)** (or 99(4) for illness/invalidity).
- **Max deduction Art. 111bis(7): €4,500** from the **loi du 19 décembre 2025** (L.19.12.25,2). **€3,200 for AY 2017–2025.** Individual per spouse. Prorated if not taxable all year.
- Guichet page still shows **€3,200** (last modified 09.03.2021) — **out of date for 2026**. App must use €3,200 for 2025 and €4,500 for 2026.

**Art. 111ter:** same architecture for **PEPP** Luxembourg sub-accounts; also €4,500 from 2026 (same law).

**Capital repayment of a 111bis contract is Art. 99(4) revenus divers** (not Art. 96). Taxx/Baloise: capital taxed at **50% of the standard rate** in the 111bis product narrative — the LIR hooks are Art. 99(4) + Art. 132(2) no. 5 (99(4) = extraordinary demi-taux **on request**) and Art. 115(14a) for the annuity form. App should follow: **annuity → 50% exempt (115(14a)); capital → Art. 99(4), demi-taux if the taxpayer requests Art. 131**.

**2nd pillar RCP (loi 8.6.1999):**
- Employer contributions: Art. 95(3) salarial, **20% WHT Art. 142**.
- Payout: Art. 115(17a) exempt if the regime is LRCP and (for internal regimes) the endowments were taxed as salary. Art. 115(17)/(18) for buy-outs.
- Employee extra contributions: special expenses, taxx max **€1,200/year**.

**Pensioner credits (taxx, AY 2025 and 2026 same CIP scale):**
- CIP: €300 (pension €300–935); then €300 + 2.9% of (pension − 936) up to €11,265; **€600** from €11,266–40,000; then linear down to 0 at €79,999.
- CI-CO2 pensionné: 2025 **€192**; 2026 **€216**; linear to 0 at €80,000.
- Not granted if pension < €300 or ≥ €80,000. Not cumulative with CIS/CII.
- Frais d’obtention forfait **€300** per pensioner (€25/month if partial year).

**Evidence.**
- Art. 96, 96a, 111, 111bis, 111ter, 115(7)/(14)/(14a)/(17a), 99(4)/(5), 132(2)5, 142: LIR 2026 pp. 130–132, 163–166, 181–182, 135, 214, 233.
- 111bis €4,500 / 2026: LIR 111bis(7) “4 500 euros” + taxx prévoyance article + lalux. Guichet €3,200 is stale.
- CIP/CI-CO2 tables: taxx pensions guide (last modified 16.06.2026) — **medium**; match to ACD/Mémorial before hard-coding.
- Guichet 111bis conditions (10 years, 60–75, EU/LU insurer): https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/depenses-deductibles/contrat-prevoyance-resident.html

**Grade:** LIR 96/111bis/115(14a) = high. CIP numeric table = medium. Guichet €3,200 = **do not use for 2026**.

---

## 3. Amount and rate cheat-sheet (2025 / 2026)

| Item | 2025 | 2026 | Source |
|---|---|---|---|
| PIT top marginal (class 1) | 42% | 42% (same barème) | ACD barèmes / taxx |
| Fonds pour l’emploi | 7% / 9% | 7% / 9% | taxx / CSL |
| Dependance | 1.4% | 1.4% | LIR / guichet |
| Dividend WHT LU | 15% | 15% | Art. 146 / guichet |
| Dividend 50% exemption | Art. 115(15a) | same | LIR |
| Capital tranche 115(15) | €1,500 (€3,000 joint) | same | LIR |
| Frais capitaux forfait | €25 (€50) | same | guichet |
| Interest RELIBI | 20% libératoire | same | loi 23.12.2005 |
| Speculation threshold | €500 / year | same | Art. 99bis(2) |
| Movable speculation holding | 6 months | same | Art. 99bis |
| RE speculation holding | 5 years (2025 2-year window) | 5 years from 1.10.2025 | Art. 99bis |
| Substantial participation | >10% / 5 years | same | Art. 100 |
| Art. 100/99ter rate | demi-taux global | same | Art. 132(2) |
| Art. 130(4) abattement | €50k / €100k (10y) | same | Art. 130(4) |
| Art. 130(5) inherited home | €75k | same | Art. 130(5) |
| Rental forfait | 35% / max €2,700 | same | ACD logem_loc |
| Social rental exemption | 90% (since 2024) | 90% | Art. 115(22a) |
| 111bis deduction | **€3,200** | **€4,500** | LIR 111bis(7) |
| TVA franchise | **€50,000** (since 1.1.2025) | €50,000 | PFI FAQ |
| CCSS pension (indep.) | 16% | **17%** | CCSS |
| Min cotisable (monthly) | 2,637.79 → 2,703.74 | 2,703.74 (then SMN 2,771.33 from 1.6) | CCSS |
| Voluntary activity exempt | €5,000 | same | taxx / practice |
| Occasional services exempt | €500 | same | Art. 99(3) |

---

## 4. 待证项 / open points (do not ship as facts)

1. **Luxembourg OPC distribution exemption.** 2026 Art. 115(15b) is State bonds, not funds. Confirm whether a separate exemption still exists (UCI law, Art. 97(3), or a circular) before coding “fund dividends = exempt”. Suggested check: ACD circulaire on OPC / LIR Art. 159–160 / 1915 law.
2. **Owner-occupied valeur locative computation** (forfait VL tables, Kinolaw 2023 RGD). ACD “habitation personnelle” page was cookie-walled. Needed for Art. 98(1)5.
3. **Exact 2025/2026 barème brackets from Mémorial A 590** (taxx table used as interim). Parse the Mémorial PDF.
4. **CIP / CI-CO2 official scales** — taxx 16.06.2026 table; confirm against ACD Mémorial pension barème (A N° 7 of 9.1.2025).
5. **Per-country DTT method matrix** (FR exemption-with-progression vs DE/BE credit; dividend WHT rates). Needed before any foreign-income calculator.
6. **Art. 100 indexation** — Art. 102(6) text says “revenu visé aux articles 99ter à 101”, which includes 100; confirm ACD practice on whether share acquisition prices are actually revalued.
7. **Small libéral forfait table** — match taxx to ACD notice of modèle 100.
8. **TVA rates 17/14/8/3** — not pulled from tva.public.lu in this run.
9. **RELIBI €250 de minimis** — confirm in the 23.12.2005 law.
10. **2027 budget bill** (press 8.10.2026): proposed 12-month speculation holding (instead of 6) and other CIT/PIT changes. **Not law for 2025/2026 filings.** Do not implement.

---

## 5. Suggested next steps

1. Parse Mémorial A N° 590 (24.12.2024) barème and the pension barème (A N° 7, 9.1.2025) into the app’s rate tables.
2. Pull ACD circulaires 115/8 (already have), 115/10 (social rental), and the current 111/1 (111bis) from impotsdirects.public.lu/fr/legislation.
3. Build a treaty-method table from ACD’s convention collection for FR, DE, BE, PT, IT, ES, US, UK, CH first.
4. Resolve OPC distribution treatment (open point 1) before any “fonds luxembourgeois exonérés” rule.
5. Implement Art. 102bis principal-residence tests as a questionnaire (5-year occupancy, family/professional exception, year-after-move, copropriété), not as “Art. 99a <6 months”.
6. Split 111bis: deduction cap by year (3,200 vs 4,500) vs payout (115(14a) 50% annuity / Art. 99(4) capital).

---

## 6. Source list (primary first)

**LIR 2026 (ACD coordinated text, 08.05.2026)**  
https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2026-ver-08052026.pdf

**ACD A-Z / official pages**  
- Rental: https://impotsdirects.public.lu/fr/az/l/logem_loc.html  
- Sale of immovable: https://impotsdirects.public.lu/fr/az/v/vente_immeuble.html  
- Barèmes: https://impotsdirects.public.lu/fr/baremes.html  
- RELIBI: https://impotsdirects.public.lu/fr/legislation/fiscalite_epargne.html  
- Circulaire 115/8: https://impotsdirects.public.lu/dam-assets/fr/legislation/legi08/L_I_R__n___115-8_du_15_d__cembre_2008.pdf  

**Guichet**  
- Dividends: https://guichet.public.lu/fr/citoyens/fiscalite/declaration-impot-decompte/capitaux-mobiliers/banque-dividende-interets/identifier-declarer-dividendes.html  
- 111bis (stale €3,200): https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/depenses-deductibles/contrat-prevoyance-resident.html  

**CCSS**  
- Paramètres: https://ccss.public.lu/fr/parametres-sociaux.html  
- Indépendants assiette: https://ccss.public.lu/fr/independants/cotisations-sociales/assiette-cotisation-adaptation.html  

**TVA**  
- PFI FAQ petites entreprises: https://pfi.public.lu/dam-assets/pdf/tva/sme/faq-fr.pdf  

**Legilux**  
- LIR (entry): https://legilux.public.lu/eli/etat/leg/loi/1967/12/04/n1/jo  
- RELIBI law: https://legilux.public.lu/eli/etat/leg/loi/2005/12/23/n1/jo  
- Loi 20.12.2024 (barème 2025 / 111bis related reforms): https://legilux.public.lu/eli/etat/leg/loi/2024/12/20/a589/jo  

**Secondary (cross-check only)**  
- taxx.lu guide (barème, capitaux, pensions, location, indépendants, étrangers)  
- PwC WWTS Luxembourg individual foreign tax relief (03.08.2026)  
- PwC paramètres sociaux 1.6.2026  

**Local working copies**  
- LIR 2026 PDF: `.zwork/LIR-2026.pdf`  
- LIR 2026 extracted text: `.zwork/LIR-2026.txt`
