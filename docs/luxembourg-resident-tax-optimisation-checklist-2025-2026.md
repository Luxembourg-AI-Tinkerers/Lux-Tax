# Luxembourg resident tax-optimisation checklist — employees and couples, AY 2025 / 2026

**Date:** 8 November 2026  
**Audience:** Resident employees and jointly taxed couples (including one employee + one side-business spouse). Legal optimisation only — not evasion, not aggressive structures.  
**Years:** Tax year 2025 (return filed 7 April – 31 December 2026) and tax year 2026.  
**App compared:** `packages/tax-engine/src/{engine,deductions,credits,scale2025}.ts`, `packages/contracts/src/enums.ts` (`FactCategory`).  
**Legal status of this note:** Research checklist. Not tax advice. Every number is tagged. Where ACD, guichet and LIR disagree, the conflict is written out; the app should follow the higher-grade source named in that row.  
**Revision:** 8 November 2026 — §11.1 added after the LEG-6/API-3 pass (Art. 119 n° 3 window, Class 2 without spouse, 111bis clamp); §11.2 added after the LEG-8 pass (Class 2 vs 2 × Class 1 comparison); §11.3 added after the LEG-7 pass (certificate 160 table, Form 100F case map, and the limits of both); §11.4 added after the API-4 pass (in-app notification foundation; no delivery); §11.5 added after the API-5 pass (approval invalidation on material changes, visible return-version history). §1, the per-section **App.** notes in §3–§10 and §15 predate the engine rebuild and are stale where they describe app behaviour; §11 is the current matrix. **2026-11-19 — §11.6 supersedes every earlier App flag with a code-verified status after the engine rebuild and the 2025/2026/2028 rule packages.**

**Confidence labels used below**

| Label | Meaning |
|---|---|
| **Certain** | Primary law (LIR coordonné) or ACD A–Z / guichet page actually read. |
| **High confidence** | Official political/finance-ministry document read against law, or ACD page read through a newsletter. |
| **Medium confidence** | Secondary source (taxx, PwC, financialservices.lu) used only as a cross-check or because the primary was cookie-walled. |
| **Unverified** | Lead only. Do not implement. |

**App flags**

| Flag | Meaning |
|---|---|
| ✅ computed | Engine has a code path that can produce this line. |
| 🟡 partial / wrong | Engine produces a number, but the formula, cap, article or year is legally wrong. |
| ❌ cannot compute | No code path. `FactCategory` has no field, or the category exists and the `switch` silently drops it. |

---

## 1. Conclusion summary

> **Historical verdict (2026-11-08).** The paragraph below describes the pre-rebuild engine. The engine was subsequently rebuilt with 2025/2026/2028 rule packages; **§11.6 is the current coverage matrix**. Read the paragraph as the audit that motivated the rebuild, not as a description of today's code.

A resident employee or class-2 couple can legally reduce 2025/2026 tax through **forfaits and frais réels** (Art. 105/105bis/107), **dépenses spéciales** (Art. 109–113, including 111bis 3 200 € / 4 500 €, épargne-logement 1 344/672 €, LRCP 1 200 €, ASRD prime unique), **dons Art. 112 (additive to the 480 € forfait)**, **charges extraordinaires garde 5 400 €**, **AEP Art. 110bis 4 500 €**, **AMVP Art. 129g 9 000 € (2026 only)**, **timing of December payments**, **loss reports Art. 114 (17 years)**, **plus-values holding periods** and **résidence principale Art. 102bis**. Bëllegen Akt (40 000 €/person) and prime jeune salarié (Art. 115 n° 13d) are **not** IR deductions; they sit in registration duties / salary exemption.

**The app cannot compute the large majority of this checklist.** It implements a simplified 2025-only model: FFO 540 €, FDS 480/960 €, a wrong Art. 102 mortgage schedule, a 672 € insurance cap that swallows 111bis, CIS/CIM on obsolete formulas, and a silent drop of pensions, childcare, capital, rental and plus-values. Donations are taken via `max(fds, insurance + dons)`, which **cancels small dons instead of adding them**. Art. 111bis, déplacement 99 €, invalidity forfaits, garde 5 400 €, AEP 4 500 €, AMVP, CIC, start-up credit, LRCP, ASRD, épargne-logement, prime jeune salarié, Bëllegen Akt, Art. 114 and plus-values have **no engine path**. Overall engine verdict: **not a filing-grade calculator for 2025 or 2026**. Confidence in that verdict: **Certain** (primary code vs primary statute).

---

## 2. How to use this checklist

Work top to bottom. For each item:

1. Confirm the legal box (FO / DS / CE / tarif / exemption / WHT credit / non-IR).
2. Confirm the year (2025 vs 2026 — only 111bis, AMVP, CI-CO2, CIC and épargne-logement age-limit change move).
3. Collect the evidence the ACD will ask for (fiche, attestation, contrat, bordereau).
4. Apply the timing rule (most DS/CE items must be **paid in the tax year**; December is the last chance).
5. Check the app flag before trusting any number the workspace shows.

---

## 3. Checklist — frais d’obtention (Art. 105 / 105bis / 107)

### 3.1 FFO salarié 540 € / pensionné 300 € / capitaux 25 €

- **Rule.** Art. 107 al. 1 LIR. Minimum forfaitaire, not a ceiling. Actual frais (cotisations syndicales, vêtements typiquement professionnels, littérature professionnelle) replace the forfait if higher. Partial year: monthly 45 / 25 / 2 € × full months. Couple Art. 3: doubled **if each spouse has that income type**; they may mix forfait of one with actual frais of the other (al. 4). Salarié forfait cannot exceed recettes after frais de déplacement (al. 5). Independents get **no** 540 € forfait.  
- **2025 / 2026:** unchanged. **Certain**  
- **Optimisation.** Keep receipts. Claim frais réels only when they exceed 540 € (or 300 € pension). Do not invent profession-specific forfaits — no current ACD special forfait for journalists/VRP exists.  
- **Sources.** LIR 2026 Art. 107 p. 156; [ACD frais_salar](https://impotsdirects.public.lu/fr/az/f/frais_salar.html); [ACD FFO/FDS](https://impotsdirects.public.lu/fr/az/f/ffo-fds.html).  
- **App.** 🟡 `deductions.ts` uses `max(employedSpousesCount * 540, actualEmploymentExpenses)`. No 300 € pension, no 25 € capitaux, no Art. 3 doubling test beyond a crude `employedSpousesCount`, no al. 5 cap after déplacement. Pension `FactCategory` exists and is **dropped** by the engine `switch`.

### 3.2 Frais de déplacement 99 € / unité — first 4 ignored, cap 2 574 €

- **Rule.** Art. 105bis LIR. 99 € per unité d’éloignement. First **4 units not taken into account**. Maximum **26 units = 2 574 €** per year. Independent of means of transport. Granted to **each** salarié spouse (al. 4). Cannot exceed recettes (al. 5). Partial year: 1/12 per full month.  
- **2025 / 2026:** unchanged. **Certain**  
- **Optimisation.** This is **in addition to** the 540 € FFO. A one-unit commuter already deducts 99 € on top of 540 €. A 30-unit commuter is capped at 2 574 €. Do not claim actual petrol/ticket on top of the forfait — the forfait covers all domicile–work commuting.  
- **Sources.** LIR 2026 Art. 105bis p. 153–154; [ACD frais-depl](https://impotsdirects.public.lu/fr/az/f/frais-deplacement-forfaitaires/frais-depl.html); Form 100 sheet S.  
- **App.** ❌ **cannot compute.** No `fieldKey`, no Art. 105bis code path. `MORTGAGE_DEDUCTION` / `OTHER_DEDUCTION` are not wired to FO.

### 3.3 Forfaits majorés invalides / handicapés

- **Rule.** Replace (not add to) the 540 € FFO. Degrees a)–d) reduced working capacity; e) vision ≤ 1/20 or impotence 1 515 €.  
- **2025 / 2026:** unchanged. **Certain**

| Taux de réduction de la capacité de travail | Forfait annuel majoré | vs 540 € |
|---|---|---|
| 25 % à 35 % exclusivement | 645 € | +105 € |
| 35 % à 45 % exclusivement | 675 € | +135 € |
| 45 % à 55 % exclusivement | 780 € | +240 € |
| 55 % à 65 % exclusivement | 825 € | +285 € |
| 65 % à 75 % exclusivement | 885 € | +345 € |
| 75 % à 85 % exclusivement | 930 € | +390 € |
| 85 % à 95 % exclusivement | 960 € | +420 € |
| 95 % à 100 % inclusivement | 1 020 € | +480 € |
| Vision / impotence (e) | 1 515 € | +975 € |

- **Sources.** [ACD frais_salar](https://impotsdirects.public.lu/fr/az/f/frais_salar.html) (code FO).  
- **App.** ❌ **cannot compute.** No disability input.

### 3.4 Télétravail — no general forfait; forfaitaire indemnities are taxable; home office = frais réels only

- **Rule.** There is **no legal PIT forfait “télétravail”** for the employee’s own return. Art. 95 al. 2: salaries include all indemnities other than **non-forfaitaire** reimbursements of costs incurred exclusively in the employer’s interest. ACD confirms that forfaitaire télétravail indemnities (including the 3 €/month CCT banques, n.i. 100) are **imposables** and do not fall under Art. 115 n° 2–3.  
- **Home office as frais d’obtention** is possible only as **frais réels** under circulaire L.I.R. 105/2 (4 June 2021): a **pièce à part**, exclusive or quasi-exclusive professional use (≥ 90 %), not a passage room, not disproportionate. Deductible: proportional rent/interest/charging/heating/electricity (surface of the cabinet / surface habitable), plus 100 % of costs limited to the room. Employer attestation of “no desk at the workplace” may be demanded. People who have a desk at the employer’s cannot deduct a second home office.  
- **Formation / computer:** a PC is an instrument de travail only if ≥ 90 % professional; otherwise non-ventilable.  
- **2025 / 2026:** unchanged doctrine. **Certain** on the taxable-forfait rule and on 105/2 home-office conditions.  
- **Optimisation.** Prefer **non-forfaitaire** reimbursement by the employer (exempt). If you claim a home office, document exclusive use and keep the 90 % test. Do not deduct a “télétravail forfait” — it does not exist.  
- **Sources.** [ACD forfaits-salariés](https://impotsdirects.public.lu/fr/az/f/forfaits-salaries.html) (last update 14/10/2021; still the A–Z page); circulaire [L.I.R. 105/2 du 4 juin 2021](https://impotsdirects.public.lu/dam-assets/fr/legislation/legi21/2021-06-04-LIR-105-2-du-462021.pdf), §§ 2–3.  
- **App.** ❌ **cannot compute.** No home-office, no télétravail, no instrument-de-travail module. `BUSINESS_EXPENSE` is freelance-only.

### 3.5 Formation professionnelle (Fortbildung) vs formation (Ausbildung)

- **Rule.** Circulaire 105/2 § 3: **perfectionnement** of the current profession = frais d’obtention Art. 105. **Formation initiale / retraining into a new profession** = dépenses de train de vie Art. 12 n° 1, **not deductible**. Cours de maîtrise for a practising artisan are typically Fortbildung.  
- **INFPC aide directe** (enterprises): 20 % of the qualifying training investment (Code du travail L. 542-13), taxable. The old 14 % bonification d’impôt is **abrogated from AY 2018**.  
- **2025 / 2026:** unchanged. **Certain**  
- **Optimisation.** Keep attestations that the course maintains/improves the **existing** profession. Do not claim a first-degree or career-change curriculum as FO. An independent’s training cost is a frais d’exploitation on the same Fortbildung/Ausbildung split.  
- **Sources.** Circulaire 105/2 § 3; [ACD bonif_format](https://impotsdirects.public.lu/fr/az/b/bonif_format.html).  
- **App.** ❌ **cannot compute.** No training fact type. Employee training cannot even be parked in `OTHER_DEDUCTION` and reach the FO block.

### 3.6 Other classic frais réels (still above the 540 €)

Cotisations syndicales et professionnelles; vêtements typiquement professionnels (not everyday clothing); littérature professionnelle; double ménage under conditions. All are Art. 105 frais réels, claimed only to the extent they exceed the forfait. **App:** 🟡 only via a single `fraisObtention` fieldKey on `EMPLOYMENT_INCOME`; no itemisation, no 90 % mixed-use test.

---

## 4. Checklist — dépenses spéciales (Art. 109–113)

### 4.0 Architecture and the 480 € forfait — what FDS does **not** swallow

- **Art. 109 al. 1** deducts from total revenus nets:  
  1. rentes / charges permanentes (divorce → Art. 109bis, cap 24 000 €/ex-spouse);  
  1a. intérêts débiteurs personnels **plus** primes Art. 111 al. 1 a)–b) — common cap **672 €**;  
  2. cotisations/primes Art. 110, 111, 111bis, 111ter + retenue pension secteur public;  
  3. libéralités Art. 112 — max 20 % revenus nets **and** 1 000 000 €; excess reportable 2 years;  
  4. reports de pertes Art. 114.  
- **Art. 113** minimum forfaitaire **480 €** per taxpayer (960 € two-earner class 2, with the al. 2 reduction). Covers **only** Art. 109 n° 1 and 1a, Art. 110 n° 4, Art. 111, 111bis, 111ter.  
- **Does **not** cover:** Art. 110 n° 1–3a (obligatory SS, LRCP) or Art. 112 dons. Those are **additive**.  
- **2025 / 2026:** 480/960 unchanged. No indexation. **Certain**  
- **Sources.** LIR 2026 Art. 109/113 p. 159–170 (local `lir_arts.txt` p. 159–160 confirms n° 3 dons and n° 4 Art. 114 are outside the 672 € envelope); [ACD depens_spe](https://impotsdirects.public.lu/fr/az/d/depens_spe.html); [ACD FFO/FDS](https://impotsdirects.public.lu/fr/az/f/ffo-fds.html).  
- **App.** 🟡 amounts 480/960 exist. `specialExpensesDeduction = max(480|960, insurance + dons)`. That **(a)** swallows dons below the forfait, **(b)** treats obligatory SS as if it were inside 480 €, **(c)** never adds dons on top, **(d)** has no 111bis of its own. This is the single most misleading DS line in the engine.

### 4.1 Art. 111 — 672 € envelope (private insurance + consumer interest), **not** 672 € × household members

- **Rule.** One envelope of **672 €** for (i) personal/consumer interest Art. 109 n° 1a and (ii) primes Art. 111 al. 1 a)–b) (vie, décès, accidents, invalidité, maladie, RC; secours mutuels). Majoration **+672 €** for the spouse **if Art. 3 collectif**, **+672 € per enfant with modération Art. 122**. Prorata if partial year. Excluded risks: vol, incendie, bris de glace, casco. Assureur agréé LU or UE with siège in UE.  
- **2025 / 2026:** 672 € unchanged. **Certain**  
- **Optimisation.** Fill the 672 € with whichever of interest or insurance is real. Do not put 111bis, épargne-logement or LRCP in this box. Do not multiply 672 € by “householdMembersCount” (the app’s bug: a couple + 2 children would get 2 688 € instead of 672 × 2 + 672 × enfants modérés — the legal multiplier is 1 + conjoint collectif + enfants modérés, which for a couple + 2 modérés is 4 × 672 = 2 688 € **only if** both the conjoint majoration and two enfant majorations apply; a single person with no child is 672 €, not 672 € × “members”).  
- **Sources.** LIR 2026 Art. 111 p. 162–164 (local extract: “Ce plafond est majoré de son propre montant pour le conjoint et pour chaque enfant”); [ACD cotis_prim](https://impotsdirects.public.lu/fr/az/c/cotis_prim.html).  
- **App.** 🟡 `insuranceCap = 672 * householdMembersCount`. Uses the wrong legal trigger (all members vs conjoint collectif + enfants modérés). Collapses 111bis into this cap (see 4.3). No consumer-interest input.

### 4.2 LRCP / RCP — 1 200 € (Art. 110 n° 3)

- **Rule.** Cotisations personnelles du salarié to the employer’s plan (LRCP): **1 200 € / year**. Not inside the 480 € forfait. Employer contributions are Art. 95(3) salary, 20 % WHT Art. 142. Payout: Art. 115 n° 17a exempt if the regime is LRCP and (internal regimes) endowments were taxed as salary.  
- **Art. 110 n° 3a** (independent LRCP / retraite): 20 % of the sum of net revenus Art. 10 n° 1–3 (+ salaire Art. 95 n° 6 under conditions).  
- **2025 / 2026:** 1 200 € unchanged. **Certain** (LIR + taxx cross-check; ACD cotis_prim lists 1.200 €).  
- **Optimisation.** Pay the personal LRCP slice before 31 December. Do not also deduct the same euro as Art. 111.  
- **Sources.** LIR 2026 Art. 110; [ACD cotis_prim](https://impotsdirects.public.lu/fr/az/c/cotis_prim.html).  
- **App.** ❌ **cannot compute.** `INSURANCE_DEDUCTION` is a single bucket into the 672 € cap.

### 4.3 Art. 111bis / 111ter prévoyance-vieillesse — 3 200 € (2025) / 4 500 € (2026), **per person**

- **Rule.** Compagnie d’assurances or établissement de crédit (PEPP: 111ter, sous-compte luxembourgeois). Remboursement différé ≥ 10 ans, payable au plus tôt 60 ans, au plus tard 75 ans. Souscription avant la veille du 65e anniversaire. Capital, rente viagère mensuelle, retraits annuels, or combiné. Anticipation (hors maladie grave / invalidité ≥ 50 %) → fully taxable Art. 99(5).  
- **Plafond annuel per person, each spouse calculated individually:**

| AY | Plafond |
|---|---|
| 2017–2025 | **3 200 €** |
| **2026 et suivantes** | **4 500 €** |

- LIR 2026 Art. 111bis al. 7 / 111ter al. 7 already print 4 500 € (L.19.12.25,2). ACD prévoyance-vieillesse (27.01.2026): 4 500 € from AY 2026; 3 200 € for 2017–2025. Guichet page still showing 3 200 € (09.03.2021) is **stale for 2026**. Form 100 2025 still prints 3 200 € — correct for 2025 returns.  
- **Separate** from the 672 € envelope (“s’appliquent de façon distincte et ne se confondent pas”). **Certain**  
- **Payout (not a deduction, but plan it):** rente viagère → 50 % exempt Art. 115 n° 14a; capital → Art. 99(4) revenus divers, demi-taux on request Art. 132(2) n° 5.  
- **Optimisation.**  
  - 2025 return (filed 2026): pay up to 3 200 € each.  
  - 2026: pay up to 4 500 € each — **1 300 € extra deduction per spouse** vs 2025. A class-2 couple can deduct 9 000 € in 2026 vs 6 400 € in 2025.  
  - Pay in **December** so the premium hits the tax year. Contract must already exist (or be signed) before the 65th birthday eve.  
  - Do not cash in early.  
- **Sources.** LIR 2026 Art. 111bis/111ter p. 165–167; [ACD prévoyance-vieillesse](https://impotsdirects.public.lu/fr/az/p/prevoyance_vieillesse.html); mfin Nouveautés 2026 (29.12.2025); [guichet 111bis — stale 3 200](https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/depenses-deductibles/contrat-prevoyance-resident.html).  
- **App.** ❌ **cannot compute as 111bis.** `INSURANCE_DEDUCTION` is min(amount, 672 × members). A 3 000 € 111bis prime is silently cut to 672 €. That is a **2 528 € taxable-income error** on the gap-analysis worked example. No year switch 3 200 → 4 500.

### 4.4 Épargne-logement — 1 344 € / 672 €, separate from 672 € insurance

- **Rule.** Art. 111 al. 1 c / al. 5. Caisses d’épargne-logement agréées LU or UE. Funds used for construction/achat/entretien/réparation/transformation of owner-occupied housing (incl. terrain), solar PV/thermal integrated, remboursement d’obligations for those ends. From AY 2022 ordinary entretien/réparation qualifies. Résiliation < 10 years or mauvaise affectation → imposition rectificative (exceptions: décès, incapacité permanente, > 10 ans).  
- **Plafonds (âge accompli au 1er janvier):**

| Âge accompli au 1er janvier | Plafond annuel |
|---|---|
| 18 à 40 ans accomplis | **1 344 €** |
| Autres cas | **672 €** |

- Couple collectif: plafond majoré of the **younger adult** is the 1 344 € base; + own plafond for conjoint; + plafond for each enfant modéré. **Separate** from the 672 € insurance/interest envelope. **Certain**  
- **2026 watch — loi 8775.** Projet de loi 8775 (first vote 28 October 2026, publication expected November 2026) **suppresses the 40-year age limit** on the majoré 1 344 € plafond. As of 8 November 2026 this is **not yet confirmed published**. Do not grant 1 344 € to a 41+ year old for 2026 until the Mémorial text is pinned. **High confidence** on the vote; **unverified** on promulgation.  
- **Sources.** LIR 2026 Art. 111 al. 5 (local extract p. 699–701: “de 18 à 40 ans accomplis 1.344 euros”; “fonction de l’âge du souscripteur adulte le plus jeune”); [ACD cotis-epargne-logement](https://impotsdirects.public.lu/fr/az/c/cotis-epargne-logement.html); [ACD newsletter 30.10.2026](https://impotsdirects.public.lu/fr/archive/newsletter/2026/nl301020261.html).  
- **App.** ❌ **cannot compute.** No épargne-logement fact, no age test, no 1 344/672.

### 4.5 Prime unique ASRD (assurance solde restant dû) — majoration / surmajoration

- **Rule.** Circulaire L.I.R. 111/1 du 2 novembre 2017 (RGC 7 mars 1969). A **prime unique** ASRD opens an **extra** cap on top of the 672 € envelope:  
  - Majoration: extra cap max **6 000 € + 1 200 € per enfant modéré**.  
  - Surmajoration (maison/appartement d’habitation personnelle, souscripteur > 30 ans): **8 % of the majoration maximale per year of age above 30, max 160 %**.  
  - Table (sans enfant / 1 / 2 / 3 enfants), from 6 000 / 7 200 / 8 400 / 9 600 up to 15 600 / 18 720 / 21 840 / 24 960 (50 ans et plus) + 1 200 € per extra child.  
  - Indemnité journalière (indépendants without legal compensatory indemnity): majoration of the prime portion, max **1 500 €**.  
- **2025 / 2026:** unchanged circular. **Certain** (circular + ACD cotis_prim).  
- **Optimisation.** A single premium on the home loan can deduct several thousand euros **beyond** 672 €. Age and children modérés drive the table. Interest that finances the prime unique stays in the 672 € box unless the majoration applies.  
- **Sources.** [Circulaire L.I.R. 111/1 du 02.11.2017](https://impotsdirects.public.lu/dam-assets/fr/legislation/legi17/lir-111-1-02112017.pdf); [ACD cotis_prim](https://impotsdirects.public.lu/fr/az/c/cotis_prim.html). Form 100 cases 1474–1477.  
- **App.** ❌ **cannot compute.** No prime unique, no age/children table.

### 4.6 Dons Art. 112 — additive to FDS, min 120 €, max 20 % and 1 M€, report 2 years

- **Rule.** Dons **en espèces** to organismes reconnus d’utilité publique, offices sociaux, CHL, ONGD, FNR-listed établissements, Fonds culturel national (aussi en nature), Fonds audiovisuel, Kultur|lx, SIS, dons UE/AELE similaires, dotation initiale de fondation. Minimum **120 €** total annual. Max **20 % du total des revenus nets** **and** **1 000 000 €**. Excess reportable on the **two** following AYs, same limits (Art. 109 n° 3). **Not covered by the 480 € forfait** — additive.  
- **2025 / 2026:** unchanged. **Certain**  
- **Timing.** The don must be **paid in the tax year**. A December transfer counts for that year; a 2 January transfer counts for the next year. For a December optimisation: pay before 31 December, keep the receipt, confirm the organisme is on the ACD/FNR list.  
- **Optimisation.**  
  - Always claim dons **on top of** FDS 480/960, never as an alternative.  
  - If a large don exceeds 20 % of net, the excess is not lost — report it two years.  
  - Do not “donate to save tax” beyond the 20 % / 1 M€ cap without modelling the residual. Legal, not aggressive: give to a listed organisme, keep the bordereau, declare on sheet DS.  
- **Sources.** LIR 2026 Art. 112 p. 168–170 and Art. 109 n° 3 (local `lir_arts.txt` p. 159–160); [ACD libera_dons](https://impotsdirects.public.lu/fr/az/l/libera_dons.html).  
- **App.** 🟡 `donationsDeduction` exists if `declaredDonations >= 120`, capped at 20 % of net. Missing: 1 000 000 € cap, 2-year report, **additive** treatment. Current `max(fds, insurance + dons)` **cancels** a 200 € don in a household whose other DS already exceed 480 €.

### 4.7 Art. 110 n° 1–2 — obligatory social security (unlimited) and Art. 110 n° 4 (continuée, inside 480 €)

- Obligatory salarié / non-salarié SS: unlimited DS, **not** in the 480 € forfait. The engine already subtracts `socialSecurity` from gross salary as if it were a forfait FO — that is a **net-salary** shortcut, not an Art. 110 DS line, and it double-counts if one also tries to declare CNS as DS. Independents: obligatory CCSS is Art. 110 n° 2, unlimited.  
- Assurance continuée / achat de périodes: legal cap unlimited, **inside the 480 € forfait** (Art. 113).  
- **App.** 🟡 SS is subtracted from gross (acceptable net-salary path). Continuée has no separate key. Independents’ CCSS is not modelled.

### 4.8 Art. 109 n° 1a consumer interest — 672 € shared with Art. 111 a+b

Already in §4.1. Owner-occupier mortgage is **not** here (see §7). Second-home interest is **not deductible**.

---

## 5. Checklist — tarif allowances and credits (not DS)

### 5.1 Art. 110bis AEP — abattement extra-professionnel 4 500 €

- **Rule.** Tarif allowance (not DS) of **4 500 €/year** (375 €/month) for jointly taxed spouses/partners who **both** realise professional income (commercial, agricole, libérale **or** salarié net) **and** are each personally affiliated to a social-security regime. Also granted if one is conjoint-aidant; on request if the other has been retired **< 3 years** at the start of the AY.  
- **Fiche de retenue:** each spouse already receives half (**2 250 €**) as “AC” extra-professionnel. Abattement conjoint « AC » on the 1ère fiche additionnelle = **5 520 €** = 540 + 480 + 4 500.  
- **2025 / 2026:** 4 500 € unchanged. **Certain**  
- **Optimisation.** A dual-career class-2 household takes 4 500 € off RIA — roughly 1 200–1 600 € of tax at typical marginals. If one spouse has a side-business and the other is salarié, **both** count, provided both are SS-affiliated. If the side-business spouse is not affiliated, no AEP.  
- **Sources.** [ACD abat_extrapro](https://impotsdirects.public.lu/fr/az/a/abat_extrapro.html) (page read 8 Nov 2026, wording quoted in the findings below); [ACD abat_conjoi](https://impotsdirects.public.lu/fr/az/a/abat_conjoi.html).  
- **App.** ❌ **cannot compute.** Not in `deductions.ts`, not in the questionnaire, not a fact key.

### 5.2 CIS — crédit d’impôt salarié (per person)

- **Formula 2025 and 2026 (identical):** base = annual gross including Art. 134 exempt salary.

| Annual gross | CIS |
|---|---|
| < 936 € | 0 |
| 936–11 265 € | 300 + (brut − 936) × 0.029 |
| 11 266–40 000 € | 600 |
| 40 001–79 999 € | 600 − (brut − 40 000) × 0.015 |
| ≥ 80 000 € | 0 |

- Per **person**, once for all salaries. Not combinable with CIP or CII. Advanced via the fiche; excess paid to the employee. CIS and CIP do **not** re-enter the ordinary décompte annuel (except mixed-income regularisation). **Certain**  
- **Sources.** Art. 154quater LIR; [ACD CIS 2025](https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2025.html); [ACD CIS 2026](https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2026.html).  
- **App.** ❌ wrong formula. Starts only above 11 265 €, uses `(gross-11265)*0.021+300`, so a 5 000 € or 10 000 € earner gets **0** instead of ~418 / ~563 €. Provenance still cites “LIR-ART-139ter-CIS” (obsolete article).

### 5.3 CI-CO2 salarié — 192 € (2025) / 216 € (2026)

- Same salary base and phase-out geometry as CIS.  
- 2025: 192 € on 936–40 000 €, then 192 − (brut − 40 000) × 0.0048.  
- 2026: **216 €**, then × **0.0054**. Zero below 936 € or ≥ 80 000 €. **Certain** (ACD CIS 2026 page).  
- **App.** ❌ **cannot compute.** No CI-CO2 line.

### 5.4 CIM — 3 504 € / 750 € (from AY 2025)

- Class **1a only**, on request, at least one child with modération. Not if both parents share a home with the child; not if class 2. Restitutable. Reduction by 50 % of child allocations above 2 712 €/year. **Certain**  
- **App.** Superseded — see §11 row 17: the CIM is implemented (€3,504 / 0.0612 / €750, split into `cimApplied` / `cimRefund`). Was: 2 505 € / 35 000 € / 0.025, the **2024** numbers.

### 5.5 CIP + CI-CO2 pensionné; modération 922,50 €; no “CIAC”

See [research/2025-2026-lu-tax-credits-and-classes.md](../research/2025-2026-lu-tax-credits-and-classes.md). There is **no** official “CIAC”. Dégrèvement 922,50 €/child is **not refundable** and only if no family allowance/CEDIES/SNJ was paid. Bonification Art. 123bis after expiry, with a 2025–2026 résidence alternée transitional rule. **App:** implemented — see §11.6 row 18: CIP, the Art. 122 dégrèvement, the Art. 123bis bonification and the per-child history are in the engine.

### 5.6 AMVP — abattement de maintien dans la vie professionnelle, 9 000 € (2026 only)

- **Rule.** Nouvel article **129g LIR**, loi du 19 décembre 2025 (Mémorial A 623, doc. parl. 8640). In force **1 January 2026**. Maximum **9 000 €/year** and **750 €/month** reduction of revenu imposable for residents and assimilated non-residents who are **eligible for a personal old-age pension** (vieillesse anticipée) but **continue** a commercial, agricole/forestier, libérale or salariée activity.  
- **CNAP certificate.** Guichet: request a **one-time** CNAP certificate proving (i) opening conditions of the anticipated old-age pension from age **57 or 60** and (ii) that the person has **not** claimed the pension. Age window **57–65**, affiliated to the régime général, activity in Luxembourg. Certificate valid until pension take-up. MyGuichet.lu. RGD 13 février 2026 (Mémorial A 69–72) adapt RTS, fiche, décompte 163 and DS/CE mechanics.  
- **2025:** does **not** exist. **2026:** yes. **Certain** (newsletter + guichet + mfin).  
- **Optimisation.** If a 57–65 year-old employee or side-business holder still works despite early-pension eligibility, AMVP is often the **largest single 2026 abattement** (9 000 €). Get the CNAP certificate **before** year-end; the employer can then take it into account on the fiche, or regularise via modèle 163.  
- **Sources.** [ACD newsletter 25.02.2026](https://impotsdirects.public.lu/fr/archive/newsletter/2026/nl25022026.html); [guichet certificat CNAP AMVP](https://guichet.public.lu/fr/citoyens/travail/pension/assurance-pension/certificat-cnap-abattement-fiscal.html) (05.01.2026); mfin Nouveautés 2026.  
- **App.** ❌ **cannot compute.** No age, no pension-eligibility, no 129g. UI locked to 2025.

### 5.7 Crédit d’impôt conjoncture (CIC) 2026 — **not yet a published 2026 scale**

- **What is certain.** Projet de loi **8775** (déposé 22 June 2026; **first vote 28 October 2026**; publication expected **November 2026**) reintroduces a temporary CIC for **salariés, pensionnés and indépendants**, plus a CISSM increase (81 → 179 € from **2027**) and suppression of the épargne-logement 40-year age limit. ACD newsletter 30.10.2026: CIC salarié and CIC pensionné for **June–October 2026** will be **bonified in one lump sum by 31 December 2026**. The barème itself is to be indexed on **1 January 2027**.  
- **What is not certain as of 8 November 2026.** The ACD A–Z page [`credit-impot-conjoncture-salarie.html`](https://impotsdirects.public.lu/fr/az/c/credit-impot-conjoncture/credit-impot-conjoncture-salarie.html) still prints the **2023** monthly table (4 € to 54,25 €) and a January–July 2023 bonification note. That table is **not** a 2026 legal scale. Secondary press/financialservices.lu quote ~4–54,25 €/month for 2026; **do not implement those figures as law** until the 19 December 2025 / 2026 LIR amendment or a new ACD 2026 CIC page is quoted.  
- **App.** ❌ **cannot compute.** Correctly absent. Keep it absent until the law is published. **Medium confidence** on existence of a 2026 CIC; **unverified** on amounts.

### 5.8 Crédit d’impôt start-up (2026)

- **Rule (mfin Nouveautés 2026 + press).** Resident individual investors: **20 %** of a qualifying direct equity investment in an eligible start-up, **cap 100 000 €/year**. Minimum investment **10 000 €** per start-up per year; **3-year** holding (taxx 04.03.2026; PwC/press Jan 2026).  
- **Primary LIR article** was not opened in Legilux in this run. **High confidence** on 20 % / 100 k€ from mfin; **medium confidence** on 10 k€ / 3-year holding.  
- **App.** ❌ **cannot compute.** No investment fact. P2.

### 5.9 Prime jeune salarié — Art. 115 n° 13d (exemption, not a deduction)

- **Rule from 2025.** 75 % of the prime exempt if, at payment: (1) employee **< 30 years** on 1 January; (2) **first CDI** with a LU employer (or foreign with LU établissement stable), contract signed from AY 2025; (3) first prime paid less than **5 years** ago at 1 January. Changing employer loses the exemption.  
- Annual exemptible maximum (full-time): brut ≤ 50 000 € → **5 000 €**; 50 000–75 000 → **3 750 €**; 75 000–100 000 → **2 500 €**; > 100 000 → 0. RGD 20 décembre 2024 (Mémorial A 592). **Certain**  
- **App.** ❌ **cannot compute.** No age/first-CDI/prime flags. Salary is taxed in full.

### 5.10 Bëllegen Akt — 40 000 € per person (not IR)

- **Rule.** Credit on droits d’enregistrement et de transcription (normally 7 %) for owner-occupied housing, **40 000 € per person**. Occupation 2 years (4 years for terrain à bâtir / en voie de construction). AED keeps a minimum of 100 €. Raised 30 000 → 40 000 by loi 22 mai 2024 (Mémorial A 219) for actes 1 Jan 2024 – 30 June 2025; **pérennisé** by loi 27 juin 2025 (Mémorial A 271).  
- **€45 000 claim is unverified** and opposed to the 7 July 2025 guichet page. Do not implement. **Certain** on 40 000 €.  
- **This is not an IR deduction and not an engine line.** Track it in the housing workflow (AED / notaire), not in RIA.  
- **Sources.** [Guichet Bëllegen Akt](https://guichet.public.lu/fr/citoyens/aides/logement-construction/aides-indirectes/credit-impot-actes-notaries.html) (07.07.2025); gouvernement.lu 31.01.2024.  
- **App.** ❌ no housing-duties module (acceptable if the product stays on IR; label it clearly as non-IR).

---

## 6. Checklist — charges extraordinaires (Art. 127) — **not** dépenses spéciales

### 6.1 Garde d’enfants / aides de ménage / soins — forfait 5 400 €

- **Rule.** Charges extraordinaires, abattement **forfaitaire 5 400 €/year** (since AY 2017), cannot exceed real expenses nor **450 €/month**. Children: modération + **moins de 14 ans accomplis au 1er janvier** (no age limit if handicapés). Granted **once** even if several categories cumulated. Alternative: real CE with the % of RIA table (since 2018) depending on classe d’impôt and number of modérations.  
- **2025 / 2026:** 5 400 € unchanged. **Certain**  
- **Optimisation.** Declare crèche / garderie / aide déclarée SS on sheet **CE**, not DS. If actual costs exceed 5 400 €, model the real-CE table before choosing. Same costs cannot sit in both forfait and real CE.  
- **Sources.** [ACD abat_forf_dom](https://impotsdirects.public.lu/fr/az/a/abat_forf_dom.html); [ACD charg_extra](https://impotsdirects.public.lu/fr/az/c/charg_extra.html); circulaire L.I.R. 127/1 du 2 avril 2012.  
- **App.** ❌ **cannot compute.** `CHILDCARE_EXPENSE` exists in `FactCategory` and is **dropped** by the engine `switch`. Extractor can produce the fact; the calculator ignores it.

### 6.2 Enfants hors ménage — 5 424 €/child from AY 2025

Revenue deduction, not a credit. Was 4 422 € in 2023–2024. **App:** ❌.

---

## 7. Checklist — housing: owner-occupier interest, rental, plus-values, 102bis

### 7.0 Framing error: Art. 102 is **not** frais d’obtention or mortgage interest

- Art. 102 LIR regulates **prix d’acquisition / plus-values** (99bis–101). Alinéa 8 (old remploi rule) was **supprimé** by art. 18 of the loi du 22 mai 2024.  
- Owner-occupied housing is a **valeur locative** under **Art. 98 al. 1 n° 5**; related interest is **frais d’obtention of that category (Art. 105)**, **not** Art. 111, **not** Art. 102.  
- **App.** 🟡 `engine.ts` provenance `LIR-ART-102` and `deductions.ts` comment “Art 102 LIR” are **wrong citations**. The 4 000/3 000/2 000 numbers exist but on the **wrong duration schedule** (rolling 0–5 / 6–10 / >10 from `occupancyYear`, and `occupancyYear` is never passed a valeur-locative fixation year in the tested paths).

### 7.1 Owner-occupier mortgage interest — ACD schedule from AY 2024

- **ACD operational rule (habit_pers, 18.02.2025), from AY 2024**, counted from the **année de fixation de la valeur locative**:

| Période | Plafond annuel per qualifying person |
|---|---|
| Année de fixation **+ première année qui suit** | **Intégralement** (no numeric cap) |
| Deuxième année qui suit + les trois années suivantes (years 3–6) | **4 000 €** |
| Cinq années subséquentes (years 7–11) | **3 000 €** |
| Années suivantes (year 12+) | **2 000 €** |

- Majoration: **+ own amount** for conjoint/partenaire **if imposés collectivement**; **+ own amount** for **each enfant with modération**. Formula: cap × (1 + conjoint_collectif + enfants_modérés). **No prorata temporis** of the cap.  
- Before libre disposition: intérêts **intégralement** deductible + frais d’ouverture de crédit.  
- Résidence **secondaire**: intérêts **non** déductibles (VL = 0 € since 2017).  
- Bien **loué**: intérêts as FO of rental net, no owner-occupier cap.  
- **Conflict (do not silently reconcile).** ACD (Feb 2025) = 2 years unlimited then 4 000/3 000/2 000 by duration since fixation. Gouvernement note 31.01.2024 = 4 000 for years 1–6 with **no unlimited first two years**. taxx.lu (23.03.2026) presents a date-of-availability table with “always intégral after 2023” — **not** the ACD rule. **Follow ACD habit_pers.** **Certain** as ACD doctrine; **high confidence** that LIR 2026 body does not restate the 4 000/3 000/2 000 as a standalone article.  
- **Sources.** [ACD habit_pers](https://impotsdirects.public.lu/fr/az/h/habit_pers.html); [gouvernement logement 31.01.2024](https://gouvernement.lu/dam-assets/documents/actualites/2024/01/31-mesures-logement-fiscalite/mesures-adoptes-logement-et-fiscalit-31012024.pdf).  
- **App.** 🟡 uses 4 000/3 000/2 000 × `householdMembersCount` (all members, not 1+conjoint collectif+enfants modérés), no “first two years intégral”, no fixation-year input wired from the questionnaire in the engine tests, wrong Art. 102 label.

### 7.2 Rental — forfait 35 % / max 2 700 € (private patrimoine, ≥ 15 years)

- **Frais réels (unlimited)** if not borne by the tenant: interest and loan fees, rente arrérages, gérance/concierges, **impôt foncier**, redevances communales, foreign personal taxes, entretien/réparation (large works 2–5 years), nettoyage, amortissement, insurance, fonds de travaux.  
- **Forfait option:** only if the built property is **entirely private patrimoine** and construction completed **≥ 15 years** on 1 January of the AY. Forfait = **35 % of gross rent, max 2 700 € per year per building**. Does **not** cover (still deductible **in addition**): interest, loan fees, rente, gérance, impôt foncier, redevances, foreign personal taxes. Return to frais réels possible; then wait **15 years** to re-elect. RGD 23.10.1980.  
- **Amortissement (private patrimoine, ACD table):** 1.5 %/2 % (< 30 years), 2 %/2.5 % (30–60), 3 %/4 % (> 60); 2.5 %/3 % pre-1941 base; **10 %** durable energy renovation of rental housing (< 9 years) with Kinolaw aid (6 % → 10 % from 2026 per mfin); **2 %** rental housing; **4 %** for up to **two** rental buildings completed < 5 years; VEFA 2024–30.6.2025 (and 1.7–30.9.2025 with compromis by 30.6) always 2 %; land 20 % of purchase price if unknown; works ≤ **2 500 € TTC** immediately deductible.  
- **There is no general 40 % or 50 % exemption for ordinary residential lets.**  
- **2025 / 2026:** 35 % / 2 700 € unchanged. **Certain**  
- **Sources.** [ACD logem_loc](https://impotsdirects.public.lu/fr/az/l/logem_loc.html) (24.02.2026); Art. 98 LIR 2026 p. 134.  
- **App.** ❌ **cannot compute.** No rental income category. Plan defers it.

### 7.3 Social rental — Art. 115 n° 22a: 90 % of net exempt (since AY 2024)

- **90 %** of net rental income from **organismes conventionnés** under Art. 49 of the loi du 7 août 2023 (logement abordable), from **AY 2024**. AY 2023: 75 %. AY 2017–2022: 50 %. Circulaire L.I.R. 115/10 du 18.08.2023. Losses on such property stay 100 % deductible. **Certain**  
- **App.** ❌.

### 7.4 Plus-values — timing (securities 6 months; real estate 5 years; no Art. 99a)

| Asset | Holding | Result |
|---|---|---|
| Movable / “autres biens” (shares, crypto, fund units) | **≤ 6 months** | Art. 99bis spéculation, ordinary rates; annual spéculatif profit **< 500 € exempt** |
| Same, participation ≤ 10 % | **> 6 months** | **Exempt** |
| Same, participation **> 10 %** (5-year lookback, family) | any | Art. **100**, demi-taux global Art. 132(2) n° 2; abattement Art. 130(4) **50 000 € (100 000 € joint)** over 99ter–101, 10-year recall |
| Immeubles | **≤ 5 years** | Art. 99bis, ordinary rates, max 42 % without fonds |
| Immeubles | **> 5 years** | Art. 99ter, demi-taux (ACD max 21 % without fonds) |
| **Résidence principale** | Art. **102bis** definition + Art. **99bis(3) / 99ter(6)** | **Exempt** |
| Sale to État / commune / Fonds du Logement | Art. **102ter** | Exempt (not via legal préemption) |

- **There is no Art. 99a.** 6 months is movable property; real estate speculation is **5 years**.  
- **Art. 102bis résidence principale:** habitual residence since acquisition/completion **or at least during the 5 years** preceding the sale. 5-year test waived for **family or professional** relocation. Assimilated: not occupied but previously occupied, no other home, family/professional reason; sold in the year after moving to a new home. Copropriété within the taxpayer’s quote-part. Normal dépendances count.  
- **2025 transition (do not generalise):** properties realised 1.1.–30.6.2025 (and 1.7.–30.9.2025 with compromis at AED by 30.6.2025) used a **2-year** “récemment acquis” test. From 1.10.2025 the ordinary 5-year split applies again.  
- **Timing optimisation (legal):**  
  - Securities: hold **> 6 months** (non-substantial) to exit Art. 99bis.  
  - Real estate: hold **> 5 years** unless 102bis applies, and document family/professional relocation if the 5-year occupancy is short.  
  - Do not sell a 102bis home and a spéculatif lot in the same structure without modelling 102ter / 102quater (roll-over 1.1.2024–30.9.2025, now closed).  
- **2027 press draft** (12-month speculation holding) is **not law** for 2025/2026. Do not implement.  
- **Sources.** LIR 2026 Art. 99bis/99ter/100/102bis/102ter/102quater/130(4)/132(2) pp. 136–148, 212, 214; [ACD vente_immeuble](https://impotsdirects.public.lu/fr/az/v/vente_immeuble.html).  
- **App.** ❌ **cannot compute.** No plus-value category. No 102bis questionnaire.

---

## 8. Checklist — losses Art. 114, independent side-business, CCSS

### 8.1 Art. 114 — report of losses as dépenses spéciales

- **Rule.** Art. 109 al. 1 n° 4: “les pertes antérieures reportées pour autant qu’elles répondent aux conditions fixées à l’article 114.”  
- Art. 114 (as reformed, 17-year carry-forward from 2017 losses): a loss is deductible only to the extent it could not be compensated earlier; **only the taxpayer who suffered the loss** can deduct it (identity of the taxable person); carry-forward **17 financial years** for losses from 2017 onward (pre-2017 losses remain on the older indefinite rule). Abuse-of-law can refuse use (Cour, 21 May 2024).  
- Residents: this is the path for **prior-year negative revenus nets** (rental, divers, and — via the net-income mechanics — independent losses that were not already absorbed). It is **not** a new 2025/2026 number; it is a **carry-forward inventory** the app must keep year to year.  
- **2025 / 2026:** 17-year rule unchanged. **Certain** on Art. 109 n° 4 (local LIR extract); **high confidence** on 17 years (financialservices.lu 29.09.2026 + chateaux.law + circulaire 114/1 2004 for the “only the sufferer” principle).  
- **Optimisation.** Track the remaining loss stock per year of origin. Use it against a year that has positive RIA (e.g. a large plus-value or a high salary year) rather than letting a 17-year clock run out. Do not “buy” losses from another person.  
- **Sources.** LIR 2026 Art. 109 n° 4 and Art. 114; [financialservices.lu report pertes](https://www.financialservices.lu/fr/insights/tax-loss-carry-forward-luxembourg) (29.09.2026); circulaire L.I.R. 114/1 (15.09.2004).  
- **App.** ❌ **cannot compute.** No prior-loss inventory, no Art. 114 code path. `taxYear` is accepted and ignored.

### 8.2 Side-business spouse (freelance / libérale / commerciale / e-commerce / AirBnB / YouTube)

This is the shared-context case: one spouse salarié, the other (or the same person) independent.

| Topic | Rule | App |
|---|---|---|
| Profit | Art. 14 (commercial) / Art. 91 (libérale). Art. 94 forfait **abrogated 2017**. No LIR “minimum forfait profit”. | 🟡 `gross − expenses`, floored at 0. No CMS, no amortissement, no CII. |
| Occasional services | Art. 99(3): **< 500 €/year exempt**, deficit not offsettable. | ❌ |
| Voluntary / accessory ASBL/ONG/sport | Practice: exempt up to **5 000 €/year**; above that a 5 000 € frais forfait may apply. Jetons de présence: 15 €/séance, max 45 €/month, 540 €/year. **Medium confidence** (taxx/practice; match to form 100). | ❌ |
| Small libéral expense forfait (taxx table 30/25/20 %, cap 3 400 €) | Declaration forfait, not a minimum taxable profit. **Medium confidence**. | ❌ |
| FFO | Independents: **no 540 €**. | 🟡 engine may count a freelance-only person as 0 salarié (OK) or as 1 if mixed. |
| CII / CI-CO2 indépendant | Art. 152ter, **not cumulative** with CIS. | ❌ |
| AEP 4 500 € | Granted if both spouses have professional income **and** both SS-affiliated. Salarié + freelance **qualifies**. | ❌ |
| CCSS | Independents pay both shares. Pension **16 % (2025) / 17 % (2026)**. Maladie 5.60+0.50, dépendance 1.40, accident ~0.70/0.65 × malus. Min cotisable = SMN; max = 5 × SMN. Complementary to a salaried activity: provisional on **1/3 of SMN**. | ❌ |
| TVA | Franchise **50 000 € since 1.1.2025** (old 25 000 obsolete), +10 % tolerance. | ❌ (out of PIT engine; flag in the freelance module). |
| AirBnB / YouTube | Location → Art. 98 (35 % forfait only if ≥ 15 years private patrimoine). YouTube/royalties → Art. 98 n° 3 or Art. 14/91 depending on organisation. Plus-values on channel sale → 99bis/100. | ❌ |

- **Sources.** LIR Art. 14/91/93/94/99(3); [CCSS paramètres](https://ccss.public.lu/fr/parametres-sociaux.html) (29.12.2025); [CCSS indépendants](https://ccss.public.lu/fr/independants/cotisations-sociales/assiette-cotisation-adaptation.html); [PFI TVA FAQ](https://pfi.public.lu/dam-assets/pdf/tva/sme/faq-fr.pdf).  
- **Class interaction.** Married residents are **class 2 by default**. A side-business does not change that. Art. 3ter individual taxation is a **joint irrevocable** election by 31 December N+1. PACS partners are **separate by default**.

---

## 9. Timing calendar — December and year-boundary actions (legal, not aggressive)

| Action | Why December / boundary matters | Year it hits |
|---|---|---|
| Pay Art. 111bis / 111ter premium | Premium must be paid in the AY; 2025 cap 3 200 €, 2026 cap 4 500 € | Year of payment |
| Pay don Art. 112 ≥ 120 € | Paid-in-the-year rule; additive to FDS | Year of payment |
| Pay LRCP 1 200 € / fill 672 € insurance | Same paid-in-the-year rule | Year of payment |
| Pay garde / aide à domicile | CE forfait 5 400 €, 450 €/month | Year of payment |
| Souscrire 111bis before 65e anniversaire eve | Eligibility, not just payment | Contract date |
| Sign first CDI / keep same employer if prime jeune salarié | Exemption lost on employer change | Payment year |
| Hold securities > 6 months | Exit Art. 99bis | Sale date |
| Hold RE > 5 years or document 102bis | Exit 99bis / exempt principal home | Compromis / acte date |
| CNAP AMVP certificate (2026) | Employer fiche or modèle 163 regularisation | 2026 only |
| Bëllegen Akt occupation 2 years (4 if terrain) | AED credit, not IR | Acte + occupation |
| Art. 3ter election (individual taxation) | Joint, irrevocable, **31 December N+1** | N+1 deadline |
| PACS class-2 joint request | Partnership + common home all year; forces assiette | 31 Dec N+1 |
| File modèle 100 / 163 | 31 December N+1; 2025 window 7 April 2026 – 31 December 2026 | N+1 |
| CIC 2026 bonification | June–October 2026 CIC to be paid in one lump by **31 December 2026** (if 8775 is promulgated) | 2026 |
| Don excess report | Art. 109 n° 3: two following AYs | N+1, N+2 |
| Art. 114 loss stock | 17-year clock from year of loss (2017+) | Inventory |

**Do not** shift income into a later year by backdating, do not donate to a non-qualifié organisme, do not create a fictitious home office, do not claim 111bis inside 672 € twice. Those are not optimisations.

---

## 10. Tax classes and filing (needed to price the checklist)

- **Class 2** = 2 × Tarif(RIA/2) (Art. 121). Married residents: **collective by default** unless both elect Art. 3ter by 31 December N+1. Partners: separate by default; class 2 only on joint request if common home + partnership all year.  
- **Class 1a** (Art. 120bis, rewritten for 2025): Tarif applied to RIA − (79 380 − RIA)/4 for RIA ≤ 79 380, with 39/40/41/42 % marginal caps. 65+ = completed 64th year **on 1 January**. Widows 1a (3-year class 2 window after death). Divorcé without child = class 1, possibly class 2 for 3 years.  
- **Barème 2025 = barème 2026** (Art. 118, loi 20 décembre 2024, Mémorial A 589). First exempt bracket 13 230 € (class 1) / 26 460 € (1a and 2). Fonds pour l’emploi 7 % / 9 % at 150 000 / 300 000 (class 2).  
- **App.** ✅ — see §11.6 row 30. Official 23-bracket Art. 118 scale, Art. 120bis Class 1a, Art. 121 splitting, Art. 124/126 rounding, and class assignment from the questionnaire (`class-resolution.ts`).

---

## 11. App compute matrix (this checklist vs `packages/tax-engine`)

Legend: ✅ computed · 🟡 partial / wrong · ❌ cannot compute · `stale — see tracker` = row written before the 2026-11-08 engine rebuild; do not read it as current status.

> **Status note (2026-11-08).** This matrix predates the Phases 0–11 engine rebuild and the 2026-11-08 implementation passes, and it is superseded by [`implementation-tracker.md`](../implementation-tracker.md) wherever the two conflict. Rows 10, 17, 18, 30 and 34 carry a status re-verified in the 2026-11-08 passes; rows 5 and 6 carry the historical marker below, and row 22 stays ❌ with a tracker reference. LEG-4 (foreign-taxed securities counted twice) and LEG-5 (Art. 3ter individual assessment with foreign income) have no row in this matrix — both are recorded in the tracker’s third-pass section and `gap-check-2026-11-08.md` §7. Rows 4, 20 and 23 keep an explicit ❌ because the reason is legal or external, not an implementation state: row 4 would be taxable even if implemented, row 20 is held by the publication gate until the 2026 CIC table exists, and row 23 is outside the income tax. A row the rebuild contradicts is marked `stale — see tracker` rather than given a new status here — the tracker and `gap-check` §6–§12 are the current record. §11.1 records the two LEG-6 items that had no row in the matrix (the Art. 119 n° 3 window, Class 2 without a spouse) and refines row 10 for the 111bis clamp. §11.2 records the LEG-8 comparison (Class 2 vs 2 × Class 1 vs Art. 3ter reallocation), which has no matrix row either. §11.3 records the LEG-7 certificate 160 table and Form 100F case map, which update row 34. §11.4 records the API-4 notification foundation, which changes no computed line. §11.5 records the API-5 approval invalidation and return-version history, which also change no computed line.

| # | Checklist item | App | Where it fails |
|---|---|---|---|
| 1 | FFO 540 € salarié | stale — see tracker | was: no pension 300, no 25 capitaux, no al. 4/5 |
| 2 | Déplacement 99 € / 2 574 € | stale — see tracker | was: no fact, no Art. 105bis |
| 3 | Invalidity forfaits 645–1 515 € | stale — see tracker | was: no input |
| 4 | Télétravail forfait | ❌ (and should stay ❌ — it is taxable) | ACD forfaits-salariés |
| 5 | Home office frais réels 105/2 | stale — see tracker | was: no 90 % / surface module |
| 6 | Formation Fortbildung | stale — see tracker | was: no fact |
| 7 | FDS 480 / 960 | stale — see tracker | was: amounts OK, additive rules wrong |
| 8 | Art. 111 672 € envelope | stale — see tracker | was: × householdMembers instead of 1+conjoint+enfants modérés |
| 9 | LRCP 1 200 € | stale — see tracker | was: collapsed into 672 € |
| 10 | Art. 111bis 3 200 / 4 500 € | ✅ | Implemented per souscripteur — €3,200 (2025) / €4,500 (2026). The contributor count is clamped to the assessed persons, so a stale “2” cannot double a single or widowed filer’s cap (€3,200 / €4,500 for one person, €6,400 / €9,000 for a couple), and `LIR-ART-111bis` provenance carries `declared`, `cap` and `contributors`. Open (LEG-6 review W1): the DTO and the form still show “1 or 2” for a widow(er), so the clamp is invisible. See §11.1 — LEG-6 |
| 11 | Épargne-logement 1 344 / 672 | stale — see tracker | was: no fact |
| 12 | ASRD prime unique table | stale — see tracker | was: no fact |
| 13 | Dons Art. 112 additive, 120 € / 20 % / 1 M€ / report | stale — see tracker | was: `max()` swallows; no 1 M€; no report |
| 14 | AEP Art. 110bis 4 500 € | stale — see tracker | was: not asked |
| 15 | CIS official formula | stale — see tracker | was: `credits.ts` |
| 16 | CI-CO2 192 / 216 | stale — see tracker | was: no line |
| 17 | CIM 3 504 / 0.0612 / 750 | ✅ | Implemented in `credits.ts` + `engine.ts`: €3,504 up to RIA €60,000, linear 0.0612 down to €750 at €105,000, €750 above, minus 50 % of allocations over €2,712. Split into `cimApplied` (imputed against the cote) and `cimRefund` (excess paid out, Art. 154ter al. 2); the refund is included in `balancePayableOrRefund` and the summary card subtracts it so the credit is not counted twice. Reachable for SINGLE, DIVORCED and WIDOWED parents with a moderated child — `apps/api/src/modules/calculations/class-resolution.ts` resolves status, child count and the single-parent default once, so class 1a and the CIM gate share one resolved household situation. Not modelled: CIM pro-rata by months, the “married during the year” exclusion, per-child allocation beyond `childAllocations`; pre-LEG-3 snapshots are not backfilled. LEG-3 closed — see tracker, third pass |
| 18 | CIP / modération 922,50 | ✅ | CIP implemented (`credits.ts`): pension credit and its CI-CO2 (tracker cases €500 → €300, €20,000 → €600). Art. 122 dégrèvement and Art. 123bis bonification implemented at €922.50 per child: the dégrèvement is non-refundable and capped at the tax still due, driven by the per-child `moderatedChildrenWithoutBenefit` count; the bonification phases out between RIA €67,400 and €76,600 and the income cap is lifted from six relief-generating children; constants are in the rule package and both formulas are pure functions. Remaining limitation: per-child history is not modelled — at most two bonifications per child and the résidence-alternée rule cannot be enforced, and the engine cannot tell that the same child was counted in both reliefs (it warns only when the counts exceed the declared children). LEG-2 closed — see tracker, third pass |
| 19 | AMVP 9 000 (2026) | stale — see tracker | — |
| 20 | CIC 2026 | ❌ (keep ❌ until law published) | — |
| 21 | Start-up credit 20 % / 100 k€ | stale — see tracker | — |
| 22 | Prime jeune salarié 75 % / 5 000 | ❌ | Salary taxed in full — LEG-10 open, see tracker |
| 23 | Bëllegen Akt 40 000 | ❌ (non-IR) | — |
| 24 | Garde CE 5 400 € | stale — see tracker | was: `CHILDCARE_EXPENSE` dropped |
| 25 | Owner-occupier interest ACD 4 000/3 000/2 000 + 2y intégral | stale — see tracker | was: wrong schedule, wrong multiplier, Art. 102 label |
| 26 | Rental 35 % / 2 700 € | stale — see tracker | was: no category |
| 27 | Social rental 90 % | stale — see tracker | — |
| 28 | Plus-values 6 months / 10 % / 102bis | stale — see tracker | — |
| 29 | Art. 114 losses 17 years | stale — see tracker | was: no inventory |
| 30 | Barème Art. 118 / 120bis / 121 | ✅ | Implemented in `rules/2025.ts` + `scale.ts` (Art. 126 floor to €50, Art. 124 cote floor, Art. 121 Class 2 splitting, Art. 120bis caps). The 2026-11-08 pass fixed the solidarity surcharge that inflated the final liability on every ordinary return; final-liability tests now pin Class 1 €60k, Class 2 €100k, Class 1a €26,460 and the 7 % / 9 % thresholds. See [docs/lir-118-121-bareme-2025-2026.md](lir-118-121-bareme-2025-2026.md) |
| 31 | taxYear 2025 vs 2026 routing | stale — see tracker | was: one hard-coded 2025 scale |
| 32 | Pension / capital / foreign income | stale — see tracker | was: categories dropped or absent |
| 33 | NON_RESIDENT refusal | stale — see tracker | was: `residence` unused |
| 34 | Form 100 official sheets | ✅ / 🟡 partial | Case-numbered since LEG-7: `form100-case-map.ts` emits official page / sheet / case rows (S 701 and 730/742; DS 1601/1471/1503/1525/1553/1609/1611; RD 1901/1903; P 801; CM 901; L 1001/1033; CE 1715; Enfants 228; Recap 0621; C/A 501/502) with spouse columns 702/1602/1902/802/1904/902/1002/502 and `personName`, and the 160 table maps or explicitly warns on every certificate-shaped code it recognises — a bare multi-letter code outside the table is still silent (F3, §11.3). Remaining: category-level precision — `1553` is not split, Art. 14 versus Art. 91 profit is not distinguished, and foreign income is not split by category sheet; `unsupportedCertificateCodes` is neither persisted nor rendered; two e2e specs still assert the old box shape; the 101/102/103/105/141 numeric codes are brief-supplied. See §11.3 — LEG-7 |

**As written before the rebuild** — items the app could then “compute” without lying about their legal box: FDS 480/960 as a number; fonds 7/9 thresholds; a freelance `gross − expenses`; SS subtracted from gross. Everything else on the user’s list was then either missing or legally mis-shaped. This paragraph is historical; see the status note above and the tracker for the current state.

### 11.1 Class 2 window, spouse-less Class 2 and the 111bis clamp (LEG-6, 2026-11-08)

Two items from §10 had no row in the matrix above; the third refines row 10. They are recorded here rather than renumbered into the matrix; the statuses below were verified in the LEG-6 pass, not carried over from the rebuild.

| Checklist item | App | What is implemented, and where it stops |
|---|---|---|
| Art. 119 n° 3 b–c — three-year Class 2 window after a death, and for a divorced filer who was Class 2 in the five years before the divorce | ✅ | `class-resolution.ts` derives the class from the tax year and the event year: `elapsed = taxYear − eventYear ∈ [0, 3]` keeps Class 2 (event year + three following years). `spouseDeathYear`, `divorceOrSeparationYear` and the `class2BeforeEvent` checkbox are asked for WIDOWED / DIVORCED only. A missing year falls back to the default class — Class 1a for a widow(er); for a divorced filer Class 1a with a moderated child or at 65+, otherwise Class 1 — and raises a warning instead of assuming a year. Boundary tested: death in 2024 → Class 2 in 2024–2027, Class 1a in 2028. Not modelled: the five-year history is a self-declared checkbox, not reconstructed from prior returns. |
| Class 2 without a current spouse | ✅ | A widow(er) or divorced filer inside the window keeps the Art. 121 tariff (`2 × Tarif(RIA/2)`) although the workspace holds no spouse, and the couple’s collective extras are removed: Art. 111 / épargne-logement / mortgage multiplier, 960 FDS, AEP, doubled Art. 115 n° 15 tranche. Member selection is role-aware — a `VIEWER` is never a spouse, the acting filer is preferred, and a WIDOWED / DIVORCED status ends the spouse link even if a stale `ACTIVE` `CO_FILER` row survives. Reporting caveat: `assessmentMode` still reports `COLLECTIVE` for this filer; the amount is unaffected. |
| Art. 111bis contributor clamp (refines row 10) | ✅ | A second souscripteur must be a second assessed person: `resolveArt111bisContributors` caps the declared 1/2 at the assessed-person count, and the service already sends 1 when `spouseUserId` is null, so a stale couple answer cannot reach a single or widowed filer. Replayable through `LIR-ART-111bis` (`declared`, `cap`, `contributors`); the couple cap is unchanged at €6,400 / €9,000. Open (review W1): the form still offers “1 or 2” to a widow(er). |

The same pass corrected the Art. 98 n° 5 / 105 provenance multiplier, which reported 2 for a spouse-less Class 2 filer while the deduction used 1 — reporting only, no amount changed.

**Still stale in this matrix.** 25 rows keep `stale — see tracker`: 1–3, 5–9, 11–16, 19, 21, 24–29 and 31–33. Neither the LEG-6/API-3 pass, the LEG-8 pass nor the LEG-7 pass re-verified any of them individually, and none alters their historical notes. Rows 4, 20, 22 and 23 keep an explicit ❌ (taxable by law, publication gate, LEG-10 open, non-IR); rows 10, 17, 18 and 30 stay ✅, and row 34 is ✅ on case numbering with the partial caveats in §11.3. The per-section **App.** notes in §3–§10, the verdict in §1 and the next steps in §15 all predate the rebuild and are stale — [`implementation-tracker.md`](../implementation-tracker.md) is the current record.

Run record for this note: `implementation-tracker.md`, fourth pass, and [`gap-check-2026-11-08.md`](../gap-check-2026-11-08.md) §8 — 131/131 tests, `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 29/29. API e2e and browser rendering were not run, so the questionnaire fields are inspection-only.

---

### 11.2 Class 2 vs 2 × Class 1 comparison (LEG-8, 2026-11-08)

The comparison §10 implies for a married couple — collective Class 2 by default, unless both elect Art. 3ter by 31 December N+1 — had no row in the matrix either. It is implemented as a read-only estimate: the app prices each assessment mode, it does not recommend one.

| Checklist item | App | What is implemented, and where it stops |
|---|---|---|
| Class 2 vs 2 × Class 1 vs Art. 3ter reallocation | ✅ | `GET /api/workspaces/:workspaceId/scenario-comparison` returns `ScenarioComparisonDto`: the three runs (`COLLECTIVE`, `INDIVIDUAL_PURE`, `INDIVIDUAL_REALLOCATION`), each `finalTaxLiability`, both deltas against the collective run, the year and rule-package version, and the merged `warnings` / `unsupported` entries. `LuxembourgTaxEngine.compareAssessmentModes` is pure — three `calculate` calls on shallow copies, the caller’s params untouched. The runs are **non-persisting**: the workspace update and the `TAX_CALCULATED` audit write sit behind `shouldPersist(options)`, so opening the comparison cannot overwrite `calculationResult`, `estimatedTaxBalance` or `status`. The `TaxCalculatorView` card shows the three totals, both deltas and the Art. 3ter 31 December N+1 deadline note, and labels the figures an estimate. |
| Who is offered the table | ✅ / ⚠️ | `comparisonEligible` is true only for a **married Class 2 couple with an assessed spouse**. A widow(er) inside the Art. 119 n° 3 window, a divorced filer, a PACS couple and a married filer without a joined `CO_FILER` get `comparable: false` and the card renders “Only a Class 2 couple can compare these scenarios.” **⚠️ Narrower than the law:** a PACS couple assessed collectively may legally compare reallocation (`luxembourg-tax-resident-gap-analysis.md:802`) and now sees no table. |
| What is not modelled | ⚠️ | Reallocation uses the questionnaire’s `reallocationPercentPrimary`; the card cannot vary the share. The comparison is not audited (no event type for “comparison viewed”). It is built from three separate workspace reads, so a fact edit landing between them can mix snapshots — the result is still never persisted. Contract text still states the old class-only rule for `comparable` and claims a PACS couple gets three identical runs (review round 2 W1/W2). |

Run record for this note: `implementation-tracker.md`, fifth pass, and [`gap-check-2026-11-08.md`](../gap-check-2026-11-08.md) §9 — 140/140 tests (24 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 31/31. API e2e and browser rendering were not run, and no test executes `calculateTax` / `compareScenarios`, so the route, the eligibility wiring and the React card are transpile + inspection + helper-probe evidence. Observed on the 2025 package for a 60,000 + 40,000 couple: collective €13,381.21, pure €14,335.65, reallocation €13,363.02 (deltas −€954.44 / +€18.19) — observation, not golden values.

---

### 11.3 Certificate 160 and Form 100F case map (LEG-7, 2026-11-08)

Row 34 above is the matrix entry for the filing map. LEG-7 replaced the sheet-only labels with official case numbers and added a 160 code table; the statuses below were verified in that pass, not carried over from the rebuild.

| Checklist item | App | What is implemented, and where it stops |
|---|---|---|
| Certificate 160 codes | ✅ | `packages/tax-engine/src/forms/certificate160.ts` maps 101/102 (gross salary), 103 (social contributions), 105 (withholding), 141 (mortgage interest), S (salary), P (pension) and LRCP. C and R, plus the withholding-base letters FD/FO/FFO/DS/FDS/CE/AC, are explicit `supported: false` rows with a note, and an unknown code returns “not supported”. `engine.ts` resolves the code before the category switch, so a supported code fills its line even when the stored category disagrees; an unsupported or unknown code warns with the code and fact id and is skipped. Any bare letter A–Z is certificate-shaped, so an unlisted letter warns instead of vanishing. |
| Form 100F case map | ✅ | `apps/api/src/modules/filing/form100-case-map.ts` carries page / sheet / case for S 701 and 730/742, DS 1601/1471/1503/1525/1553/1609/1611, RD 1901/1903, P 801, CM 901, L 1001/1033, CE 1715, Enfants 228 and Recap 0621, plus C/A 501/502 and the spouse columns 702/1602/1902/802/1904/902/1002/502. Computed credits are `kind: COMPUTED`, the CIM is a request box on Enfants 228, foreign income is an `INSTRUCTION` on RD 1081/1082 rather than case 1101, and freelance revenue/expenses net per owner to one 501/502 line (loss at `0.00` plus an Art. 114 note). `personName` is populated and legacy packages fall back to `boxNumber` / `n/a`. |
| What is not modelled | ⚠️ | Category-level precision remains: `1553` is not split, Art. 14 versus Art. 91 profit is not distinguished, and foreign income is not split by category sheet (S/P/CM/L). `unsupportedCertificateCodes` is returned but neither persisted nor rendered; `personName` is not displayed. A `CO_FILER`-generated package uses the `PRIMARY_FILER` column convention, not the calculation’s acting-user split (review F1; owner names stay correct, no amount lost). A bare multi-letter code outside the table is still dropped silently (F3), `INSTRUCTION` rows render like copyable boxes (F4), and two e2e specs still assert the pre-LEG-7 package shape (F5). The 101/102/103/105/141 numeric codes are brief-supplied — the paper 160F prints only letters — and the page/sheet pairing is not machine-verified. |

Run record for this note: `implementation-tracker.md`, sixth pass, and [`gap-check-2026-11-08.md`](../gap-check-2026-11-08.md) §10 — 158/158 tests (26 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 32/32. API e2e and browser rendering were not run: `filing.service.ts` is outside `tsconfig.test.json` and rests on transpile plus a mock-Prisma probe, so the package table and the 160 warnings are not rendered evidence.

---

### 11.4 Notifications (API-4, 2026-11-08)

Notifications change no computed amount, so they have no row in the matrix; they are recorded here because §11 also tracks what the app can tell a filer to do next.

| Checklist item | App | What exists, and where it stops |
|---|---|---|
| In-app notifications | ✅ in-app only | 11 types and 3 severities; six endpoints under `/api/workspaces/:workspaceId/notifications` (list, unread count, mark read, mark all read, preferences `GET` / `PUT`), each scoped to the workspace and the calling user; three hooks — material fact confirmed (shared, non-private, actor excluded), approval requested / return ready, filing package generated; a dashboard bell with mark read / read all and per-type muting. |
| Email and push | ❌ not delivered | `emailEnabled` / `pushEnabled` are stored preferences; no email, push, outbox, retry or dedupe exists, and the dashboard panel says so. |
| Deadline and assessment reminders | ❌ no emitter | `DEADLINE_REMINDER` and `ASSESSMENT_FOLLOW_UP` exist as types; no scheduler writes them. |
| Invitation, document and security notices | ❌ no emitter | `HOUSEHOLD_INVITATION`, `DOCUMENT_CONFIRMATION_REQUIRED`, `MISSING_DOCUMENT`, `APPROVAL_INVALIDATED` and `SECURITY_ALERT` have no emitter; `createForUser`, the path that bypasses preferences, has no caller. |

The migration `20261108140000_add_notifications` is authored and diffed against Prisma’s generated SQL, **not applied**; API e2e, database and browser were not run. No notification was delivered by email or push in any environment.

No row above changed status in this pass: rows 1–3, 5–9, 11–16, 19, 21, 24–29 and 31–33 keep `stale — see tracker`, rows 4, 20, 22 and 23 keep ❌, rows 10, 17, 18 and 30 stay ✅, and row 34 stays ✅ / 🟡 partial.

Run record for this note: `implementation-tracker.md`, seventh pass, and [`gap-check-2026-11-08.md`](../gap-check-2026-11-08.md) §11 — 169/169 tests, `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 38/38. API e2e, database and browser rendering were not run, so the bell, the dropdown and the three hooks are inspection-only.

---

### 11.5 Approval invalidation and return-version history (API-5, 2026-11-08)

Approvals are a workflow state, not a computed amount, so this pass changes no row in the matrix. It is recorded here because §11 also tracks what the app can tell a filer about the state of a return: a material change now retires standing approvals, and the filing view explains why.

| Checklist item | App | What exists, and where it stops |
|---|---|---|
| Approval invalidation on material change | ✅ | One shared path (`ReturnApprovalsService.invalidateForChange`) supersedes every active approval, sets the workspace to `NEEDS_REVIEW`, increments `activeReturnVersion` once and writes an `APPROVAL_INVALIDATED` audit row. Triggers: fact confirm / update / delete (a private fact keeps the redacted reason), questionnaire save, document visibility change, document delete, persisted recalculation and the freelance demo load; `compareScenarios` never invalidates, and a workspace with no active approval is left untouched. |
| Return-version history | ✅ | `GET /api/workspaces/:workspaceId/return-versions` lists every version newest-first with `DRAFT` / `APPROVED` / `SUPERSEDED`, a synthetic current `DRAFT` when no snapshot exists, the required approver count (Class 2 active members, else 1), final liability and package flag, and the superseded approval reasons. The filing view renders a **Version history** card and clears stale rows when the API returns `null` or the tax year changes. |
| What is not modelled | ⚠️ | No version diff, no package hash in the history, no change author or time. Invalidation is not transactional with the triggering write, and any visibility change invalidates — including private → shared-for-discussion. A `VIEWER` in a Class 2 household still counts toward the approver requirement. No recalculation-freshness guard (`409 RECALCULATION_REQUIRED`), and a later re-approval can clear the superseded reason stored on the row. |

Run record for this note: `implementation-tracker.md`, eighth pass, and [`gap-check-2026-11-08.md`](../gap-check-2026-11-08.md) §12 — 179/179 tests (30 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 43/43. API e2e, database and browser rendering were not run, and the 10 new tests cover only the pure `historyStatus` / `mergeHistory`, so `invalidateForChange` and `getHistory` rest on inspection plus an in-memory probe, not a mock-Prisma test.

No matrix row changed status in this pass: rows 1–3, 5–9, 11–16, 19, 21, 24–29 and 31–33 keep `stale — see tracker`; rows 4, 20, 22 and 23 keep ❌; rows 10, 17, 18 and 30 stay ✅, and row 34 stays ✅ / 🟡 partial.

---

### 11.6 Current engine coverage after the rebuild (verified 2026-11-19)

This table **supersedes every App flag above**, including the `stale — see tracker` rows. It was produced by reading the current code, not by carrying forward an earlier pass. Legend: ✅ implemented · 🟡 partial / caveat · ❌ deliberately absent or blocked.

| # | Checklist item | App | Where it is, and where it stops |
|---|---|---|---|
| 1 | FFO 540 / 300 / 25, monthly, invalidity, blindness | ✅ | `deductions.ts` `salaryForfaitFor`, `RULES_2025.fraisObtention`. Per-person `max(forfait, actual)`, pension and capital forfaits, invalidity replaces the normal forfait, blindness €1,515. Not modelled: Art. 107 al. 5 cap after travel, partial-year monthly switch. |
| 2 | Déplacement 99 € / 2 574 € | ✅ | `travelFor`: first 4 units free, 26-unit / €2,574 cap, applied per person with salary. |
| 3 | Invalidity forfaits 645–1,515 | ✅ | `fo.invalidity` bands, selected by `invalidityRate`. |
| 4 | Télétravail forfait | ❌ (correct: taxable) | No legal PIT forfait exists; nothing to implement. |
| 5 | Home office frais réels 105/2 | 🟡 | Only through a generic `actualFraisObtention` amount; no 90 % / surface attestation workflow. |
| 6 | Formation Fortbildung | 🟡 | Same generic actual-frais field; no dedicated fact type or Fortbildung/Ausbildung gate. |
| 7 | FDS 480 / 960 | ✅ | `specialExpensesDeduction = max(forfait, covered) + LRCP + donations`; couple forfait requires two professional incomes. |
| 8 | Art. 111 €672 envelope | ✅ | `art111CapPerPerson × (1 + collectif + enfants modérés)`. |
| 9 | LRCP 1,200 | ✅ | `lrcpDeduction`, separate from the 480/960 forfait. |
| 10 | Art. 111bis 3,200 / 4,500 | ✅ | `art111bisCapPerPerson` per souscripteur, clamped to assessed persons (1 or 2). |
| 11 | Épargne-logement 1,344 / 672 | ✅ | Age-aware cap (`savingsHousingYoungMaxAge = 40`), × household multiplier. The 8775 age-limit removal remains gated. |
| 12 | ASRD prime unique table | ✅ | €6,000 + €1,200/child, + 8 % per year above 30, max 160 %. |
| 13 | Dons Art. 112 additive, 120 / 20 % / 1 M€ / report | ✅ / 🟡 | Minimum, 20 % and €1,000,000 cap implemented and additive. The two-year report (`donations.reportYears`) is in the rule package but **not** carried across years by the engine. |
| 14 | AEP Art. 110bis 4,500 | ✅ | `aepDeduction`, three routes (both professional, conjoint-aidant, recent retiree), capped at the lower professional net. |
| 15 | CIS official formula | ✅ | `creditFromScale`: 0 below 936, build-up to 11,265, €600 plateau to 40,000, phase-out to 80,000. |
| 16 | CI-CO2 192 / 216 | ✅ | `ciCo2ForSalary` / pension / independent; 2025 €192 / 0.0048, 2026 €216 / 0.0054. |
| 17 | CIM 3,504 / 0.0612 / 750 | ✅ | `cimFor`; Class 1a + single parent + moderated child + not both parents at home. Refundable excess split into `cimApplied` / `cimRefund`. Not modelled: pro-rata by months, the “married during the year” exclusion, per-child allocation detail. |
| 18 | CIP / modération 922.50 | ✅ | `cipForPension`, `degrevementForChildren`, `bonificationForChildren`. Per-child history (`child-relief.ts`) enforces the two-bonification lifetime cap, the one-relief-per-child rule, and the 2025–2026 résidence-alternée rule. |
| 19 | AMVP 9,000 (2026) | ✅ | `RULES_2026.amvp`, `amvpDeduction` when `amvpEligible`. Absent from the 2025 package. |
| 20 | CIC 2026 | ❌ (publication gate) | `cicForSalary` exists but returns 0 while `CIC_2026` is `NOT_IN_FORCE`; the engine warns. `cicForMonthlySalary` distinguishes `NOT_IN_FORCE` from zero-by-law. |
| 21 | Start-up credit 20 % / 100 k€ | ✅ | `startupInvestment`, 20 % capped at €100,000 investment, 2026 package only (2025 rate is 0). |
| 22 | Prime jeune salarié 75 % / 5,000 | ✅ | `youngEmployeePrimeEligible` + `youngEmployeePrime`, band caps €5,000 / €3,750 / €2,500, zero above €100,000. Eligibility remains an explicit input, not inferred. |
| 23 | Bëllegen Akt 40,000 | ❌ (non-IR by design) | Registration duties, not income tax; no housing-duties module. |
| 24 | Garde CE 5,400 | ✅ / 🟡 | `CHILDCARE_EXPENSE` and `HOUSEHOLD_HELP_EXPENSE` map to `extraordinaryChargesDeduction`, capped at the €5,400 forfait. The real-CE percentage table above the forfait is not modelled. |
| 25 | Owner-occupier interest ACD schedule | ✅ | `mortgageCap`: years 1–2 unlimited, 3–6 €4,000, 7–11 €3,000, 12+ €2,000, × (1 + spouse + moderated children). A missing fixation year refuses the deduction with a warning; a pre-disposition home is fully deductible. |
| 26 | Rental 35 % / 2,700 | ✅ | `computeRental` forfait, plus a per-building `rentalProperties` register with age-based and energy-renovation amortisation, charges and interest. |
| 27 | Social rental 90 % | ✅ | `rentalSocial` → 90 % of positive net excluded, provenance `LIR-ART-115-22a`. |
| 28 | Plus-values 6 months / 10 % / 102bis | ✅ | `movableGains`, `realEstateGains`: speculation vs Art. 100 / 99ter, principal-residence exemption, €50,000/€100,000 abattement, demi-taux. |
| 29 | Art. 114 losses 17 years | ✅ | `lossCarryForward` ledger by year, rejects future-dated entries, 17-year window, capped at available income; excess remains in the carry-forward with a warning. |
| 30 | Barème Art. 118 / 120bis / 121 | ✅ | Official 23 brackets, Art. 126 floor, Art. 124 cote floor, Class 2 `2 × Tarif(R/2)`, Class 1a reduced base + caps. Regression tests pin the ACD examples. |
| 31 | taxYear 2025 vs 2026 routing | ✅ | `getRulePackage` for 2025/2026/2028; unknown years throw rather than fall back. 2026 carries the 111bis €4,500, AMVP, CI-CO2 €216 and start-up credit. |
| 32 | Pension / capital / foreign income | ✅ | Pension withholding separated from gross pension; securities ledger with 50 % qualifying dividends, RELIBI final option, per-holding credit; treaty exemption/credit by country. |
| 33 | NON_RESIDENT refusal | 🟡 | Art. 157ter assimilation is tested; without assimilation, only Luxembourg-source income is taxed and the result is labelled an estimate. Treaty progression mechanics are not automated. |
| 34 | Form 100 official sheets | ✅ / 🟡 | Page / sheet / case map, spouse columns, computed vs instruction rows, annex PDF, SHA-256 package. Remaining caveats: 1553 not split, Art. 14 vs 91 not distinguished, foreign income not split by sheet, `unsupportedCertificateCodes` returned but not rendered. |

**Where §11.6 and an earlier row disagree, §11.6 is correct.** The legal analysis in §3–§10 remains useful for the rule itself; only its “App.” sentence is historical.

---

## 12. Optimisation priority for a resident couple (legal)

Ordered by typical euro impact for a salarié + side-business class-2 household. Not personalised advice.

1. **Art. 111bis** — 3 200 € (2025) / 4 500 € (2026) **per spouse**. Largest structured DS after obligatory SS. Pay in December.  
2. **AEP 4 500 €** if both professional + SS-affiliated. Automatic on the fiche if declared; confirm on the 100.  
3. **AMVP 9 000 €** if 57–65 and still working (2026). Get the CNAP certificate.  
4. **Owner-occupier interest** on the ACD schedule (2 years intégral then 4 000/3 000/2 000 × household multiplier). Do not put it in 672 € or Art. 102.  
5. **Garde CE 5 400 €** if children < 14.  
6. **Déplacement 99 €/unit** on top of 540 € FFO — often forgotten because it is a separate FO line.  
7. **Dons Art. 112 additive** — 120 € minimum, 20 %/1 M€, December payment, report 2 years.  
8. **Épargne-logement 1 344/672** if a contract exists and funds are affected to the home.  
9. **ASRD prime unique** if a home-loan insurance premium unique was paid.  
10. **CIS + CI-CO2** — usually already on the fiche; do not re-claim CIS in the décompte except mixed income.  
11. **Holding periods** on plus-values (6 months / 5 years / 102bis) — timing, not a deduction.  
12. **Art. 114** — use the loss stock before the 17-year clock expires.  
13. **Prime jeune salarié / Bëllegen Akt / start-up credit** — real money, wrong box if treated as DS.  
14. **Class 2 vs Art. 3ter** — model both before 31 December N+1; do not “file separately” by omission.

---

## 13. Unverified items (do not implement as facts)

| Item | Why open | How to close |
|---|---|---|
| CIC 2026 monthly table | ACD page still 2023; loi 8775 first vote 28 Oct 2026, publication expected Nov 2026 | Pin Mémorial of loi 8775 + new ACD CIC 2026 page |
| Épargne-logement age-limit suppression (8775) | Voted, not confirmed promulgated on 8 Nov 2026 | Same Mémorial |
| Bëllegen Akt 45 000 € | Only a third-party 2026 article; guichet 07.07.2025 still 40 000 | Search Mémorial / AED after July 2025 |
| Start-up credit 10 k€ / 3-year holding | mfin gives 20 % / 100 k€; holding/min from taxx/press | Open the 19 December 2025 / 2026 LIR article |
| Prime locative Art. 115 n° 13c formula | Existence certain; amount not extracted | RGD 22 mai 2024 Mémorial A 220 |
| Abattement construction Art. 129f 4 % / 250 k€ | Secondary only | Circulaire 129f/1 du 14 août 2025 |
| ACD “formules du calcul automatisé” for Art. 120bis cotes | Listed, not retrieved | Mémorial A 590 PDF |
| Art. 100 indexation of share acquisition prices | Art. 102(6) wording includes 99ter–101 | ACD practice / circular |
| Owner-occupied valeur locative tables | ACD habit_pers cookie-walled on VL amounts | Kinolaw 2023 RGD |
| Per-country DTT method matrix | Not built | ACD convention texts (FR/DE/BE first) |
| RELIBI 250 € de minimis | taxx only | Loi 23.12.2005 |
| Whether 8775 was promulgated by 8 Nov 2026 | Newsletter says “expected November 2026” | Legilux / ACD legislation 2026 |

---

## 14. Sources (accessed 8 November 2026 unless noted)

**Primary law**

- LIR texte coordonné 01.01.2026 (08.05.2026): <https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2026-ver-08052026.pdf>  
- LIR texte coordonné 01.01.2025: <https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2025.pdf>  
- Local extract: `lir_arts.txt` (Art. 109, 111, 111bis, 112, 114 fragments)  
- Loi du 20 décembre 2024 (Mémorial A 589): <https://legilux.public.lu/eli/etat/leg/loi/2024/12/20/a589>  
- Loi du 22 mai 2024 (Mémorial A 219) — logement / Bëllegen 40 000 / Art. 102 al. 8 supprimé  
- Loi du 19 décembre 2025 (Mémorial A 623) — AMVP Art. 129g, 111bis 4 500 €  
- Loi du 27 juin 2025 (Mémorial A 271) — Bëllegen Akt pérennisé 40 000 €  
- Projet de loi 8775 (CIC 2026, CISSM, épargne-logement age limit) — first vote 28.10.2026

**ACD A–Z / circulaires / newsletters**

- Frais salarié: <https://impotsdirects.public.lu/fr/az/f/frais_salar.html>  
- FFO/FDS: <https://impotsdirects.public.lu/fr/az/f/ffo-fds.html>  
- Forfaits salariés (télétravail taxable): <https://impotsdirects.public.lu/fr/az/f/forfaits-salaries.html>  
- Frais de déplacement: <https://impotsdirects.public.lu/fr/az/f/frais-deplacement-forfaitaires/frais-depl.html>  
- Dépenses spéciales: <https://impotsdirects.public.lu/fr/az/d/depens_spe.html>  
- Cotisations et primes: <https://impotsdirects.public.lu/fr/az/c/cotis_prim.html>  
- Épargne-logement: <https://impotsdirects.public.lu/fr/az/c/cotis-epargne-logement.html>  
- Prévoyance-vieillesse: <https://impotsdirects.public.lu/fr/az/p/prevoyance_vieillesse.html>  
- Dons: <https://impotsdirects.public.lu/fr/az/l/libera_dons.html>  
- Habitation personnelle: <https://impotsdirects.public.lu/fr/az/h/habit_pers.html>  
- Location / forfait 35 %: <https://impotsdirects.public.lu/fr/az/l/logem_loc.html>  
- Vente d’immeuble: <https://impotsdirects.public.lu/fr/az/v/vente_immeuble.html>  
- Charges extraordinaires: <https://impotsdirects.public.lu/fr/az/c/charg_extra.html>  
- Garde forfaitaire: <https://impotsdirects.public.lu/fr/az/a/abat_forf_dom.html>  
- AEP: <https://impotsdirects.public.lu/fr/az/a/abat_extrapro.html>  
- CIS 2025 / 2026, CIM, CIP, classes: see [research/2025-2026-lu-tax-credits-and-classes.md](../research/2025-2026-lu-tax-credits-and-classes.md)
- Prime jeune salarié: <https://impotsdirects.public.lu/fr/az/p/prime-jeune-salarie.html>  
- Newsletter 25.02.2026 (AMVP): <https://impotsdirects.public.lu/fr/archive/newsletter/2026/nl25022026.html>  
- Newsletter 30.10.2026 (CIC 2026 / 8775): <https://impotsdirects.public.lu/fr/archive/newsletter/2026/nl301020261.html>  
- CIC salarié page (still 2023): <https://impotsdirects.public.lu/fr/az/c/credit-impot-conjoncture/credit-impot-conjoncture-salarie.html>  
- Circulaire 105/2 (04.06.2021): <https://impotsdirects.public.lu/dam-assets/fr/legislation/legi21/2021-06-04-LIR-105-2-du-462021.pdf>  
- Circulaire 111/1 (02.11.2017): <https://impotsdirects.public.lu/dam-assets/fr/legislation/legi17/lir-111-1-02112017.pdf>  
- Circulaire 115/10 (18.08.2023) — social rental 90 %  
- Formation: <https://impotsdirects.public.lu/fr/az/b/bonif_format.html>

**Guichet / mfin / CCSS**

- Bëllegen Akt: <https://guichet.public.lu/fr/citoyens/aides/logement-construction/aides-indirectes/credit-impot-actes-notaries.html>  
- Déclaration IR: <https://guichet.public.lu/fr/citoyens/fiscalite/declaration-impot-decompte/activite-professionnelle/declaration-revenus/declaration-impot.html>  
- CNAP AMVP certificate: <https://guichet.public.lu/fr/citoyens/travail/pension/assurance-pension/certificat-cnap-abattement-fiscal.html>  
- 111bis (stale 3 200): <https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/depenses-deductibles/contrat-prevoyance-resident.html>  
- mfin Nouveautés 2026 (29.12.2025) — AMVP, 111bis 4 500, CI-CO2 216, start-up 20 %/100 k, AMVP 9 000  
- CCSS: <https://ccss.public.lu/fr/parametres-sociaux.html>

**Workspace files this note is written with**

- [lux-deductions-2025-2026-research.md](../lux-deductions-2025-2026-research.md)
- [luxembourg-resident-tax-research.md](../luxembourg-resident-tax-research.md)
- [research-filing-2025-2026.md](../research-filing-2025-2026.md)
- [luxembourg-tax-resident-gap-analysis.md](../luxembourg-tax-resident-gap-analysis.md)
- [docs/lir-118-121-bareme-2025-2026.md](lir-118-121-bareme-2025-2026.md)
- [research/2025-2026-lu-tax-credits-and-classes.md](../research/2025-2026-lu-tax-credits-and-classes.md)
- Engine: [packages/tax-engine/src/engine.ts](../packages/tax-engine/src/engine.ts), [packages/tax-engine/src/deductions.ts](../packages/tax-engine/src/deductions.ts), [packages/tax-engine/src/credits.ts](../packages/tax-engine/src/credits.ts)

---

## 15. Suggested next steps

> **Status 2026-11-19.** The five steps below were the pre-rebuild plan; steps 1–4 are **done**.
> What remains is product/coverage polish, not a broken calculator.

1. ~~Do not present the engine as filing-ready until P0 items close.~~ **Done:** the official Art. 118
   scale, Art. 120bis Class 1a, Art. 121 splitting and Art. 124/126 rounding are implemented and
   pinned by regression tests. The UI still presents the result as an estimate, not a filed return,
   which is the correct product boundary.
2. ~~Implement the scale, CIS/CI-CO2/CIM, FO/DS/CE/AEP/111bis, dons, habitation, déplacement,
   invalidity and AMVP.~~ **Done** in `rules/2025.ts`, `rules/2026.ts`, `deductions.ts`, `credits.ts`,
   `scale.ts`, `engine.ts`.
3. ~~Add the missing fact keys/categories.~~ **Done:** pension, childcare, 111bis, savings housing,
   LRCP, donations, travel/invalidity inputs, prior losses, rental, securities and plus-values all
   reach the engine.
4. ~~Keep CIC 2026, épargne-logement age-limit suppression and any €45,000 Bëllegen Akt
   unimplemented until a Mémorial PDF is pinned.~~ **Still the rule:** CIC and the 8775 age limit are
   `NOT_IN_FORCE`; Bëllegen Akt remains non-IR. See
   [`8775-activation-handoff.md`](8775-activation-handoff.md).
5. **Open product work:** a December-timing reminder for 111bis/dons/LRCP/garde/AMVP; the donations
   two-year report; real-CE above the €5,400 forfait; CIM pro-rata by months; and Form 100
   category-level splitting (1553, Art. 14 vs 91, foreign income by sheet). These are recorded in
   §11.6 and in [`CODEMAPS/INDEX.md`](CODEMAPS/INDEX.md).
