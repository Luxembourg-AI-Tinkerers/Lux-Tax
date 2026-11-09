# Luxembourg Resident Personal Income Tax — Full Research and App Gap Analysis

**Project:** Lux-Tax (`tax-app`)  
**Audit date:** 8 November 2026  
**Scope:** Residents of Luxembourg, tax years 2025 and 2026 (LIR — *Loi de l'impôt sur le revenu*)  
**App under review:** `packages/tax-engine`, `packages/contracts`, `apps/api`, `apps/web`, `apps/mobile`  
**Sources of law:** Administration des contributions directes (ACD / impotsdirects.public.lu), Mémorial A N° 590 du 24 décembre 2024 (barème 2025), LIR as consolidated on Legilux, Ministère des Finances (nouveautés 2026), PwC Worldwide Tax Summaries (reviewed 3 August 2026)

> **Verdict in one paragraph.** The product shell (households, documents, evidence-linked facts, dual-spouse approval, filing-package workflow) is well conceived and matches the product plan. The tax engine, however, is **not a reliable Luxembourg resident calculator**. It implements a simplified 2025-only model with **wrong official brackets above €24,255**, a **wrong CIS formula** (especially for low earners), a **2024 CIM that is wrong even for 2024**, **no CI-CO2 credit**, **no Art. 111bis third-pillar deduction** (€3,200 in 2025 / €4,500 in 2026, collapsed into a €672 insurance cap), **donations swallowed by the special-expenses forfait**, **no Art. 129b extra-professional allowance (€4,500)**, **pension, capital, rental and foreign income silently ignored**, and a **Form 100 mapping that uses salary-certificate codes rather than official 100F boxes**. Using the current engine to produce a “filing-ready” estimate would under- or over-state tax for a large share of resident households. The fixes below are specific, ordered, and testable.

---

## 1. What Luxembourg resident tax actually requires

This section is the legal baseline the app must meet. Every number below is sourced. Where the app already matches, that is stated; where it does not, the gap is carried into §4.

### 1.1 Who is a resident and what is taxed

- **Resident** (Art. 2 LIR): domicile or habitual abode in Luxembourg, or (for Luxembourgers) stay ≥ 6 months. Residents are taxed on **worldwide income**.
- **Non-resident**: taxed on Luxembourg-source income only. The app has `TaxResidence.RESIDENT` / `NON_RESIDENT` in `packages/contracts/src/enums.ts` and `TaxYearWorkspace.residenceStatus`, but the engine **never reads `residence`**.
- **Filing**: Form **100** (*Déclaration pour l'impôt sur le revenu*, 100F/100D, 20 pages) plus named annexes (190/210, 195, 700, 104…). For 2025 income the filing window is **7 April 2026 – 31 December 2026**; the legal rule is **31 December of N+1**. Employees/pensioners who are **not** in obligatory *imposition par voie d'assiette* regularise with **modèle 163**, same deadline. MyGuichet.lu + LuxTrust (or Luxembourg eID) is the official electronic channel; email is not accepted. The *assistant électronique* cannot be used to request Art. 3ter individual assessment or the mixed 90% collective option, and since AY 2024 joint filing needs a **double signature**. ACD may always demand a return. Obligatory assiette (Form 100) for residents includes, among others: taxable income > **€100,000**; non-withholding net income > **€600**; capitaux mobiliers net > **€1,500**; additional fiche à taux fixe and taxable income > **€36,000** (Class 1/2) or **€30,000** (Class 1a); mixed resident/non-resident couple opting for collective assessment with **≥ 90%** of professional income in Luxembourg. The app correctly refuses to auto-file (plan §13) — that boundary is right. The €100k / €600 / €1,500 figures are **filing-eligibility** rules, not scale breakpoints.

### 1.2 Tax classes (Art. 118–119 LIR)

| Class | Who | Official method (2025/2026) |
|---|---|---|
| **1** | Single without children; divorced; married filing individually | Direct application of the progressive scale |
| **1a** | Single/widowed **with at least one child à charge**; **taxpayer aged ≥ 65 on 1 January** of the tax year | Favourable scale / tariff concession between Class 1 and Class 2 |
| **2** | Married not separated, **or PACS / legal cohabitation** meeting conditions, taxed collectively | **Splitting**: `Tax = 2 × Scale(RIA / 2)` |

**App status.** `TaxClass.CLASS_1 / 1A / 2` exist. `CalculationsService` auto-assigns: 2 members → Class 2; dependants → Class 1a; else Class 1.  
**Gaps:** the auto-assign is legally wrong in several common cases (Art. 119 / 3 / 3bis / 3ter LIR):

- **Married residents:** Class 2 collective taxation is the **default**, unless both spouses make a **joint and irrevocable Art. 3ter election** (pure individual, or individual with reallocation) before 31 December of N+1. You cannot “file separately” by omitting the spouse.
- **PACS / partnership:** partners are **Class 1 (or 1a) and taxed separately by default**. Class 2 only on a **joint request** if the partnership and common home lasted the whole tax year. Putting Class 2 on the fiche because of PACS alone is an error.
- **65+:** Class 1a if the taxpayer has **completed their 64th year on 1 January** of the tax year (turning 65 later in the year does not count). The app never asks for date of birth.
- **Divorced / separated:** ordinary Class 1 / 1a, but **transitional Class 2** for the **3 years** after the event (with a prior-five-year condition). Not modelled.
- **Widows/widowers:** Class 1a, with a **3-year Class 2 transition** after the death.

A single tax class replacing 1/1a/2 is legislated for **tax year 2028** (coalition reform; transition period for couples). The app should already model rule **packages per year** so 2028 is a package swap, not a rewrite. The plan already calls for immutable tax-year rule packages (plan §12.2) — they are **not implemented**; `scale2025.ts` is a hard-coded singleton.

### 1.3 Official 2025 scale — Class 1 (Mémorial A N° 590, 24 Dec 2024; confirmed by PwC 3 Aug 2026 and taxx.lu 13 Feb 2026)

The 2025 budget added **2.5 index brackets** on top of the four brackets neutralised in 2024. Result: the **lower six brackets** keep a €2,205 step; **upper brackets widen**. The app used the old uniform €2,205 step all the way to 42%. That is the single largest arithmetic error in the codebase.

**Official Class 1 taxable-income brackets, tax year 2025 (and 2026 — scale unchanged):**

| Taxable income (€) | Rate |
|---|---|
| 0 – 13,230 | 0% |
| 13,230 – 15,435 | 8% |
| 15,435 – 17,640 | 9% |
| 17,640 – 19,845 | 10% |
| 19,845 – 22,050 | 11% |
| 22,050 – 24,255 | 12% |
| **24,255 – 26,550** | 14% |
| **26,550 – 28,845** | 16% |
| **28,845 – 31,140** | 18% |
| **31,140 – 33,435** | 20% |
| **33,435 – 35,730** | 22% |
| **35,730 – 38,025** | 24% |
| **38,025 – 40,320** | 26% |
| **40,320 – 42,615** | 28% |
| **42,615 – 44,910** | 30% |
| **44,910 – 47,205** | 32% |
| **47,205 – 49,500** | 34% |
| **49,500 – 51,795** | 36% |
| **51,795 – 54,090** | 38% |
| **54,090 – 117,450** | 39% |
| **117,450 – 176,160** | 40% |
| **176,160 – 234,870** | 41% |
| 234,870 + | 42% |

**App brackets (`packages/tax-engine/src/scale2025.ts`) after €24,255:**

| App upper bound | App rate | Official upper bound | Delta |
|---|---|---|---|
| 26,460 | 14% | 26,550 | −90 |
| 28,665 | 16% | 28,845 | −180 |
| 30,870 | 18% | 31,140 | −270 |
| 33,075 | 20% | 33,435 | −360 |
| 35,280 | 22% | 35,730 | −450 |
| 37,485 | 24% | 38,025 | −540 |
| 39,690 | 26% | 40,320 | −630 |
| 41,895 | 28% | 42,615 | −720 |
| 44,100 | 30% | 44,910 | −810 |
| 46,305 | 32% | 47,205 | −900 |
| 48,510 | 34% | 49,500 | −990 |
| 50,715 | 36% | 51,795 | −1,080 |
| 52,920 | 38% | 54,090 | −1,170 |
| 110,250 | 39% | 117,450 | app 39% band is 57,330 vs official 63,360 |
| 165,375 | 40% | 176,160 | |
| 234,870 | 41% | 234,870 | last 41% band starts too early |

**Rounding — it is not in Art. 119.** Art. 119 only assigns classes. The rounding rules are:

- **Art. 126 al. 2:** before applying the tarif, **floor** the revenu imposable to the next multiple of **€50**. The app already does this (`Math.floor(RIA / 50) * 50`). Keep it. Do **not** switch to “nearest €50”.
- **Art. 124 al. 1:** **floor** the tax cote to the next **euro** (the app uses `Math.round` to the cent — wrong).
- **Art. 124 al. 2:** cotes **< €12 are null** (the app never nullifies).
- **Art. 121 does not re-round `R/2`.** The extra `Math.floor((roundedTaxableIncome / 2) / 50) * 50` in Class 2 is not authorised (usually immaterial, but not in the law). Remove it.

**Class 1a — Art. 120bis (rewritten by loi du 20 décembre 2024), not an average of Class 1 and Class 2.**  
The app computes `min(Class1, (Class1 + Class2) / 2)`. That is neither the pre-2025 difference method nor the 2025 law.

Art. 120bis applies the Art. 118 tariff to a **reduced base**:

```
if R <= 79 380:   R′ = R − (79 380 − R) / 4     // = 1.25·R − 19 845
if R >  79 380:   R′ = R
```

then cap the **marginal rate versus original R** at 39 % (R-band 51 804–117 450), 40 % (117 450–176 160), 41 % (176 160–234 870), 42 % above — otherwise the ×1.25 slope would exceed those maxima (1.25 × 32 % = 40 % starting exactly at R = 51 804).

Why 79 380: 79 380 = 3 × 26 460. At R = 26 460, R′ = 13 230 → tax **0**. That is the official Class 1a/2 exempt first bracket of **€26,460**. At R = 79 380 the reduction vanishes and Class 1a meets Class 1.

This is a **2025 rewrite**. The pre-2025 “Class 1 minus a fraction of (Class 1 − Class 2)” method is not the law for 2025/2026.

**Golden values (ACD / Art. 118+120bis+124), before fonds pour l’emploi:**

| Input | Official | App |
|---|---|---|
| Class 1, R = €50,000 | **€7,341** | €7,460.10 (**+€119**) |
| Class 2, R = €100,000 | **€14,682** (ACD splitting example) | €14,920.20 (**+€238**) |
| Class 1a, R = €26,460 | **€0** | €704.90 (**+€705**) |
| Class 1a, R = €150,000 | **€44,268** | €40,573.65 (**−€3,694**) |

The app **over-taxes** Class 1 above the 0% bracket and **over-taxes poor Class 1a** (single parents, 65+) while **under-taxes middle/high Class 1a**. Both directions are material.

### 1.4 Solidarity surcharge — *contribution au fonds pour l’emploi*

- **7%** of the income-tax *cote* if RIA ≤ **€150,000** (Classes 1 and 1a) or ≤ **€300,000** (Class 2).
- **9%** above those thresholds.

**App:** `highIncomeThreshold = Class 2 ? 300000 : 150000`, rate 7% or 9%, applied to `baseTax`. **This matches** the official rule (threshold on RIA, not on tax). Keep it. Add a warning that the 9% switch is a cliff, not a phase-in.

### 1.5 Employment income (Art. 95 LIR) and *frais d’obtention* (Art. 105 / 107 LIR)

**Net salary** = gross − deductible social contributions (CNS, etc.). The app computes `max(0, gross − social)` and cites Art. 95. Acceptable for a first cut.

**Forfait frais d’obtention (FFO):**
- **€540 / year per employed person** (€45/month), no receipts.
- **€300 / year for pensioners** (ACD FFO/FDS page).
- Actual professional expenses replace the forfait if higher (no general cap for salariés).
- **Independents have no FFO** — they deduct actual business expenses (Art. 14/91).
- Increased forfaits for invalidity (€645–€1,020; €1,515 for blindness/impotence).

**App bugs:**
1. `employedSpousesCount` treats **two salary facts as two employed spouses**. A person with two employers is counted as two people → FFO €1,080 instead of €540.
2. FFO is **always €540 per “employed” person**; pensioners get €540 instead of €300; independents correctly get 0 only because `grossSalaries.length === 0`. Art. 107 also has **€25 for capitaux mobiliers**, granted **per category** (al. 3), **doubled for couples if each spouse has that category** (al. 4), with a possible **cumul of one spouse’s forfait with the other’s actual frais**.
3. **Frais de déplacement Art. 105bis** (99 €/unité d’éloignement, first 4 units ignored, cap **€2,574**, per salarié, independent of transport mode) are not modelled.
4. **Invalidity forfaits** (€645–€1,020; €1,515 for blindness/impotence) are not modelled.
5. `occupancyYear` / actual frais vs forfait is fine in `deductions.ts`, but **the engine never passes occupancy year**, and actual frais are added from `fieldKey === 'fraisObtention'` only.
6. Filing package **always writes case 301 = €540**, even for Class 2 dual earners (should be €1,080) or freelance-only (should be €0).

**Art. 110 vs Art. 111 (do not merge):** obligatory social security (Art. 110 n° 1–2) is **unlimited** and **outside** the €480 FDS. LRCP employee contributions (n° 3) cap at **€1,200/year**. Pension-continuée volontaire (n° 4) sits **inside** the €480 forfait. Private insurance vie/accidents/maladie/RC (Art. 111 a+b) shares the **€672** envelope with consumer-loan interest (Art. 109 n° 1a). Pensions alimentaires Art. 109bis: cap **€24,000 per ex-spouse**.

### 1.6 Special expenses — *dépenses spéciales* (Art. 109–113 LIR) — and what is **not** a dépense spéciale

This is the most structurally wrong area after the scale. Two framing errors must be fixed before amounts:

1. **Art. 102 LIR is not *frais d’obtention*.** Art. 102 regulates *prix d’acquisition / plus-values*. *Frais d’obtention* are **Art. 105** (definition), **Art. 105bis** (frais de déplacement) and **Art. 107** (forfaits 540 / 300 / 25 €). Owner-occupier housing is a **valeur locative (Art. 98 al. 1 n° 5)**; related interest is **frais d’obtention of that category (Art. 105)**, **not** Art. 111 and **not** Art. 102.
2. **Childcare and household help are charges extraordinaires (Art. 127 / abattement forfaitaire €5,400), not dépenses spéciales.**

This is the most structurally wrong area after the scale.

#### 1.6.1 Forfait dépenses spéciales (FDS)

- **€480** single (Class 1 / 1a)
- **€960** couple Class 2

Granted **d’office**, without receipts. The app has these amounts. **Correct.**

#### 1.6.2 The forfait is a **floor**, not a basket that swallows donations

Official mechanics:

```
dépenses spéciales = max(FDS, actual Art. 109/111 items)
                   + dons Art. 112   (donations are ADDITIVE)
```

**App (`deductions.ts`):**

```ts
const specialExpensesDeduction =
  Math.max(flatSpecialExpensesMinimum, insuranceAndSavingsDeduction + donationsDeduction);
```

A €200 donation plus €100 insurance therefore yields **€480** (forfait only) instead of **€480 + €200 = €680**. Donations below the forfait are **entirely lost**. This is a legal error, not a simplification.

**Donations Art. 112:** deductible if ≥ **€120** aggregated, up to **20% of net income** (and €1,000,000). Recipient must be a Luxembourg public-interest or listed organisation (or equivalent). The app’s min/max logic is directionally right; the 20% base should be **revenu net**, not “net income before special expenses” as a proxy, and donations must then be **added** to the FDS result.

#### 1.6.3 Art. 111 — insurance, consumer-loan interest, épargne-logement (the €672 box)

ACD / Guide des Impôts: interest on **personal/consumer loans** and **certain insurance premiums** (vie, accidents, maladie complémentaire — not car/house material-damage) share a **global cap of €672 per person**, increased by the same amount for the spouse and **for each child in the ménage**.

**App:** `min(declaredInsurance, 672 × householdMembersCount)`. Directionally right for **this bucket only**.

Missing inside Art. 111:
- **Épargne-logement (Bausparkasse Luxembourg):** €1,344/year if age ≤ 40 on 1 January, **€672** if > 40; majorations for spouse and children. French/Belgian PEL **not** deductible.
- **Assurance solde restant dû (ASRD) prime unique:** large age/children table (e.g. ≤30 without child €6,000; +€672 per year of age beyond 30 up to caps; Form 100 cases 1474–1477). Completely absent.
- Distinction **deductible vs non-deductible** insurance (RC oui; vol/incendie non).

#### 1.6.4 Art. 111bis — third-pillar *prévoyance-vieillesse* — **NOT €672**

Official ACD page (updated 27 Jan 2026):

| Years | Max deduction **per person** |
|---|---|
| 2017–**2025** | **€3,200 / year** |
| **2026 onward** | **€4,500 / year** |

Conditions: ≥ 10-year contract, subscribe before 65, payout 60–75, Luxembourg insurer (PEPP sub-account aligned). Spouses each have their own plafond.

**App:** the AI extractor labels Art. 111 **and** 111bis as `INSURANCE_DEDUCTION` / `insurancePremium`, and the engine caps **everything** at €672 × members. A resident paying €3,000 into a Retraites-1e / life-pension contract gets **€672** of relief instead of **€3,200**. At a 30% marginal rate that is **~€760 of phantom tax**. This is a P0 defect.

#### 1.6.5 Owner-occupier mortgage interest — Art. 98 n° 5 / Art. 105 (frais d’obtention of valeur locative)

**Legal box (ACD habit_pers, 18 Feb 2025):** the habitation occupée par le propriétaire produces a **valeur locative** (Art. 98 al. 1 n° 5). Interest and life-annuity instalments are **frais d’obtention of that revenu** (Art. 105), **after** the valeur locative is fixed. They are **not** a dépense spéciale under Art. 111 (that article is **personal/consumer** interest + private insurance, €672 envelope).

| Interest type | Legal box | Cap 2025/2026 |
|---|---|---|
| Owner-occupied primary home, after valeur locative | **FO Art. 98 n° 5 / Art. 105** | ACD schedule below × household |
| Owner-occupied, **before** libre disposition (construction) | FO | **Intégral** + frais d’ouverture de crédit |
| Rental property | FO of rental net | No owner-occupier cap |
| Second home | — | **Not deductible** (VL = 0 since 2017) |
| Consumer / personal (car, meubles) | **DS Art. 109 n° 1a** | **€672** shared with Art. 111 a+b insurance |

**ACD assessing rule (habit_pers, à partir de l’année d’imposition 2024)** — use this, not a date-cohort table:

| Years since année de fixation de la valeur locative | Cap / qualifying person |
|---|---|
| Fixation year **+ the next year** (years 1–2) | **Intégral** |
| Years 3–6 | **€4,000** |
| Years 7–11 | **€3,000** |
| Year 12+ | **€2,000** |

Multiplier: **cap × (1 + conjoint collectif Art. 3 + each enfant with modération Art. 122)**. No prorata temporis of the cap. Worked ACD examples: célibataire year 3 = €4,000; couple Class 2 year 3 = €8,000; couple + 2 enfants modérés year 3 = €16,000.

**Conflict to record (do not silently reconcile):** Form 100F 2025 feuille L prints a **date-of-availability** table (before 1.1.2015 → intégral; 31.12.2014–1.1.2020 → €4,000; 31.12.2019–1.1.2024 → €3,000; after 31.12.2023 → €2,000). That is a different reading (taxx.lu 23.3.2026). **Follow ACD habit_pers** — the administration that will assess. Flag the 100F table in help text; do not implement “always intégral after 2023” without an ACD confirmation. The numeric caps are ACD application of Art. 98 n° 5 + Art. 105 after the 22 May 2024 housing package; they are not a standalone 4k/3k/2k article in the LIR 2026 body.

**App:** the €4,000/€3,000/€2,000 figures exist in `deductions.ts` **but**:
- `occupancyYear` is **optional and never provided**. `engine.calculate()` does not accept it.
- The code uses `taxYear − occupancyYear > 10 / > 5` — old pre-2024 **rolling 1–5 / 6–10 / >10** bands, with the new €4,000 amount. It has **no unlimited first two years**, wrong year boundaries, and mis-cites **Art. 102**.
- Filing maps mortgage to “case 310” without distinguishing habitation personnelle vs rental vs second home.

#### 1.6.6 Childcare, domestic help — charges extraordinaires, **not** dépenses spéciales

The data model has `CHILDCARE_EXPENSE` and the vision service extracts crèche invoices. The **engine ignores the category entirely** — and would put it in the wrong box even if it didn’t.

Official (ACD abat_forf_dom / charg_extra; circulaire LIR 127/1):
- **Abattement forfaitaire charges extraordinaires:** frais de domesticité (aides déclarées SS), frais d’aides et de soins (dépendance), **frais de garde d’enfants** (crèche, maison relais, garderie agréée).
- **€5,400 / year** (since AY 2017), cannot exceed real costs nor **€450/month**, granted **once** even if several categories are combined.
- Enfants: modération d’impôt **and < 14 years accomplished on 1 January** (no age limit if handicapés).
- Alternative: real CE with the % of revenu imposable table (classe d’impôt × nombre de modérations).
- Separate **abattement pour enfants hors ménage**: actual costs capped at **€5,424/child from AY 2025**.
- 2025–2026 *bonification* for résidence alternée up to **€922.50 per child** (Ministère des Finances).
- 2028 reform will add a **€5,400 petite enfance** allowance per child under 3 (parliamentary text, Oct 2026 — **not yet in force**).

#### 1.6.7 Art. 129b — abattement extra-professionnel (AEP) — **missing entirely**

**€4,500 / year** (€375/month) tariff allowance for **jointly taxed spouses who both have professional income** (Art. 14, 61, 91 **or 95**) and are each affiliated to social security. On the fiche de retenue each spouse already receives **half (€2,250)**. Also granted if one has Art. 14/91 income and the other is **conjoint-aidant**, or on request if the other has been retired **< 3 years**.

**Not Art. 110bis** — that number does not exist for AEP. Form 100 page 20 prints “article 129b L.I.R.”.

**Caps (Art. 129b al. 3):** granted once; cannot exceed the **net** of the taxpayer’s own professional income, **nor** the net the other spouse would have realised if not collectively taxed. A **loss-making side-business can wipe AEP**. Art. 3ter **pure**: **€2,250 each**. Réallocation / Class 2: **€4,500**.

For a dual-career Class 2 household this is **€4,500 off taxable income** — roughly **€1,200–€1,600 of tax** at typical marginals. The app has **zero** implementation. The questionnaire does not even ask “does your spouse also work?”.

### 1.7 Tax credits

Credits offset the *cote* (and can be restituted against retenue). They are **per person**, not per household (except CIM).

#### 1.7.1 CIS — crédit d’impôt salarié (official ACD page, année 2025)

For gross salary **including Art. 134 exempt salary**, taxpayer with Luxembourg taxing right, affiliated to a social-security scheme, **once per person** (not cumulative with CII/CIP):

| Annual gross | CIS 2025 (and 2026) |
|---|---|
| < €936 | €0 |
| €936 – €11,265 | **€300 + (gross − 936) × 0.029** |
| €11,266 – €40,000 | **€600** |
| €40,001 – €79,999 | **€600 − (gross − 40,000) × 0.015** |
| ≥ €80,000 | €0 |

**App (`credits.ts`):**

```ts
if (gross > 11265 && gross < 80000) {
  if (gross <= 40000) totalCis += Math.min(600, (gross - 11265) * 0.021 + 300);
  else totalCis += Math.max(0, 600 - (gross - 40000) * 0.015);
}
```

| Gross | Official CIS | App CIS | Error |
|---|---|---|---|
| €5,000 | **€417.86** | **€0** | −€417.86 |
| €10,000 | **€562.86** | **€0** | −€562.86 |
| €11,265 | **€600** | **€0** (strict `>`) | −€600 |
| €20,000 | **€600** | **€483.47** | −€116.53 |
| €60,000 | **€300** | **€300** | OK (phase-out only) |

The app **invents** a phase-in from €11,265 with slope 0.021 that does not exist, and **zeroes out** the entire €936–€11,265 band that the 2025 reform specifically introduced to help low earners.

#### 1.7.2 CI-CO2 salarié — **missing entirely**

Official 2025:

| Annual gross | CI-CO2 |
|---|---|
| €936 – €40,000 | **€192** |
| €40,001 – €79,999 | **€192 − (gross − 40,000) × 0.0048** |
| ≥ €80,000 | €0 |

**2026:** carbon price rises to €45/t; CI-CO2 **increased by €24 to €216** (Ministère des Finances, 29 Dec 2025). The 2026 phase-out slope must be confirmed against the ACD CIS/CI-CO2 2026 page before implementation (same page family as CIS).

Every employee below €80,000 is currently **under-credited by up to €192 (2025) / €216 (2026)**.

#### 1.7.3 CIM — crédit d’impôt monoparental

**Official from 2025** (ACD CIM page; BSP circular 14 Apr 2025; Guide des Impôts):

| Revenu imposable ajusté (RIA) | CIM 2025 |
|---|---|
| ≤ €60,000 | **€3,504** |
| €60,001 – €105,000 | **€3,504 − (RIA − 60,000) × 0.0612** |
| > €105,000 | **€750** minimum |

Further reduced by **50% of the child’s allocations** (pensions alimentaires, etc.) above **€2,712 (2025)** (allocations familiales and orphan pensions excluded; if several children, use the smallest per-child allocation). CIM is **on demand**, Class 1a with a child triggering modération d’impôt, **not** granted if both parents live with the child, **not** a function of the number of children, **prorated** over whole months if the taxpayer was not assujetti all year, and **refundable** to the extent it exceeds the tax due (Art. 154ter al. 2). 65+ without children → CIM = 0. Partners who elect Class 2 lose CIM.

**App:**

```ts
if (taxableIncome <= 35000) cim = 2505;
else if (taxableIncome <= 105000) cim = max(750, 2505 - (taxableIncome - 35000) * 0.025);
else cim = 750;
```

This is **wrong for 2025 and wrong for 2024**. 2024 was €2,505 with a **€60,000** first threshold and slope **0.039** — not €35,000 / 0.025. A single parent with RIA €50,000 is under-credited by **€999**. RIA €80,000: app €1,380 vs official €2,280 (**−€900**).

#### 1.7.4 Other credits — all missing

| Credit | Who | Rough 2025/2026 rule |
|---|---|---|
| **CIP** (crédit d’impôt pensionné) | Pensioners (Art. 154quinquies) | 2025/2026 scale: 0 below €300; **€300** for €300–935; then the **same build-up as CIS** from €936; plateau €600; phase-out to €80,000. Plus **CI-CO2 pensionné** €192 (2025) / €216 (2026). Not combinable with CIS. |
| **CISSM** (salaire social minimum) | Gross €1,800–€3,000/month | €70/month; phase-out to €3,600. (Projet Resilienzpak: increase to €179 from **2027** — do not ship as 2025/2026 law.) |
| **Modération / bonification enfant** (no official “CIAC”) | Art. 122 / 123bis | Dégrèvement **€922.50/child, not refundable**, only if no family allowance/CEDIES/SNJ was paid. Bonification after modération expires, same €922.50 cap, phase-out `(76 600 − RIA)/10` between €67,400 and €76,600. Abattement enfant hors ménage: **€5,424/child from AY 2025** (revenue deduction, not a credit). |
| **CII / CI-CO2 indépendant** | Self-employed | Separate barème (Art. 152ter); **not** cumulative with CIS |
| **Crédit d’impôt start-up (2026)** | Resident investors | **20% of investment**, cap **€100,000/year** (Ministère des Finances) |
| **Bonification garde alternée** | 2025–2026 | Up to **€922.50 / child** on request (Art. 123bis al. 1a transitional) |

### 1.8 Income categories the engine must know (and currently does not)

`FactCategory` already contains `PENSION_INCOME`, `CHILDCARE_EXPENSE`, `OTHER_DEDUCTION`. The engine’s `switch` **silently drops** them.

| Category | LIR | Resident rule the app must implement or refuse |
|---|---|---|
| **Pensions / rentes** | Art. 96 | Taxable (state CNP/CNAP, occupational, private). FFO pensionné **€300**. **CIP + CI-CO2 pensionné** (not cumulative with CIS). Art. 111bis **rente viagère**: 50% exempt (Art. 115 n° 14a); **capital repayment** = Art. 99(4) revenus divers, demi-taux on request (Art. 132 2 n° 5). Early repayment (other than invalidity/serious illness) **fully taxable Art. 99(5)**. RCP payout Art. 115 n° 17a exempt if LRCP conditions met. |
| **Revenus de capitaux mobiliers** | Art. 97 / 115 n° 15 / 15a / 146 | Dividends, interest. LU WHT **15%** (Art. 146), creditable. **No general half-reduction.** Art. **115(15a)**: 50% exempt only for dividends of a **fully taxable LU / EU parent-subsidiary / DTT company** (taxpayer may waive; related FO then 50% deductible). **Interest fully taxable**; optional **20% RELIBI** libératoire (loi 23.12.2005). Tranche exemptée Art. **115(15)**: first **€1,500** (€3,000 joint) of Art. 97 income assessed par voie d’assiette. FO forfait **€25 (€50 joint)**. **Do not** hard-code “Luxembourg fund dividends are 100% exempt”: 2026 Art. 115(15b) is **State bonds** (15 Jan–15 Feb 2026), not OPC. There are **no articles 115a–115n**. |
| **Plus-values mobilières** | Art. 99bis / 100 / 132(2) | Securities/“autres biens” held **≤ 6 months**: Art. 99bis speculation, ordinary rates; annual speculation profit **< €500 exempt**. Held **> 6 months, participation ≤ 10%**: **exempt**. Held **> 6 months, > 10%** (5-year lookback, family): Art. **100**, **demi-taux global** (Art. 132 2 n° 2), abattement Art. 130(4) **€50,000 (€100,000 joint)** over 99ter–101. Crypto follows the same 6-month private-sale rule. **There is no Art. 99a.** |
| **Plus-values immobilières** | Art. 99bis (≤ 5 ans) / 99ter (> 5 ans) / 102bis / 102ter | Real-estate speculation is **5 years**, not 6 months. **Résidence principale: exempt** via Art. **102bis (definition) + 99bis(3) / 99ter(6)** (habitual since acquisition **or** ≥ 5 years; family/professional relocation waives the 5-year test). 2025 transition: realised 1.1.–30.6.2025 (and 1.7.–30.9.2025 with compromis at AED by 30.6.) used a **2-year** “recently acquired” test — do not generalise. Sales to State/communes/Fonds du Logement: Art. 102ter exempt. |
| **Revenus de location** | Art. 98 / 105–107 | Net rental. Forfait **35% of gross rent, max €2,700/building** only if entirely private patrimoine **and** completed ≥ 15 years on 1 Jan (interest, impôt foncier, gérance still deductible in addition). **Social rental Art. 115(22a): 90% of net exempt since AY 2024** (75% in 2023; 50% 2017–2022). **No general 40%/50% exemption for ordinary private leases.** Owner-occupied **valeur locative Art. 98(1) n° 5** (0% in recent years) with interest as FO of that category. |
| **Revenus étrangers** | Art. 2 / 13 / 134bis / 134ter | Worldwide for residents. **No DTT → Art. 134bis ordinary credit** (per State of source). **With DTT → the convention decides**: FR largely **exemption with progression**; DE/BE largely **credit**. Do not hard-code one method. Modèle 180 for foreign dividends. |
| **Indépendants** | Art. 14 / 91 / 93 | Net profit (Art. 94 forfait **abrogated 2017**). Occasional services Art. 99(3) **< €500/year exempt**. Jetons de présence FO **€15/séance, max €45/month, €540/year**. **No LIR “minimum forfait profit”** — the real floor is the **CCSS minimum cotisable**. CCSS pension **16% (2025) / 17% (2026)**; max cotisable **5 × SMN**. **TVA franchise €50,000 since 1.1.2025** (old €25,000 obsolete). |

**Non-residents** (out of MVP per the plan, but the enum is already in the UI): Class 2 only if 90% worldwide income is Luxembourg (or foreign income ≤ €13,000; Belgian residents 50%). Exemption with progression. Taux d’imposition. Art. 157ter assimilation. The engine must **refuse** NON_RESIDENT with “not supported” rather than compute a resident return.

### 1.9 2026 measures that the 2025-only engine cannot produce

Source: Ministère des Finances, *Nouveautés 2026* (29 Dec 2025).

| Measure | Effect on the engine |
|---|---|
| **AMVP** — abattement de maintien dans la vie professionnelle | Up to **€9,000** RIA reduction for people entitled to early old-age pension who keep working until 65. Certification required. |
| **Art. 111bis plafond** | €3,200 → **€4,500** |
| **CI-CO2** | €192 → **€216** (employee/pensioner) |
| **Start-up investment credit** | 20%, max €100,000/year |
| **Defence Bond interest** | Exempt |
| **Rental energy renovation amortisation** | 6% → 10% |
| **Bonification garde alternée** | max €922.50/child (2025 **and** 2026) |
| Scale / CIS / Class 1/1a/2 | **Unchanged** in 2026 (PwC, taxx.lu). Single class planned **2028**. |

The UI is hard-wired to **2025** (`TaxCalculatorView`, `QuestionnaireView` max year 2025, dashboard default 2025, demo facts 2025). `taxYear` is a parameter of `calculate()` but **ignored** by the scale.

**Other 2025/2026 measures the engine does not know (filing/ACD research):**

- **Salaire social minimum exonéré fiscalement depuis 1.1.2025** (MF budget 2026).
- **Prime jeune salarié** (Art. 115 n° 13d, from 2025): 75% exempt if < 30 on 1 Jan, first Luxembourg CDI, first prime < 5 years; annual exempt cap €5,000 / €3,750 / €2,500 by gross band; lost on employer change.
- **Bëllegen Akt**: **€40,000/person**, pérennisé June 2025 (not €45,000 — unverified). Registration-duty credit, not IR, but often asked in the same workspace.
- **Abattement construction spécial** Art. 129f from AY 2025 (circulaire 14 Aug 2025) — Form 100 recap has a dedicated line. Cap figures in secondary sources (4% / €250k) are **to verify** before coding.
- **Crédit d’impôt conjoncture 2026**: 1 June – 31 Dec 2026, fictive index tranche to be built into the barème on 1 Jan 2027. Monthly amounts (~€4–€54) are **secondary until the ACD 2026 CIC page or loi 19.12.2025 is quoted**. Do not invent them.
- **Classe unique U**: voted Oct 2026, applies **2028**, with a **25-year transition** for couples already in collective assessment. **Do not** implement for 2025/2026.
- There is **no “loi du 22 décembre 2024”** on ACD’s list. The resident package is the **loi du 20 décembre 2024** (Mémorial A 558/563/589/590).

### 1.10 Official forms the filing package should resemble

There is **no series “100A–100L”**. The official 2025 return is **modèle 100 F / 100 D**, **20 pages**, letter-coded sheets:

| Sheet | Content (2025 form) |
|---|---|
| Signalétique | Identity; deadline 31 December 2026 printed |
| Enfants | Children in/out; **CIM request case 228+** |
| E/R | Residents: options **316–319** (collective / individuelle pure / avec réallocation). Blank 316–319 → married persons are imposed **collectively** |
| NR | Non-residents, Art. 157bis/157ter, 90% context |
| C/A | Bénéfice commercial / agricole |
| I | Professions libérales |
| S | Salaires; FFO **€540**; déplacement 99 €/unit after 4 units, cap **€2,574** |
| P | Pensions; FFO **€300** |
| CM | Capitaux mobiliers; Art. 115 n° 15 tranche **max €1,500** (doubled if collective); FFO €25/€50 |
| L | Locations; **habitation personnelle interest caps by date of availability** |
| D | Revenus divers; spéculation; modèle 700 |
| EX | Revenus extraordinaires Art. 132/133 |
| DS | Dépenses spéciales; FDS **€480** (doubled if collective dual-earner); insurance **€672**; 111bis **€3,200** (2025); dons ≥ €120, ≤ 20% / €1,000,000 |
| CE | Charges extraordinaires Art. 127; enfants hors ménage |
| DD | Diverses demandes |
| RD | Retenues + DAC6 |
| Recap | RIA / signatures. Unsigned = non avenue |

Named annexes: **190/210** (bâties), **195**, **700** (plus-values immeubles), **104** (parent/garde), 102, 145, 180, 200, 720, 110/300.

The app’s `FilingService.generateFilingPackage` emits a short list of “boxes” **101 / 103 / 105 / 21–24 / 301 / 302 / 305 / 310**. Codes 101/103/105 are **modèle 160 certificat de rémunération** codes, not Form 100 cases. A MyGuichet user following this guide will type certificate codes into the wrong screens. Re-map to **official case numbers** (317 collective, 701+ salaires, 1001+ location, 2001+ recap, 228+ CIM) before any “field-transfer guide” is shown.

### 1.11 Worked example — how far the current engine is from the law

**Profile.** Resident employee, Class 1, one employer:  
Gross €50,000; CNS €6,000; retenue €7,000; Art. 111bis pension contract €3,000; no mortgage, no donations.

**Correct 2025 (simplified, before CIS/CI-CO2):**

```
Net salary            44,000
FFO                     −540
FDS forfait             −480
Art. 111bis           −3,200   (2025 cap; not the €672 Art. 111 bucket)
RIA                   39,780  → round €50
Class 1 tax           (official scale)
CIS                     +600
CI-CO2                  +192
```

**App:**

```
Net salary            44,000
FFO                     −540
Insurance min(3000,672) −672   (111bis collapsed into 111)
FDS max(480, 672)       −672
RIA                   42,788
Wrong scale + CIS ~€75 (phase-out zone, no CI-CO2)
```

Two independent errors (€2,528 extra taxable from 111bis, plus wrong scale/credits) push the estimate outside any “indicative” tolerance a taxpayer could rely on.

---

## 2. What the app currently is (architecture, not marketing)

The codebase is a pnpm + Turborepo monorepo that matches the plan’s stack:

| Layer | Reality |
|---|---|
| **Engine** | `@luxtax/tax-engine` — pure TS, zero deps, ~500 lines. **Hard-coded 2025.** JS `number` (not Decimal). Provenance objects exist and are a real asset. |
| **Contracts** | Clean DTOs. `TaxCalculationParams` has `residence` and `taxYear` that the engine ignores. No capital / rental / foreign / pension params. |
| **API** | NestJS + Prisma + PostgreSQL. Households, invitations, documents, facts, questionnaire, freelance P&L, filing, assessments, admin AI registry. Solid multi-tenant shape. |
| **Web** | Next.js 16. Views for dashboard, documents (with a 2025 sample certificate), facts, questionnaire, calculator, freelance, filing, assessment, admin. **Hard-coded “2025” copy.** |
| **Mobile** | Expo shell (plan wants first-class camera/secure storage — not audited in depth here). |
| **AI extract** | Local regex + optional vision models. Salary 101/103/105, mortgage, insurance (111/111bis merged), childcare, donations, freelance. **Cannot produce a legally complete fact set.** |

The product principles (evidence-linked, human-approved, deterministic engine, no LLM tax math, no MyGuichet bot) are the **right** principles and should be kept.

---

## 3. Requirement-to-app matrix

Legend: ✅ correct · 🟡 partial / wrong in some cases · ❌ missing or legally wrong

| # | Resident requirement | Engine | Data model / UI | Severity |
|---|---|---|---|---|
| 1 | 2025 Class 1 scale (official brackets) | 🟡 first 6 brackets OK, rest wrong | Hard-coded 2025 | **P0** |
| 2 | Class 2 splitting `2×Scale(R/2)` Art. 121 | 🟡 idea OK, extra floor of half, wrong euro-rounding | — | **P0** |
| 3 | Class 1a official Art. 120bis reduced base | ❌ average of two wrong taxes | Auto-class ignores 65+ on 1 Jan, PACS default separate, 3-year transitions | **P0** |
| 4 | Solidarity 7% / 9% Art. 124-style whole-tax, thresholds 150k/300k | ✅ | — | — |
| 5 | FFO €540 / person / year | 🟡 two payslips = two people | Filing always €540 | **P0** |
| 6 | FFO pensionné €300 | ❌ | — | **P1** |
| 7 | FDS €480 / €960 | ✅ amounts | — | — |
| 8 | Donations **additive** to FDS, min €120, 20% net | ❌ max() swallows small dons | Extractor exists | **P0** |
| 9 | Art. 111 €672 × persons (insurance + consumer interest) | 🟡 cap OK if only this bucket | Extractor merges 111bis | **P0** |
| 10 | Art. 111bis €3,200 (2025) / €4,500 (2026) **per person** | ❌ | No distinct fact type | **P0** |
| 11 | Owner-occupier interest = **FO of VL Art. 98 n°5 / Art. 105**, ACD 2y intégral then 4k/3k/2k × household | 🟡 4k/3k/2k exist as **old rolling 1–5/6–10/>10**, year never passed, **mis-cited Art. 102** | Questionnaire has a year | **P0** |
| 12 | Épargne-logement €1,344 / €672 + majorations | ❌ | — | **P1** |
| 13 | ASRD prime unique table | ❌ | — | **P2** |
| 14 | Art. 129b AEP €4,500 dual earners (lower-net cap) | ❌ | Not asked | **P0** |
| 14b | CII + CI-CO2 indépendant; XOR CIS per person | ❌ | Freelance exists, no CII | **P0** |
| 14c | Art. 7(2) loss compensation + Art. 114 | ❌ floored at 0 | — | **P0** |
| 14d | Class wizard Art. 3/3bis/3ter/119 n°3 | ❌ two members → Class 2 | — | **P0** |
| 14e | Déplacement Art. 105bis 99 € / 2,574 € | ❌ | — | **P0** |
| 15 | CIS 2025 official three-zone formula | ❌ low/mid incomes | — | **P0** |
| 16 | CI-CO2 €192 (2025) / €216 (2026) | ❌ | — | **P0** |
| 17 | CIM 2025 €3,504 / 0.0612 / €750 | ❌ (2024 numbers + wrong 2024 formula) | — | **P0** |
| 18 | CIP, CISSM, modération €922.50, CII | ❌ | — | **P1** |
| 19 | Pension income taxable | ❌ category dropped | Category exists | **P0** |
| 20 | Capital income: 15a 50% (not general), €1,500 tranche, RELIBI | ❌ | — | **P1** |
| 21 | Plus-values: 6 months / >10% Art. 100 / 102bis (no Art. 99a) | ❌ | — | **P1** |
| 22 | Rental income + 35%/€2,700 forfait + social 90% | ❌ | Plan “later scope” | **P1** |
| 23 | Foreign income + treaties | ❌ | Residence flag unused | **P1** |
| 24 | Freelance net profit | 🟡 revenue − expenses | No CMS, amort, CII | **P1** |
| 25 | Childcare / domesticité = **CE forfait €5,400** (Art. 127), not DS | ❌ dropped | Extractor exists | **P1** |
| 26 | AMVP €9,000 (2026) | ❌ | — | **P1** (2026) |
| 27 | Start-up credit 20% (2026) | ❌ | — | **P2** |
| 28 | taxYear routing 2025 vs 2026 | ❌ one scale | UI locked to 2025 | **P0** |
| 29 | NON_RESIDENT refusal / separate path | ❌ param unused | Enum in profile | **P1** |
| 30 | Form 100 official sheets/cases + annexes 190/210, 700, 104 | ❌ 160 codes; no assistant-exclusion warnings | 4-step MyGuichet story | **P0** for filing claim |
| 31 | Joint/individual scenario compare | ❌ | Plan promised | **P2** |
| 32 | Decimal money | ❌ JS float | Prisma Decimal exists | **P1** |
| 33 | Deterministic provenance | ✅ structure | Wrong rule codes (102 vs 111) | keep + fix labels |
| 34 | Household dual approval | ✅ (API) | — | keep |
| 35 | Evidence-linked facts | ✅ shape | Incomplete field set | extend |
| 36 | No LuxTrust storage / no auto-file | ✅ | — | keep |

---

## 4. Proposed improvements

### 4.0 Principle

Do **not** ship another hard-coded `scale2025.ts`. Implement the plan’s **immutable tax-year rule packages** now. Every euro amount, bracket, rate, and formula id lives in a versioned package with source URL and Mémorial reference. The engine becomes a **interpreter** of packages, not a book of constants. That is what makes 2026 (and 2028’s single class) a data change, not a rewrite.

### 4.1 P0 — legal correctness of the 2025 employee/household core  
*Ship-blocking. A resident with only a salary, a mortgage and a pension plan still gets a wrong number today.*

**P0-1. Replace `TAX_BRACKETS_2025` with the official table in §1.3.**  
Move it to `packages/tax-rules/2025/scale.ts`. Add `2026` as a copy (scale unchanged) so `taxYear` selects the package. Export `getRulePackage(taxYear)`; throw on unsupported years instead of silently using 2025.

**P0-2. Fix Class 2 / Class 1a / rounding (Art. 121, 120bis, 124, 126).**

```ts
// Art. 126 al. 2 — keep the app’s floor to €50 (do NOT switch to nearest)
const ria50 = Math.floor(taxableIncome / 50) * 50;

if (taxClass === CLASS_2) {
  // Art. 121 — no extra floor of the half
  return floorEuro(2 * progressiveScale(ria50 / 2));
}
if (taxClass === CLASS_1A) return class1aArt120bis(ria50);
return floorEuro(progressiveScale(ria50));

function floorEuro(x: number): number {
  const f = Math.floor(x);
  return f < 12 ? 0 : f;   // Art. 124: floor to euro; cotes < 12 € = 0
}

// Art. 120bis — official Class 1a, NOT the average of Class 1 and Class 2
function class1aArt120bis(ria: number): number {
  const base = ria <= 79380 ? ria - (79380 - ria) / 4 : ria;
  return progressiveScaleWith1aMarginalCaps(base, ria);
}
```

**Regression tests (must pass before merge):**
- Class 1, R = €50,000 → **€7,341**
- Class 2, R = €100,000 → **€14,682** (ACD official splitting example)
- Class 1a, R = €26,460 → **€0**
- Class 1a, R = €150,000 → **€44,268**
- Fonds 7% below 150k / 300k; 9% above — keep current engine block.

**P0-3. Rewrite `credits.ts` to the ACD 2025 text.** Implement CIS, CI-CO2, CIP and CIM as **year-aware, mutually exclusive** credit functions (CIS xor CIP xor CII).

```ts
export function cis2025(gross: number): number {
  const g = Math.floor(gross); // circulaire 154quater/1: annual gross floor to 1 €
  if (g < 936) return 0;
  if (g <= 11265) return ceilCent(300 + (g - 936) * 0.029);
  if (g <= 40000) return 600;
  if (g < 80000) return Math.max(0, ceilCent(600 - (g - 40000) * 0.015));
  return 0;
}

export function ciCo2Salaries(gross: number, taxYear: 2025 | 2026): number {
  const g = Math.floor(gross);
  const [base, slope] = taxYear === 2025 ? [192, 0.0048] : [216, 0.0054];
  if (g < 936) return 0;
  if (g <= 40000) return base;
  if (g < 80000) return Math.max(0, ceilCent(base - (g - 40000) * slope));
  return 0;
}

// CIP 2025/2026: 0 below 300; flat 300 on 300–935; then CIS build-up from 936
export function cip2025(pension: number): number {
  const p = Math.floor(pension);
  if (p < 300) return 0;
  if (p <= 935) return 300;
  return cis2025(p); // identical from 936 upward
}
```

CIS/CI-CO2 **once per person**, not once per salary fact. Group gross by `ownerId` (Art. 154quater: “n’entrent qu’une seule fois en ligne de compte pour l’ensemble des salaires alloués au salarié”). Base is **gross including Art. 134 exempt salary**. Rounding (Art. 154quater al. 2 + circulaire 154quater/1): annual gross **floor to the next euro**; credit **ceil to the next cent**; daily amount = annual / **300** (not 365).  
CIS and CIP are **mutually exclusive** (mixed salary + pension → year-end regularisation). CIS/CIP **do not re-enter** the ordinary décompte annuel; **CIM does**.  
2026 package: CIS scale unchanged; CI-CO2 base **216** with phase-out slope **0.0054** (ACD CIS 2026 page).

**P0-4. CIM 2025.**

```ts
export function cim2025(ria: number): number {
  if (ria <= 60000) return 3504;
  if (ria <= 105000) return Math.max(750, round2(3504 - (ria - 60000) * 0.0612));
  return 750;
}
// then: cim -= 0.5 * max(0, childAllocations - 2712)
```

Gate on **Class 1a AND at least one child à charge AND not cohabiting with the other parent** (questionnaire). 65+ without children → CIM = 0.

**P0-5. Split insurance into three fact types** (breaking change to `FactCategory` / extractor / engine):

```
SPECIAL_EXPENSE_ART111        // vie/accidents/maladie + consumer loan interest → cap 672 × membres
SPECIAL_EXPENSE_ART111BIS     // prévoyance-vieillesse → cap 3200 (2025) / 4500 (2026) × personnes
SPECIAL_EXPENSE_MORTGAGE_111  // habitation personnelle → 4000/3000/2000 × membres × année
```

Extractor: stop merging “art 111 / 111bis / prévoyance” into one `insurancePremium`. Ask the user “is this a pension-savings contract (10 years, payout 60–75)?”.

**P0-6. Deductions composition.**

```
// Frais d'obtention (Art. 105 / 107) — NOT Art. 102
ffoSalarié      = 540 per person with salary (doubled only if each spouse has salary)
ffoPension      = 300 per pensioner
ffoCapitaux     = 25 if capital income
ffoDeplacement  = 99 * max(0, units - 4), cap 2574, per salarié
ffoReels        = actual FO if > forfait (syndicats, vêtements pro, …)
fraisObtention  = max(forfait, reels)  // never 540 for independents

// Owner-occupier interest = FO of valeur locative Art. 98 n°5 / Art. 105
foHabitation    = min(interest, capByAcdSchedule * (1 + conjointCollectif + enfantsModérés))
                  // years 1–2 intégral, 3–6: 4000, 7–11: 3000, 12+: 2000

// Dépenses spéciales Art. 109–113
ds672           = min(art111Insurance + consumerInterest, 672 * (1 + conjoint + enfantsModérés))
ds111bis        = min(art111bis, 3200 (2025) | 4500 (2026) * contributors)
dsÉpargneLog    = min(épargneLogement, 1344 | 672 by younger adult age)   // SEPARATE from 672
dons            = declared >= 120 ? min(declared, 0.20 * revenuNet, 1_000_000) : 0  // ADDITIVE, report 2 years
fds             = 480 per person; 960 if two-earner Class 2   // does NOT cover Art. 110 n°1–3a or dons
dsTotal         = max(fds, ds672 + ds111bis + dsÉpargneLog) + dons

// Charges extraordinaires — NOT DS
ceForfait       = min(5400, garde + domesticité + soins)   // < 14 ans + modération; 450/mois

aep             = 4500 if class 2 and both spouses professional income and both SS-affiliated

revenuNet       = salaries net + pensions net + capital net + rental net + freelance net + VL habitation (0%)
taxable         = max(0, revenuNet - fraisObtention - foHabitation - dsTotal - ceForfait - aep - otherAllowed)
```

Pass **année de fixation de la valeur locative** (and a construction/not-yet-available flag) through `CalculationsService` → engine. Fix provenance: `LIR-ART-105`, `LIR-ART-107`, `LIR-ART-98-5`, `LIR-ART-109-113`, `LIR-ART-111-672`, `LIR-ART-111BIS`, `LIR-ART-112`, `LIR-ART-110BIS`, `LIR-ART-127-CE`.

**Golden Class 2 check (ACD):** RIA €100,000 → `Scale(€50,000) = €7,341` → Class 2 tax **€14,682** before fonds pour l’emploi.

**P0-7. Tax pensions.** Map `PENSION_INCOME` to Art. 96 net (gross − FFO 300 − relevant social). Apply **CIP** (add to the 2025 package once ACD CIP 2025 figures are encoded). Flag Art. 111bis capital payouts as *not yet supported* → warning, not silent zero.

**P0-8. `employedSpousesCount` = number of distinct `ownerId` with employment income**, not number of salary facts.

**P0-9. Filing package.** Stop calling 101/103/105 “Form 100 boxes”. Two-track output:
1. **Certificat 160 import sheet** (codes 101/103/105 — this part is almost right).
2. **Form 100F sheet/case map** from the official 20-page PDF (Signalétique, Enfants 228+, E/R 316–319, S, P, CM, L, DS, CE, RD, recap 2001+). Missing annexes listed as “not produced — sheet not supported”.

FFO box must equal the **computed** FFO (€1,080 for two employees), not a constant 540. Implement the **assistant électronique exclusions** as warnings (Art. 3ter request, mixed 90% option, change of residence, double marriage). Deadline: N+1 31 December; 2025 window opened 7 April 2026.

**P0-10. Refuse unsupported input instead of computing a lie.** If any fact is capital, rental, foreign, or residence is NON_RESIDENT, return `status: UNSUPPORTED_SCENARIO` with a list of missing modules. The plan already says “Refuse unsupported scenarios instead of guessing” (plan §12.5) — implement it.

**P0-11. Tests.** Replace the current specs (which assert the **wrong** brackets) with a golden set:
- ACD calcul-en-ligne screenshots/values for Class 1/1a/2 at the bracket edges.
- CIS at €936 / €11,265 / €20,000 / €40,000 / €80,000.
- CIM at €60,000 / €80,000 / €105,000.
- 111bis vs 111 vs mortgage.
- Dual-earner AEP.
- Two payslips, one person.

### 4.2 P1 — complete the common resident return  
*Still in the “personal income tax for typical residents” promise; currently in “later scope” of the plan but already advertised in the README.*

1. **Capital income module** (Art. 97 / 115 n° 15 / 15a): dividends (LU WHT 15%, 50% only if 15a), interest (RELIBI 20% option), €1,500 tranche, FO €25. Do not invent a fund-distribution exemption.
2. **Plus-values**: 6-month movable speculation + €500 floor; >10% Art. 100 demi-taux; real estate 5-year / 102bis principal residence. **No Art. 99a.**
3. **Rental module** (annexe 190/210): frais réels vs 35%/€2,700 forfait; social rental 90% Art. 115(22a); owner-occupier VL + Art. 98 n°5 interest.
4. **Foreign income**: amount, country, **per-country method** (FR progression vs DE/BE credit vs 134bis fallback). Minimum viable: include in RIA for **taux** and warn that treaty treatment needs a professional.
5. **Épargne-logement** and **charges forfaitaires CE €5,400**.
6. **CIP / CISSM / CII**.
7. **Class determination service** (Art. 119 / 3 / 3bis / 3ter): marital status, PACS + full-year common home, age on **1 January**, children with modération, 3-year divorce/widow Class 2 transition, optional Art. 3ter individual election for spouses. Do not let the household member count silently decide Class 2. Partners default to separate returns.
8. **2026 package**: AMVP €9,000, 111bis €4,500, CI-CO2 €216, bonification €922.50. Unlock the year in the UI (remove hard-coded 2025).
9. **Decimal.js or BigInt cents** in the engine. Prisma already stores `Decimal(12,2)`.
10. **Extractor v2**: certificat 160 full codes (not only 101/103/105), attestation d’intérêts (distinct 111 vs 111bis vs Art. 98 n°5), modèle 170 pension.

### 4.3 P2 — differentiators already in the product plan

- Joint vs individual **scenario comparison** (Class 2 vs 2× Class 1) — legally meaningful for married residents and already a promised “differentiation” item.
- Professional-review portal, subscription, bank import: keep out of MVP.
- **2028 single-class** package behind a flag; do not leak to 2025/2026 users.
- Start-up credit and Defence Bond (2026 niche).
- Luxembourgish / Portuguese UI.
- Official electronic submission: still **do not** implement without the Level-3 checklist in plan §13.2.

### 4.4 Concrete file-level workplan

| File | Action |
|---|---|
| `packages/tax-engine/src/scale2025.ts` | Rename to `scale.ts`; export official 2025 + 2026 tables; delete wrong brackets |
| `packages/tax-engine/src/credits.ts` | Rewrite CIS; add CI-CO2, CIP, CISSM, CIM 2025 |
| `packages/tax-engine/src/deductions.ts` | Split FO 105/107 / VL 98 n°5 / DS 109–113 / CE 127 / dons / AEP; ACD habitation schedule |
| `packages/tax-engine/src/engine.ts` | Tax-year package lookup; pension; distinct-owner FFO; unsupported-scenario guard; Decimal; fix rule codes |
| `packages/tax-engine/src/rules/` *(new)* | `2025.ts`, `2026.ts`, `types.ts` — amounts + source URLs + effective dates |
| `packages/contracts/src/tax.ts` | Extend params: occupancy, 111bis, AEP flags, pension, capital, ages, PACS |
| `packages/contracts/src/enums.ts` | New `FactCategory` values for 111 / 111bis / pension / capital / rental / foreign |
| `apps/api/.../calculations.service.ts` | Pass profile answers (occupancy, ages, both-work) into engine |
| `apps/api/.../filing.service.ts` | Re-map 100F; computed FFO/FDS; annex needed-list |
| `apps/api/.../documents/receipt-ai-vision.service.ts` | Separate 111 vs 111bis prompts |
| `apps/web/.../TaxCalculatorView.tsx` | Remove “2025” literals; show CI-CO2, AEP, 111bis lines |
| `apps/web/.../QuestionnaireView.tsx` | Age, PACS, both-work, 111bis yes/no, occupancy already there |
| `packages/tax-engine/test/` | Golden tests vs ACD; delete tests that bless the wrong scale |

### 4.5 What is already good — do not undo

- Household-first dual login, private-draft → shared → included visibility, approval invalidation.
- Deterministic TS engine + provenance (keep and **correct** the rule codes).
- No LLM in the tax path; no LuxTrust; no fake “filed” state.
- Admin model registry / routes (over-engineered for day 1 but consistent with the plan).
- Trilingual ambition, EU storage, audit events.

The gap is **not** product design. It is that the engine’s legal content is a demo of the 2024-era numbers, labelled 2025, missing the 2025 reform (scale upper end, CIS low-income band, CIM €3,504, CI-CO2) and missing structural articles (111bis, **129b**, 112 additive, 96 pensions, 7(2) loss compensation, CII).

---

## 5. Suggested delivery order

| Sprint | Outcome |
|---|---|
| **1 (P0 engine)** | Official 2025/2026 scale, CIS+CI-CO2, CIM, 111/111bis/mortgage/dons/AEP, pension basic, FFO per person, availability-date caps, golden tests. UI still 2025 but numbers become defensible. |
| **2 (P0 filing)** | 100F sheet/case map from the official PDF; computed forfaits; assistant-exclusion and unsupported-income warnings; unblock “filing package” claim. |
| **3 (P1 income)** | Capital, rental, foreign (progression), childcare CE, CIP/CISSM, class wizard, 2026 year in UI. |
| **4 (P1 polish)** | Decimal, extractor v2, scenario compare, AMVP/start-up behind 2026 package. |
| **Later** | 2028 single class, non-residents, MyGuichet Level 3, professionals. |

Until Sprint 1 ships, the honest product copy is: **“workspace for collecting and structuring 2025 documents — estimates are not yet aligned with the 2025 LIR barème.”** The current README sentence “Calculated strictly according to Article 118-121 LIR and published ACD scales” is not accurate for the code in `main`.

---

## 6. Spouse side-business, mixed income, and Class 2 (the “employee + freelance” household)

This is the most under-served legal case in the codebase. `FreelanceService` even **auto-creates a freelance profile for every household member**, including a pure employee with no side-gig. The engine then treats freelance as `max(0, revenue − expenses)` and **floors losses at zero**, which is the opposite of Art. 7 al. 2.

### 6.1 Same person: Art. 95 salary + Art. 14/91 side-business — legal, and currently broken

There is no incompatibility. The two résultats are computed separately, then **compensated** (Art. 7 al. 2): an independent **loss reduces taxable salary** of the same year. Leftover loss is a dépense spéciale under **Art. 114** (17-year carry-forward, oldest first, only the person who bore the loss). Occasional Art. 99(3) services < €500/year are exempt and their deficit is **not** compensable — different path.

**FFO:** one **€540** for all Art. 95 salaries of that person, **€0** on the independent profit (Art. 107 al. 1 / al. 3). Independents deduct real frais d’exploitation inside the bénéfice. Two employers ≠ two FFO.

**CIS xor CII, per person (Art. 152ter).** CIS follows salary; CII follows independent profit; **cannot be cumulated in the same person**. Formulas are the same shape in 2025 and 2026, except CII is **more generous at the bottom**: bénéfice net **< €936 still yields CII €300** (CI-CO2 indépendant 0); CIS is 0 below €936 of salary. A published tie-break when the same person qualifies for both does **not** exist — **do not grant both, do not invent a priority**. CI-CO2 indépendant: €192 (2025) / **€216 (2026)**, slope 0.0048 / 0.0054, same €80,000 cut-off.

**Obligatory modèle 100** if independent net > **€600** (or RI > €12,438). Avances trimestrielles Art. 135: 10 March, 10 June, 10 September, 10 December, typically on the residual tax RTS did not cover.

**TVA:** franchise **€50,000 since 1.1.2025** (old €25k/€35k obsolete), +10% tolerance (€55,000) in the year of overshoot, excluded the following calendar year. Invoice mention: “TVA non applicable – Article 57 bis”. Union threshold €100,000. Identification (déclaration initiale) is required **even** under franchise. **CCSS:** affiliate within **8 days**; activité accessoire to a salary: provisional assiette **1/3 SMN**, min cotisable SMN, max 5 × SMN; pension **16% (2025) / 17% (2026)**. CCSS is **monthly**, not quarterly. Art. 110 n° 2: obligatory independent SS is **unlimited DS**, not frais d’exploitation.

**App:**
- `max(0, freelanceGross − expenses)` **destroys the loss**. Must keep the sign and compensate against salary.
- No CII, no XOR CIS/CII, no CCSS, no Art. 114 inventory, no TVA flag, no Art. 135 avances.
- A mixed person with two salary facts + freelance is at risk of double FFO and double CIS.
- `FreelanceService` should not invent a profile for a member with `hasFreelanceIncome = false`.

### 6.2 Married residents: Class 2 covers freelance; Art. 3ter is the only exit

Resident spouses are **Class 2 by default** (Art. 3). There is no “salary in Class 2, freelance in Class 1”. One household RIA, including freelance, then `2 × Tarif(RIA/2)`.

**Art. 3ter** (joint, deadline 31 December N+1, forces modèle 100, assistant électronique cannot make the election):
- **Pure (al. 2):** each spouse on own RIA, **Class 1 each** — **not Class 1a**, even with children or 65+.
- **Avec réallocation (al. 3):** joint RIA first (same forfaits as collective), then split (default 50/50). Each **Class 1**. 50/50 réallocation **= Class 2 on the barème** (convexity). A non-50/50 split is never better on a convex tariff.

**On the barème alone, Class 2 never loses** to Art. 3ter at constant joint RIA. It **wins when incomes are unequal** (employee + profitable side-business). Illustration from the official Art. 118 tariff (fonds excluded): one earner €80,000 → Class 1 ≈ €18,964 vs Class 2 ≈ **€8,464**. Two earners €40k + €40k → individual pure **ties** Class 2 (€8,464).

**Where Class 2 can still lose money (off-barème):**
1. **CIM / Class 1a** — only for taxpayers who can be 1a (PACS separate, mixed couple without the 90% option, post-window widow/divorcé). Married Art. 3ter still gets **Class 1, not 1a**, and **no CIM**.
2. **Art. 48 n° 2–3** — married Class 2 business **cannot deduct** spouse salary or rent to close relatives collectively taxed with the exploitant. PACS Class 2 is **exempt** from Art. 48 n° 2–3 (Art. 3bis al. 2). Art. 3ter literal unlock of Art. 48 n° 3 is a statutory reading, **not** confirmed by an ACD example — do not ship “pay your spouse” as a recommendation.
3. **Joint liability** and the impossibility of using the assistant électronique for 3ter.

**AEP in this household:** Art. 95 + Art. 14/91 satisfy al. 2 a) → **€4,500**, **capped by the lower net**. A €2,000 libérale net caps AEP at ~€2,000. A loss can zero it. Conjoint-aidant is the backdoor when the second spouse has no own professional net. **CIS of the employee AND CII of the independent coexist** in Class 2 (non-cumul is per person, not per household). Two CII require the second person to be affiliated as conjoint-aidant.

**FFO doubling:** one salarié + one indépendant ⇒ **not** doubled (Art. 107 al. 4 is per category). Two salariés ⇒ €1,080.

### 6.3 Conjoint-aidant (CCSS, not a third tax class)

Conditions: married or partners; helps **principally** the independent; principal is **indépendant en nom personnel** (in a société the aidant is a salarié); principal not dispensé for revenu insignifiant.

Assiette: independent revenu **divided in two**; aidant cotisable capped at **2 × SMN** (surplus back on the principal); individual floor SMN; couple may request a **pension-risk reduction** if joint income < SMN (aidant then still cotises on at least 1/3 SMN).

AEP route b), second household CII, split CCSS assiette — **no Art. 95 salary is created**.

### 6.4 PACS vs marriage — do not flatten

| Event | That year |
|---|---|
| Marriage during the year | **Class 2** (Art. 3 b) |
| PACS during the year | **Not** Class 2 (partnership must have existed 1 Jan–31 Dec) |
| PACS, no joint request | Two households, Class 1 / 1a |
| PACS + joint request (common home all year) | Class 2, forces assiette, **no individual pure** (réallocation only) |
| Divorce / death in the **3 preceding years** | **Forced Class 2** (Art. 119 n° 3), even with children / 65+, **no CIM**, **no Art. 3ter** |

**Two different 90% tests — do not merge:**
- **Art. 3 d):** resident spouse ≥ 90% of the **ménage’s professional income in Luxembourg** → optional Class 2 for mixed resident/non-resident. Default otherwise: resident spouse **Class 1 or 1a** (1a if modération child).
- **Art. 157ter:** NR assimilation — ≥ 90% of **worldwide income** in LU, **or** foreign net < **€13,000** (Belgium: > 50% professional). Different numerator, different denominator.

### 6.5 Children — Class 2 vs 1a/CIM trade-off (who actually faces it)

| Household | 1a + CIM? | Class 2? | Trade-off? |
|---|---|---|---|
| Married residents | **No** (CIM excluded, even with 3ter) | Default | No CIM trade-off |
| PACS, common child, common home | **No** (both parents in the home) | On request | No CIM; Class 2 usually ≥ as good |
| PACS, child of one partner in that partner’s ménage | **Yes** if they stay separate | On request | **Yes.** Separate = 1a + CIM €3,504 refundable vs Class 2 splitting |
| Mixed R/NR, no Art. 3 d) | Resident 1a + CIM if NR parent not in the common home | Only if 90% test met | Yes, if CIM is worth more |
| Veuf/divorcé in 3-year window | No (forced Class 2) | Forced | After year 3: 1a + CIM appears |

Married Class 2: children do **not** change the class; they **do** change plafonds (672, épargne-logement, habitation multiplier 1 + conjoint + enfants modérés).

**App class wizard must implement Art. 119 / 3 / 3bis / 3ter**, not “two members → Class 2”.

---

## 7. Legal tax-optimisation catalog (residents 2025/2026) — and what the app cannot compute

Legal optimisation only. Not evasion. Most DS/CE items must be **paid in the tax year** — December is the last chance.

### 7.1 Highest-leverage items for a typical resident couple

| Lever | 2025 | 2026 | App |
|---|---|---|---|
| Art. 111bis/111ter **per person** (shared cap 111bis+111ter) | €3,200 × souscripteurs | **€4,500** × souscripteurs (Class 2 couple: up to **€9,000**) | ❌ collapsed into 672 |
| Art. 129b AEP dual earners | €4,500 (lower-net cap) | same | ❌ |
| FDS 480 / 960 + **additive** dons Art. 112 | unchanged | unchanged | 🟡 max() swallows small dons |
| Owner-occupier interest ACD schedule (2y intégral, then 4k/3k/2k × household) | from AY 2024 | same | 🟡 wrong schedule + Art. 102 label |
| Déplacement Art. 105bis | 99 €/unit, first 4 ignored, cap **€2,574**, **in addition to** FFO 540 | same | ❌ |
| LRCP Art. 110 n° 3 | **€1,200** (not in 672, not in 480) | same | ❌ |
| Épargne-logement Art. 111 al. 5 | €1,344 (18–40) / €672, **separate** from 672; younger adult’s age for the couple | loi 8775 would suppress the 40-year limit — **not yet pin as 2026 law** | ❌ |
| CE garde / domesticité / soins | **€5,400** (450/mois), enfants < 14 + modération | same | ❌ category dropped |
| CIS + CI-CO2 **per person** | official 3-zone formula; CI-CO2 €192 | CIS same; CI-CO2 **€216** slope 0.0054 | ❌ wrong CIS, no CI-CO2 |
| CIM Class 1a | €3,504 / 0.0612 / €750, refundable | same | ❌ 2024 numbers |
| AMVP Art. 129g | **does not exist** | **€9,000** (57–65, CNAP certificate, still working) | ❌ |
| FFO 540 / 300 / 25, doubled if each spouse has that category | unchanged | unchanged | 🟡 two payslips = two people |
| Invalidity forfaits | €645–€1,020; €1,515 vision/impotence | same | ❌ |
| ASRD prime unique | extra cap up to ~€6,000–€25,000 by age/children (Form 100 1474–1477) | same | ❌ |
| Dons timing | paid-in-year; excess report **2 years**; max 20% net **and €1,000,000** | same | 🟡 no 1M€, no report, not additive |
| Art. 114 loss stock | 17 years from 2017 | same | ❌ floored at 0 |
| Securities > 6 months (≤10%) | exempt | same | ❌ |
| Résidence principale Art. 102bis | exempt | same | ❌ |
| Prime jeune salarié Art. 115 n° 13d | 75% exempt, caps 5,000/3,750/2,500 | same | ❌ |
| Start-up credit | — | 20%, cap €100k (mfin; 10k/3y **中置信**) | ❌ P2 |
| Bëllegen Akt | **€40,000/person** AED (not IR) | pérennisé June 2025; €45k **unverified** | ❌ out of PIT scope |
| CIC 2026 | — | 1 Jun–31 Dec 2026, fictive index tranche; **amounts 待证** until loi 8775 published | correctly absent |
| Télétravail forfait | **does not exist** (indemnities taxable); home office = frais réels circulaire 105/2 (≥90%, pièce à part) | same | ❌ (and should not invent a forfait) |

### 7.2 December / year-boundary calendar

Pay 111bis, dons ≥ €120, LRCP, 672-box insurance, garde — **before 31 December**. Souscrire 111bis before the 65th birthday eve. Hold securities **> 6 months**. Hold RE **> 5 years** or document 102bis. CNAP AMVP certificate in 2026. Art. 3ter / PACS Class 2 request: **31 December N+1**. File 100/163: 31 December N+1 (2025 window opened 7 April 2026). Don excess: N+1 and N+2. Art. 114 clock: 17 years.

### 7.3 Class 2 vs Art. 3ter — recommendation logic the app should implement

```
if married residents:
    default Class 2 (including freelance)
    if incomes similar and no Art. 48 issue: Class 2 ≈ 50/50 réallocation (tie on barème)
    if incomes unequal (employee + profitable side-business): Class 2 wins big
    if loss-making side-business: Class 2 wins (Art. 7(2) against salary)
    if both want 111bis: Class 2 absorbs both into joint RIA (win vs pure if one net is small)
    CIM is not available — do not offer it
    Art. 48 n° 3: do not recommend paying the spouse by the business
if PACS:
    default separate 1/1a
    Class 2 only on joint request (full year + common home)
    if child of one partner + CIM possible: compare CIM €3,504 refundable vs splitting
if mixed R/NR:
    Art. 3 d) 90% professional-in-LU test ≠ Art. 157ter 90% worldwide test
    default resident = 1 or 1a (1a if modération child)
if 3-year death/divorce window: forced Class 2, no CIM, no 3ter
```

Do **not** show “Class 2 always better” without the CIM/1a branch for PACS and mixed couples.

---

## 8. Gap-check of this audit (what was missed the first time)

Self-audit of `luxembourg-tax-resident-gap-analysis.md` as it stood before this expansion:

| # | Missed or mis-stated | Fix |
|---|---|---|
| 1 | AEP cited as **Art. 110bis** | **Art. 129b**. 110bis does not exist for AEP. Form 100 p. 20 confirms. |
| 2 | No **spouse side-business / mixed income** chapter | §6 of this file; detailed notes in `research/mixed-professional-income-2025-2026.md` |
| 3 | No **Art. 7(2) loss compensation**; engine floors freelance at 0 | P0: keep the sign; test “salary 60k + freelance −20k” |
| 4 | No **CII / CI-CO2 indépendant**; no XOR with CIS | P0: per-person XOR; household CIS+CII coexist |
| 5 | No **conjoint-aidant** | CCSS status + AEP route b) + second CII + split assiette |
| 6 | No **Art. 3ter / PACS / 3-year window** class wizard | §6.2–6.5; “two members → Class 2” is wrong for PACS and mixed couples |
| 7 | No **Art. 48 n° 2–3** | Married Class 2 cannot expense spouse salary/rent; PACS can |
| 8 | Two 90% tests flattened | Art. 3 d) vs Art. 157ter |
| 9 | CCSS not modelled as Art. 110 n° 2 unlimited DS | Independents: pension 16/17%, accessoire 1/3 SMN |
| 10 | TVA franchise stale in the product story | **€50,000** from 1.1.2025, not €25k/€35k |
| 11 | No Art. 135 avances | 10/03, 10/06, 10/09, 10/12 on residual after RTS |
| 12 | CII €300 below €936 not stated | CII is more generous than CIS at the bottom |
| 13 | 111bis and 111ter share **one** cap | Cannot stack 3,200 + 3,200 with one of each |
| 14 | 50/50 réallocation = Class 2 on the barème | Convexity; non-50/50 never better |
| 15 | 2025 Class 1a reform does **not** make 1a beat Class 2 | Class 2 ≤ 1a at every tested RIA; 3ter still gives Class 1 not 1a |
| 16 | Déplacement 99 € / 2,574 € not in the P0 list | Add to P0-6 FO block |
| 17 | LRCP €1,200 not separated from 672 | Art. 110 n° 3 |
| 18 | No optimisation catalog | §7 |
| 19 | FDS al. 2 reduction (lesser spouse net < 480) not implemented | Class 2 two-earner 960 is the common case; the reduction is the edge |
| 20 | `FreelanceService` auto-creates profiles for non-freelancers | Product bug, not just engine |
| 21 | Art. 105bis, invalidity, home office 105/2, formation Fortbildung vs Ausbildung | In §7; all ❌ |
| 22 | Don report 2 years and €1M cap incomplete | Art. 109 n° 3 / Art. 112 |
| 23 | épargne-logement 40-year suppression (loi 8775) | **待证** until Mémorial — do not grant 1,344 to 41+ for 2026 yet |
| 24 | CIC 2026 amounts | **待证** — keep absent |
| 25 | Class 1a vs Class 2 numeric table | Class 2 − 1a ≈ −€93 at €30k, −€12,082 at €100k |

The original P0 list (scale, CIS/CI-CO2, CIM, 111/111bis split, dons additive, 129b, pensions, FFO per person, occupancy/valeur locative, tax-year packages, Form 100 sheets, unsupported-scenario guard) **remains valid** and is now **extended** with CII/XOR, Art. 7(2)+114, AEP 129b with lower-net cap, class wizard, déplacement, LRCP, CE garde.

---

## 9. Extended P0/P1 workplan (spouse-business and couples included)

**P0 (legal correctness of the 2025 employee + couple core)** — previous list **plus**:
- Signed Art. 7(2) compensation; Art. 114 inventory.
- CII + CI-CO2 indépendant; XOR CIS/CII per person; household CIS+CII.
- Art. 129b AEP (4,500 / 2,250 / 375) with three routes and lower-net cap. Rename every `110bis`.
- Class wizard Art. 119 / 3 / 3bis / 3ter / 119 n° 3.
- Art. 105bis déplacement.
- Stop flooring freelance losses; stop auto-creating freelance profiles.

**P1 (complete the common resident return)** — previous list **plus**:
- CCSS indépendants (Art. 110 n° 2) and accessoire 1/3 SMN.
- Conjoint-aidant.
- CE garde €5,400.
- LRCP €1,200; épargne-logement; ASRD prime unique.
- Scenario compare Class 2 vs pure vs réallocation 50/50.
- TVA €50,000 flag in the freelance module (not in the PIT engine).
- Art. 48 n° 3 flag (warn, do not recommend spouse salary).
- 2026 package: AMVP, 111bis €4,500, CI-CO2 €216; unlock the year in the UI.

**P2** — start-up credit, Defence Bond, CIC 2026 once published, 2028 Class U, non-residents, MyGuichet Level 3.

**Do not implement without a Mémorial pin:** CIC 2026 monthly amounts; épargne-logement 40-year suppression; Bëllegen €45,000; Art. 48 n° 3 under 3ter as a user-facing recommendation; OPC distribution 100% exemption; June 2026 SMN.

---

## 10. Source index (primary)

- ACD — Barèmes (2025 = Mémorial A N° 590 du 24.12.2024): impotsdirects.public.lu/fr/baremes.html  
- ACD — CIS 2025 and CIS 2026: impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2025.html and `…/cis2026.html` (CI-CO2 2026: 216 €, slope 0.0054)  
- ACD — CIP 2025/2026: impotsdirects.public.lu/fr/az/c/CIP/cip2025.html  
- ACD — CIM 2025+: impotsdirects.public.lu/fr/az/c/cim/cim2025.html (€3,504 / €60,000 / 0.0612 / €750; refundable; allocation test €2,712)  
- ACD — Classes résidents / imposition individuelle / partenariat: impotsdirects.public.lu/fr/az/c/class_resid.html  
- ACD — Modération enfant / bonification: impotsdirects.public.lu/fr/az/m/moder_enfant.html; /fr/az/b/bonif_enfant.html  
- ACD — Abattement enfant hors ménage (€5,424 from AY 2025): impotsdirects.public.lu/fr/az/a/abat-enf-hors-menage.html  
- Note de service L.I.R. n° 119/2 (EU officials)  
- Circulaire 154quater/1 du 12 mars 2025 (CIS annualisation; PDF fetch failed — pin before production)  
- ACD — FFO / FDS: impotsdirects.public.lu/fr/az/f/ffo-fds.html (540/300; 480)  
- ACD — Abattement extra-professionnel: impotsdirects.public.lu/fr/az/a/abat_extrapro.html (€4,500) — **Art. 129b, not 110bis**
- ACD — CII 2025/2026: impotsdirects.public.lu/fr/az/c/CII/credit-indep-2025.html
- ACD — Splitting (RIA €100k → €14,682): impotsdirects.public.lu/fr/az/s/splitting.html
- ACD — Classes résidents / imposition individuelle / partenariat: impotsdirects.public.lu/fr/az/c/class_resid.html
- Circulaires L.I.R. 3/1, 3ter/1, 3ter/2 du 24.05.2023
- CCSS paramètres / indépendants / conjoint-aidant: ccss.public.lu
- PFI TVA SME FAQ (€50,000): pfi.public.lu/dam-assets/pdf/tva/sme/faq-fr.pdf  
- ACD — Prévoyance-vieillesse Art. 111bis: impotsdirects.public.lu/fr/az/p/prevoyance_vieillesse.html (€3,200 → €4,500)  
- ACD — Vente d’immeuble / Art. 102bis résidence principale  
- Legilux — LIR (loi modifiée du 4 décembre 1967)  
- Ministère des Finances — Nouveautés 2026 (29.12.2025): AMVP €9,000; 111bis €4,500; CI-CO2 €216; start-up credit 20%/€100k; bonification €922.50; Defence Bond  
- PwC Worldwide Tax Summaries — Luxembourg individual PIT (reviewed 03.08.2026): official 2025 bracket table  
- taxx.lu Guide de la déclaration (13.02.2026): Class 1 2025 table, 7%/9% fonds pour l’emploi  
- Guide des Impôts 2025 (guidedesimpots.lu): AEP, 672 Art. 111, 111bis €3,200, épargne-logement, charges forfaitaires €5,400, CIM 2024 vs 2025 formulas, invalidity FFO  

*This document is a technical audit, not tax advice. Before each release, re-validate amounts against the ACD barème and Mémorial for the target tax year — including the 2026 CI-CO2 slope, the official Class 1a table, Art. 129b AEP, and the CIC 2026 / épargne-logement 8775 items flagged 待证.*

**Companion research notes (same date, more detail):**
- `research/mixed-professional-income-2025-2026.md` — salarié + indépendant, CII, CCSS, TVA, AEP 129b
- `research/class2-vs-art3ter-2025-2026.md` — Class 2 vs Art. 3ter, PACS, CIM trade-off, Art. 48
- `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` — legal optimisation catalog with app flags
- `docs/lir-118-121-bareme-2025-2026.md` — official scale, Art. 120bis, golden values
- `lux-deductions-2025-2026-research.md` — FO/DS/CE architecture, owner-occupier Art. 98 n°5
- `research-filing-2025-2026.md` — Form 100 sheets, assiette, 7 April 2026 window
- `research/2025-2026-lu-tax-credits-and-classes.md` — CIS/CIP/CIM/CI-CO2, classes
- `luxembourg-resident-tax-research.md` — capital, rental, foreign, pensions, freelance
