# Luxembourg resident tax credits and tax classes — 2025 / 2026

**Task:** audit facts for the Luxembourg personal-tax app  
**Scope:** residents, tax years 2025 and 2026 (2025 returns filed in 2026)  
**Sources:** ACD / impotsdirects.public.lu, L.I.R. texte coordonné (1 Jan 2025, actualisé 02/02/2026), Legilux, note de service L.I.R./N.S. n° 119/2  
**Date of research:** 8 November 2026  
**Overall confidence:** high for CIS, CIP, CIM, CI-CO2, tax classes, PACS, 65+, and withholding mechanics (primary law + ACD). Medium for EU-official CIS edge cases (protocol interaction). No official “CIAC” or “crédit d’impôt Union européenne” exists as a named credit.

---

## 1. Conclusion summary

1. **CIS is a per-person annual tax credit**, not a household credit. The 2025 and 2026 formulas are identical: a build-up from 300 € to 600 €, a plateau at 600 €, then a linear phase-out to zero at 80 000 € gross salary. It is granted once for all salaries of the same taxpayer and cannot be combined with CIP or CII. [L.I.R. art. 154quater](https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2025.html) — **确定**.

2. **CIM was reformed as of AY 2025** and is no longer a flat 750 €. It is now 3 504 € below 60 000 € adjusted taxable income, linearly reduced to 750 € between 60 000 € and 105 000 €, and 750 € above 105 000 €. It is class-1a only, on request, and refundable to the extent it exceeds the tax due. [L.I.R. art. 154ter; ACD CIM 2025](https://impotsdirects.public.lu/fr/az/c/cim/cim2025.html) — **确定**.

3. **There is no Luxembourg credit called “CIAC”.** The child benefit is the *modération d’impôt pour enfant* (art. 122 L.I.R.), normally paid through family allowance / CEDIES / SNJ, plus a *dégrèvement* of **922.50 €** (not refundable) when no other form was paid, plus a later *bonification d’impôt* (art. 123bis) after the modération expires. — **确定**.

4. **There is no named “crédit d’impôt Union européenne”.** EU officials and their spouses are a **class / filing-mode problem**, not a separate credit. CIS still applies if Luxembourg has the right to tax the salary, and the CIS base includes salary exempt under art. 134 L.I.R. [Note de service 119/2](https://impotsdirects.public.lu/dam-assets/fr/legislation/legi18/LIRNS119-2du06122018.pdf) — **高置信**.

5. **Tax classes 1 / 1a / 2** are defined in art. 119 L.I.R. Married residents are **collectively taxed by default (class 2)**; individual taxation is an optional joint election. Partners are **class 1 (or 1a) by default**; class 2 only on joint request. **65+** means class 1a if the taxpayer has completed their 64th year at the start of the tax year (i.e. is 65 on 1 January). [L.I.R. art. 119, 3, 3bis, 3ter; ACD classes résidents](https://impotsdirects.public.lu/fr/az/c/class_resid.html) — **确定**.

6. **CIS / CIP / CIM are advanced through the retenue d’impôt** on the fiche de retenue. The employer subtracts the credit from the barème tax; if the credit exceeds the withholding, the excess is **paid to the employee**. CIS and CIP do **not** re-enter the ordinary décompte annuel; CIM **can** be claimed there. [ACD retenue / crédits](https://impotsdirects.public.lu/fr/az/d/Declaration_de_la_retenue_dimpot.html) — **确定**.

---

## 2. Findings

### 2.1 CIS — crédit d’impôt salarié (and CI-CO2 salarié)

**Legal basis:** art. 154quater L.I.R. (ex art. 139bis for the old 300 € flat credit — that flat 300 € rule is obsolete).  
**ACD pages:**
- AY 2025: <https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2025.html>
- AY 2026: <https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2026.html>

#### Formula (identical for 2025 and 2026)

Base = **annual gross salary, including salary exempt under art. 134 L.I.R.**

| Annual gross salary | CIS |
|---|---|
| < 936 € (or < 78 €/month or < 3.12 €/day) | **0** — not granted |
| 936 € to 11 265 € | **300 + (salaire brut − 936) × 0.029** €/year |
| 11 266 € to 40 000 € | **600** €/year |
| 40 001 € to 79 999 € | **600 − (salaire brut − 40 000) × 0.015** €/year |
| ≥ 80 000 € (6 667 €/month or 267 €/day) | **0** — not granted |

Worked checks (not in the source, arithmetic only):
- At 11 265 €: 300 + (11 265 − 936) × 0.029 = 300 + 299.581 = **599.58 €** (rounds to the plateau).
- At 40 000 €: 600 €.
- At 79 999 €: 600 − 39 999 × 0.015 = 600 − 599.985 = **0.015 €** (then rounds up to 0.02 € if using cent-up rounding on the credit; the credit is effectively zero at 80 000 €).

**Rounding (L.I.R. art. 154quater al. 2):**  
Monthly amount = annual / 12. Daily amount = annual / **300** (not 365). Annual, monthly and daily amounts are **rounded up to the next cent (0.01 €)**.  
The circular L.I.R. n° 154quater/1 du 12 mars 2025 additionally says the annual gross used for the scale is rounded **down** to the next whole euro.

**Per person or per household?**  
**Per person.** Quote, art. 154quater al. 1:

> « Le CIS et le CI-CO2 salarié n’entrent qu’une seule fois en ligne de compte pour l’ensemble des salaires alloués au salarié. »

Two working spouses therefore each get their own CIS. ACD confirms two fiches: CIS on the first spouse’s main fiche and on the second spouse’s first additional fiche. [ACD retenue §3.4](https://impotsdirects.public.lu/fr/az/d/Declaration_de_la_retenue_dimpot.html)

**Non-cumul:** cannot be combined with CII / CI-CO2 indépendant (art. 152ter) or CIP / CI-CO2 pensionné (art. 154quinquies). If the taxpayer has mixed salary + pension + independent income, regularization happens in the décompte annuel or imposition par voie d’assiette.

**Other conditions:**
- Luxembourg must have the right of taxation on the salary (art. 95 or 95a).
- The taxpayer must be **personally affiliated** as an obligatory insured under a LU or bilateral/multilateral social-security scheme for that salary.
- Credit is limited to the period of salaried activity.
- Exception (al. 2a): temporary-work contracts under art. 137 al. 5a may allow more than one CIS per month, counted on the monthly total of those contracts.

**CI-CO2 salarié (same article, same salary base):**

| Annual gross | AY 2025 | AY 2026 |
|---|---|---|
| 936 – 40 000 € | **192 €** | **216 €** |
| 40 001 – 79 999 € | 192 − (brut − 40 000) × **0.0048** | 216 − (brut − 40 000) × **0.0054** |
| ≥ 80 000 € or < 936 € | 0 | 0 |

**2025 vs 2026:** CIS scale unchanged. CI-CO2 was increased from 192 € / 0.0048 to 216 € / 0.0054. The L.I.R. texte coordonné “en vigueur au 1er janvier 2025” still shows 192 €; the ACD 2026 page is the controlling ACD source for 2026. Implement **year-dependent CI-CO2**.

**EU / art. 134 exempt salary:** the CIS base **includes** salary exempt under art. 134 (foreign-source exemption for residents). It does **not** automatically include Protocol-exempt EU-official salaries unless Luxembourg has the right of taxation — see §2.5.

---

### 2.2 CIM — crédit d’impôt monoparental

**Legal basis:** art. 154ter L.I.R. (modified by loi du 20 décembre 2024).  
**ACD page:** <https://impotsdirects.public.lu/fr/az/c/cim/cim2025.html>  
**Who:** residents and assimilated non-residents in **class 1a**, on request, with at least one child in the household that triggers a modération d’impôt pour enfant.

#### Formula (from AY 2025; no separate 2026 ACD page, so 2026 uses the same scale)

Let `RIA` = revenu imposable ajusté.

| RIA | CIM |
|---|---|
| < 60 000 € | **3 504 €** |
| 60 000 € to 105 000 € | **3 504 − (RIA − 60 000) × 0.0612** |
| > 105 000 € | **750 €** |

At RIA = 105 000: 3 504 − 45 000 × 0.0612 = 3 504 − 2 754 = **750 €** (continuous).

**Not a function of the number of children.**

**Pro-rata:** if the taxpayer was not subject to tax all year, the **maximum** CIM is prorated over whole months of assujettissement.

**Refundable:** art. 154ter al. 2 — « Le crédit d’impôt monoparental est restituable au contribuable dans la mesure où il dépasse la créance d’impôt. » ACD confirms: if the cote is lower than CIM, the excess is paid back.

**Reduction for child allocations:** CIM is reduced by **50 %** of allocations of any kind paid to/for the child to the extent they exceed **2 712 €/year or 226 €/month**. Allocations = maintenance, education/training payments, etc. **Excluded:** orphan pensions and family allowances (allocations familiales). If several children have allocations, use the **smallest** per-child allocation to compute the reduction.

**Who is excluded:**
- Married persons, even if not collectively taxed.
- Persons who marry during the year.
- Partners who request collective taxation, and anyone in class 2.
- **Both parents sharing a common home with the child** (since 2017) — no CIM.
- Non-residents assimilated under art. 157ter may claim CIM **only** via imposition par voie d’assiette (modèle 100), deadline 31 December of N+1.

**Old vs new (app must not use the old number):** before 2025 CIM was a flat **750 €** (and the ACD “Déclaration de la retenue” page still recites the 2009 text of 750 € / 1 920 € allocation threshold — **do not implement that page’s CIM figures**). Current law is 3 504 / 750 with the 2 712 € allocation test.

---

### 2.3 Child credit — “CIAC” / modération / bonification

There is **no official acronym CIAC** in L.I.R. or on ACD. Map the user request to the three child mechanisms below.

#### A. Modération d’impôt pour enfant — art. 122 L.I.R.

**Forms (art. 122):**
1. Family allowance (Zukunftskeess / CAE) — the tax moderation is **built into** the allowance.
2. State aid for higher education (CEDIES).
3. Volunteer aid (SNJ).
4. If **none** of 1–3 was paid: **dégrèvement fiscal on request**, **922.50 € per child**, imputed **only up to the tax due** — **not refundable**.

Class 1a is acquired with the first payment of any form of modération. Children in résidence alternée: only one household gets the modération for a given year.

#### B. Bonification d’impôt pour enfant — art. 123bis L.I.R.

**When:** the child’s modération right expired at the end of one of the **two years preceding** the tax year (studies finished, etc.). Always granted after year-end. Same child can generate **at most two** bonifications. Cannot cumulate bonification and modération for the same child in the same year.

**Amount:** same as the modération, max **922.50 €/child/year**.

**Phase-out (≤ 5 children):** if RIA is between **67 400 € and 76 600 €**, bonification = **(76 600 − RIA) / 10**. Above 76 600 €: zero.  
Worked example from ACD: RIA 71 000 € → (76 600 − 71 000) / 10 = **560 €**.  
If the taxpayer has **six or more** children (modération + bonification), the income cap is lifted.

**Résidence alternée transitional rule:** for AY **2025 and 2026** only, a parent may claim bonification for a child not in the household if the child lives alternately with both parents who jointly exercise parental authority and both receive the family allowance (art. 123bis al. 1a).

**ACD page:** <https://impotsdirects.public.lu/fr/az/b/bonif_enfant.html>

#### C. Related deduction, not a credit

Abattement for children **not** in the household but mainly at the taxpayer’s expense: actual costs, capped at **5 424 €/child/year from AY 2025** (4 422 € in 2023–2024). This is a **revenue deduction**, not a tax credit.  
<https://impotsdirects.public.lu/fr/az/a/abat-enf-hors-menage.html>

Childcare costs (frais de garde) are likewise **dépenses spéciales / abattement**, not a crédit d’impôt.

---

### 2.4 CIP — crédit d’impôt pour pensionnés (65+ / pensioners)

**Legal basis:** art. 154quinquies L.I.R.  
**ACD:** <https://impotsdirects.public.lu/fr/az/c/CIP/cip2025.html> and `.../cip2026.html`

Granted once for all pensions/rentes of art. 96 al. 1 n° 1–2 where Luxembourg has the right of taxation, including pensions exempt under art. 134. Cannot be combined with CIS or CII. Same social-security affiliation condition.

**CIP scale (2025 and 2026 identical):**

| Pension / rente brute (incl. art. 134 exempt) | CIP |
|---|---|
| < 300 €/year (25 €/month, 1 €/day) | 0 |
| 300 – 935 € | **300 €** |
| 936 – 11 265 € | **300 + (pension − 936) × 0.029** |
| 11 266 – 40 000 € | **600 €** |
| 40 001 – 79 999 € | **600 − (pension − 40 000) × 0.015** |
| ≥ 80 000 € | 0 |

**CI-CO2 pensionné:** same 192 € (2025) / 216 € (2026) switch as the salarié version, on the 300–79 999 € pension base.

Monthly = annual / 12; daily = annual / 300; round **up** to the cent.

---

### 2.5 Other credits, including “via Union européenne”

**No credit is named “crédit d’impôt Union européenne” or similar.** What exists:

#### a) EU officials and their spouses — filing / class, not a credit

Source: Note de service L.I.R./N.S. n° 119/2 du 6 décembre 2018.  
<https://impotsdirects.public.lu/dam-assets/fr/legislation/legi18/LIRNS119-2du06122018.pdf>

- EU official **domiciled in Luxembourg** → resident taxpayer. EU salary is exempt, **other** income is taxable. Married to a resident spouse → **splitting / class 2** by default. Individual taxation possible under art. 3ter.
- EU official who **kept fiscal domicile in another EU state** (Protocol art. 13) and is married to a **Luxembourg resident who works**:
  - **Default: separate taxation.** The resident spouse is class **1 or 1a** (1a if children). CIM is **not** granted if both parents share a home with the child.
  - **Exception: collective taxation on joint request** under art. 3 lettre d), if the resident spouse realizes **≥ 90 % of the household’s professional income in Luxembourg**. **EU exempt salary is not counted** in that 90 % test.
- Both spouses non-resident in a neighbouring country: ordinary non-resident rules; assimilation under art. 157ter possible.

#### b) CIS and exempt salaries

Art. 154quater includes “salaire exonéré suivant l’article 134” in the CIS base. Art. 134 is the **resident** foreign-income exemption, not the EU Protocol. For an EU official, CIS applies only if Luxembourg has the right of taxation on a qualifying salary (e.g. local Luxembourg employment besides the EU job). **Do not** grant CIS solely because the person is a Luxembourg-resident EU official with a Protocol-exempt EU salary.

#### c) Other real credits (residents)

| Credit | Article | Notes |
|---|---|---|
| CIS + CI-CO2 salarié | 154quater | see §2.1 |
| CIP + CI-CO2 pensionné | 154quinquies | see §2.4 |
| CII + CI-CO2 indépendant | 152ter | same family of scales; not requested here |
| CIM | 154ter | see §2.2 |
| Modération / bonification enfant | 122 / 123bis | see §2.3 |
| Crédit d’impôt heures supplémentaires | 154terdecies | **frontaliers**, from 2025; not a resident CIS substitute |

Assurance, domestic-help, childcare, interest: these are **art. 111 dépenses spéciales / abattements**, not crédits d’impôt. Do not model them as credits.

**Upcoming, out of 2025/2026 scope:** Resilienzpak / projet de loi 8775 talks about CISSM (salaire social minimum credit) increasing from 81 € to 179 € **from 1 January 2027**, and a temporary *crédit d’impôt conjoncture*. Not a 2025/2026 resident rule.

---

### 2.6 Interaction with retenue d’impôt (CIS / CIP / CIM)

Source: ACD, *Déclaration de la retenue d’impôt et des crédits d’impôt bonifiés*.  
<https://impotsdirects.public.lu/fr/az/d/Declaration_de_la_retenue_dimpot.html>

**Payroll sequence (employer / caisse de pension):**

1. Compute RTS from the barème or from the rate on the fiche de retenue.
2. If the fiche shows CIS and/or CIM, impute the **fraction of the credit for the pay period** against that withholding.
3. Tax to withhold = withholding − credit fraction.
   - If withholding < credit → **employer pays the excess to the employee**.
   - If withholding = 0 → **entire credit is paid to the employee**.
4. Net-pay agreements: if salary is agreed net of tax and social security, the credit is still added on top.
5. Model **950 FD**: the declaration includes both tax withheld **and** credits granted. The amount due to the recette = withheld − credits, and **may be negative** (employer then claims a refund).

**Fiche de retenue:** credits appear as monthly and daily amounts on the front; the payslip extract (verso cases 8–10) reports CIS / CIP / CIM actually paid. No inscription on the fiche → employer **must not** grant the credit.

**Who inscribes the CIS:** commune (residents) or RTS-NR (non-residents). With several jobs: CIS only on the **principal** fiche. With salary + pension: CIS on the salary fiche, CIP on the pension fiche **during the year**, then **regularized** because the law forbids cumul.

**Year-end:**
- **CIS and CIP do not enter** the ordinary décompte annuel (modèle 163) or the imposition par voie d’assiette, except the mixed-income regularization above and prior-year corrections.
- **CIM** that was not (fully) paid during the year can be claimed in a décompte annuel **or** in an imposition par voie d’assiette.
- Child dégrèvement / bonification are **always after year-end** (modèle 100 or 163).

**Legal payment timing:** CIS/CI-CO2 are paid by the employer **during** the tax year they relate to (art. 154quater al. 2).

---

### 2.7 Tax classes — who is 1, 1a, 2

**Legal basis:** art. 119 L.I.R.  
**ACD:** <https://impotsdirects.public.lu/fr/az/c/class_resid.html>

#### Class 1
Anyone who is not class 1a and not class 2.

#### Class 1a — if not in class 2
a) widows / widowers;  
b) persons who receive a modération d’impôt pour enfant (art. 122 / 123);  
c) persons who **have completed their 64th year at the beginning of the tax year** (= **65 years old on 1 January** of the tax year).

Turning 65 later in the year does **not** give 1a for that year.

#### Class 2
a) persons collectively taxed under art. 3 or 3bis (married couples and partners who elected collective taxation);  
b) widows/widowers whose marriage ended by death in the **3 preceding years**;  
c) divorced / legally or factually separated persons (dispense de la loi ou de l’autorité judiciaire) in the **3 preceding years**, provided they did not already benefit from this transitional rule (or a similar earlier one) for five years before that event.

#### Resident summary table (ACD)

| Situation | No child | Child(ren) with modération | 65+ on 1 Jan |
|---|---|---|---|
| Célibataire | 1 | 1a | 1a |
| Married, collective | 2 | 2 | 2 |
| Married, individual (pure or with reallocation) | 1 | 1 | 1 |
| Married, one resident + one non-resident (default) | 1 | 1a | 1a |
| Same, collective on joint request if resident spouse has ≥ 90 % of household professional income in LU | 2 | 2 | 2 |
| Partners, collective on joint request (common home + partnership all year) | 2 | 2 | 2 |
| Partners, individual with reallocation | 1 | 1 | 1 |
| Partners, no collective request | 1 | 1a | 1a |
| Divorced / separated (outside the 3-year transition) | 1 | 1a | 1a |
| Divorced / separated **within** the 3-year transition | 2 | 2 | 2 |
| Veuf / veuve | 1a | 1a | 1a |
| Veuf / veuve **within** 3-year transition | 2 | 2 | 2 |

Widows/widowers in a Luxembourg or foreign partnership remain **1a**.

#### Class 2 arithmetic (art. 121)
Tax = **2 ×** tariff applied to **half** of the adjusted taxable income (splitting).

#### Class 1a arithmetic (art. 120bis) — this is the 65+ / single-parent tax advantage
Tariff is applied to a reduced base:

> revenu imposable ajusté **réduit d’un quart de son complément à 79 380 €**

i.e. base = RIA − (79 380 − RIA) / 4, for RIA < 79 380. Additional caps: maximum marginal rate 39 % on 51 804–117 450 €, then 40 / 41 / 42 % on the following brackets.

This is why class 1a is more favourable than class 1, independent of CIS/CIM.

**Planned reform (do not implement for 2025/2026):** replacement of classes 1 / 1a / 2 by a single class « U » is announced for **2028**.

---

### 2.8 Joint filing: mandatory vs optional; marriage; PACS

#### Married residents — collective is the **default (mandatory unless they jointly opt out)**

Art. 3 L.I.R. — collectively taxed:

- a) spouses who are residents at the **start** of the tax year and not de facto separated;
- b) persons who **marry during** the tax year;
- c) spouses who **become residents during** the year and are not de facto separated;
- d) **on joint request only:** one resident + one non-resident, not de facto separated, and the resident spouse realizes **≥ 90 %** of household professional income in Luxembourg.

Art. 3ter — **optional individual taxation since 2018**, **joint and irrevocable** request, deadline **31 December of N+1**:

- **Individual pure:** each spouse taxed on own RIA, **class 1** each.
- **Individual with reallocation:** first compute joint RIA, then split (default 50/50, other split allowed), each taxed in **class 1**.

If the spouses disagree, individual taxation is excluded. The request can still be changed until 31 December N+1.

**So:** joint filing is **not optional** for married residents unless both spouses make the art. 3ter election. You cannot file separately by simply “not checking a box” — it is an affirmative joint election that also forces imposition par voie d’assiette (modèle 100).

#### Partners (PACS / partnership) — separate by default, collective optional

Art. 3bis + ACD partenariat page.  
<https://impotsdirects.public.lu/fr/az/p/partenariat.html>

- During the year: partners are **two distinct households**, class **1** (or **1a** if a child with modération is in the household). Fiches de retenue are **not** changed by the partnership; class 2 may **not** be put on the fiche merely because they intend to ask for collective taxation later.
- **Collective taxation (class 2) only on joint request**, if:
  - common domicile/residence **for the whole tax year**, and
  - the partnership existed from **1 January to 31 December**.
  - Non-residents additionally need art. 157ter (or BE convention art. 24 §4).
- The joint request **forces imposition par voie d’assiette**.
- **No “individual pure” option** for partners (unlike spouses). They may opt for **individual with reallocation** (art. 3ter al. 3). Without any request, they are taxed separately on their own income.
- Recognised foreign partnerships: French PACS, Belgian cohabitation légale, German Eingetragene Lebenspartnerschaft (until 30 Sep 2017), or any foreign partnership recorded in a foreign register. Luxembourg partnership is proved by the parquet général certificate on first joint request.

**CIM and PACS:** partners who request collective taxation lose CIM. Partners who stay separate keep class 1a and can claim CIM if the other conditions are met.

#### Divorced / separated
Ordinary: class 1 / 1a. **Transitional class 2** for 3 years after divorce or separation (see §2.7).

---

### 2.9 65+ rules (recap)

1. **Class 1a** if the person has completed the 64th year at the start of the tax year (art. 119 n° 2 lettre c). This is the main “65+” tax rule. It uses the art. 120bis reduced base.
2. **CIP / CI-CO2 pensionné** if the person has a qualifying pension/rente — independent of class, but not cumulable with CIS.
3. No separate “senior tax credit” exists in L.I.R.
4. Class 1a already covers widows, single parents, and 65+; a 65-year-old single parent is still just 1a (not a fourth class).

---

## 3. Implementation notes for the app (audit hooks)

| Item | Rule the engine must implement | Common wrong implementation |
|---|---|---|
| CIS unit | Once **per taxpayer**, on all salaries combined | Granting CIS per employer or per household |
| CIS 2025 vs 2026 | Same CIS scale; **CI-CO2 192 → 216** | Hard-coding 192 for both years |
| CIS floor / cap | 936 € / 80 000 € annual gross, **including art. 134 exempt salary** | Using net salary or forgetting exempt salary |
| CIS daily divisor | **300** | Using 365 or 360 |
| CIS rounding | Credit **ceil to 0.01**; circular: annual gross **floor to 1 €** | Banker’s rounding |
| CIS vs CIP vs CII | Mutually exclusive; mixed income → year-end regularization | Adding CIS + CIP |
| CIM 2025+ | 3 504 € / linear 0.0612 / 750 € floor; refundable; allocation test **2 712 €** | Flat 750 €; treating as non-refundable; old 1 920 € test |
| CIM eligibility | Class **1a** + modération + not common home + not class 2 | Granting to married filers |
| Child “credit” | 922.50 € dégrèvement **not refundable**; bonification after expiry | Inventing “CIAC”; making 922.50 € refundable |
| Class 1a 65+ | Completed 64th year **on 1 Jan** | Any birthday during the year |
| Married default | Class 2 collective | Defaulting to two class-1 returns |
| Partner default | Class 1 / 1a separate | Putting class 2 on the fiche because of PACS |
| Class 2 tax | 2 × tax(half RIA) | Tax(RIA) at class-1 rates |
| Withholding | RTS − period credit; negative RTS → pay employee | Treating CIS as a year-end only offset |
| 950 FD | Withheld − credits may be negative | Clamping at zero |

---

## 4. Source list (all accessed 8 Nov 2026)

| Topic | URL | Type |
|---|---|---|
| CIS 2025 | <https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2025.html> | ACD A-Z |
| CIS 2026 | <https://impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2026.html> | ACD A-Z |
| CIP 2025 | <https://impotsdirects.public.lu/fr/az/c/CIP/cip2025.html> | ACD A-Z |
| CIP 2026 | <https://impotsdirects.public.lu/fr/az/c/CIP/cip2026.html> | ACD A-Z |
| CIM 2025+ | <https://impotsdirects.public.lu/fr/az/c/cim/cim2025.html> | ACD A-Z |
| Modération enfant | <https://impotsdirects.public.lu/fr/az/m/moder_enfant.html> | ACD A-Z |
| Bonification enfant | <https://impotsdirects.public.lu/fr/az/b/bonif_enfant.html> | ACD A-Z |
| Abattement enfant hors ménage | <https://impotsdirects.public.lu/fr/az/a/abat-enf-hors-menage.html> | ACD A-Z |
| Classes résidents | <https://impotsdirects.public.lu/fr/az/c/class_resid.html> | ACD A-Z |
| Imposition individuelle | <https://impotsdirects.public.lu/fr/az/i/imposition-individuelle.html> | ACD A-Z |
| Partenariat | <https://impotsdirects.public.lu/fr/az/p/partenariat.html> | ACD A-Z |
| Retenue + crédits (950 FD, fiche) | <https://impotsdirects.public.lu/fr/az/d/Declaration_de_la_retenue_dimpot.html> | ACD A-Z |
| Barèmes (Mémorial A 590 / 2024) | <https://impotsdirects.public.lu/fr/baremes.html> | ACD |
| L.I.R. texte coordonné 01.01.2025 (PDF local: `.tmp-lir/lir2025.pdf`) | art. 3, 3bis, 3ter, 119–123bis, 154ter/quater/quinquies | Statute |
| EU officials | <https://impotsdirects.public.lu/dam-assets/fr/legislation/legi18/LIRNS119-2du06122018.pdf> | Note de service 119/2 |
| Circulaire CIS 12.03.2025 | <https://impotsdirects.public.lu/dam-assets/fr/legislation/legi25/lir-154quater-1-du-1232025.pdf> | Circular (fetch failed; existence confirmed via search) |

**Unverified / to watch:**
- Exact 2026 legal instrument that raised CI-CO2 from 192 € to 216 € (likely loi du 19 décembre 2025, Mémorial A 2025 n° 614, which already appears in art. 115/13a, 123bis and 157 notes). ACD 2026 pages are sufficient to implement, but the Mémorial text should be pinned before a production release.
- Full text of circulaire 154quater/1 (12 March 2025) for annualisation of mid-year hires (the PDF did not fetch). Local copy in `.tmp-lir/` covers the 2025 statute.
