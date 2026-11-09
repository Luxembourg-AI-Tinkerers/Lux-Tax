# Luxembourg resident deductions 2025/2026 — research notes for tax-app audit

Audience: audit of a Luxembourg personal-income-tax app against resident law for AY 2025 (filed 2026) and AY 2026.
Date of research: 8 November 2026.
Primary sources: LIR texte coordonné 1.1.2026 (actualisé 08.05.2026), ACD A–Z, ACD circulaires, gouvernement.lu / mfin.gouvernement.lu, Chambre des salariés (April 2025).

Confidence labels: **确定** = primary law or ACD A–Z/circular; **高置信** = official political document or ACD page read against law; **低置信 / 待证** = secondary source only.

---

## 0. Framing error to fix first: "Art 102 LIR" is NOT frais d'obtention

The task refers to "frais d'obtention (Art 102 LIR)" and "mortgages/interest Art 102/111". That numbering is wrong for the current LIR.

- **Art. 102 LIR** regulates the **prix d'acquisition / plus-values** (articles 99bis à 101). Alinéa 8 was **supprimé** by article 18 of the loi du 22 mai 2024 (paquet logement). It was the old plus-value remploi rule, not mortgage interest.  
  Source: LIR 2026, p. 143–145, Art. 102 al. 8: "Supprimé par l'article 18 de la loi du 22 mai 2024…".  
  https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2026-ver-08052026.pdf
- **Frais d'obtention** live in:
  - **Art. 105 LIR** — definition ("dépenses faites directement en vue d'acquérir, d'assurer et de conserver les recettes"), including intérêts débiteurs with a direct economic link to revenus 4–8 of Art. 10.
  - **Art. 105bis LIR** — forfait frais de déplacement domicile–travail.
  - **Art. 107 LIR** — minimum forfaitaire 540 / 300 / 25 €.
- **Owner-occupier housing** is a **valeur locative** under **Art. 98 al. 1 n° 5 LIR**; the related interest is **frais d'obtention of that category** (Art. 105), **not** a dépense spéciale under Art. 111.

**App implication:** any code path, label or help text that puts salarié forfaits or owner-occupier mortgage interest under "Art 102" is mis-citing the law.

---

## 1. Frais d'obtention — forfaits, actual expenses, professions, special rules

### 1.1 Legal forfaits (Art. 107 LIR) — 确定

Art. 107 al. 1 (LIR 2026, p. 156):

| Category | Annual forfait | Monthly prorata (al. 2) |
|---|---|---|
| Revenus d'une occupation salariée (hors frais de déplacement) | **540 €** | 45 € |
| Pensions ou rentes | **300 €** | 25 € |
| Capitaux mobiliers | **25 €** | 2 € |

Rules that the app must implement:

- Partial year: reduce to the monthly amount × full months of assujettissement (al. 2).
- Cumul of categories: forfait granted **for each category** (al. 3).
- Époux imposés collectivement (Art. 3): amounts **doubled** if **each** spouse has income of that type (al. 4). Exception: they may **cumulate the forfait of one with actual frais of the other** (al. 4, second sentence).
- Salarié forfait cannot exceed recettes **after** subtracting the frais de déplacement forfait (al. 5). Pension/capitaux forfaits cannot exceed recettes of that category.
- Art. 107 al. 7 allows an RGD to create "forfaits spéciaux" for categories with high normal frais. **No current ACD A–Z special forfait exists for journalists, VRP, etc.** The only majoré forfait still published is the invalides/handicapés table (§1.3). An old Note de service 95/3 (21.02.2003) on "forfaits spéciaux" is not reflected in current ACD salarié pages; do not invent profession-specific forfaits.

Sources:
- LIR 2026 Art. 107, p. 156.
- ACD A–Z Frais d'obtention dans le chef du salarié: https://impotsdirects.public.lu/fr/az/f/frais_salar.html
- ACD A–Z FFO/FDS: https://impotsdirects.public.lu/fr/az/f/ffo-fds.html (FFO 540 € / 300 €; FDS 480 €; inscrites d'office sur la fiche de retenue since AY 2021).

### 1.2 Actual expenses vs forfait — 确定

- The 540 € (or 300 €) is a **minimum**. If actual frais d'obtention (cotisations syndicales, vêtements typiquement professionnels, littérature professionnelle, etc.) exceed the forfait, the taxpayer claims the higher actual amount (demande en rectification / régularisation).
- ACD wording: "Chaque salarié bénéficie d'office du minimum forfaitaire de 540 € par année d'imposition… Dans le cas où les frais d'obtention effectifs dépassent ce minimum forfaitaire, le salarié peut introduire une demande rectification ou en régularisation."
- Independants / professions libérales / commerçants: **no 540 € forfait**. They deduct **frais d'exploitation / frais d'obtention réels** in the bénéfice (Art. 101 / 103–105). Do not grant 540 € to indépendants.

### 1.3 Forfait majoré invalides et handicapés — 确定

ACD A–Z frais_salar (code FO). Applies to mutilés de guerre, accidentés du travail with periodic indemnity, physically/mentally handicapped (≥1 year), maladie professionnelle, and people with central vision ≤1/20 or impotence.

**a)–d) degrees of reduced working capacity** (replaces, not adds to, the 540 €):

| Taux de réduction de la capacité de travail | Forfait annuel majoré | Forfait normal | Déduction fiche RTS |
|---|---|---|---|
| 25 % à 35 % exclusivement | 645 € | 540 € | 105 € |
| 35 % à 45 % exclusivement | 675 € | 540 € | 135 € |
| 45 % à 55 % exclusivement | 780 € | 540 € | 240 € |
| 55 % à 65 % exclusivement | 825 € | 540 € | 285 € |
| 65 % à 75 % exclusivement | 885 € | 540 € | 345 € |
| 75 % à 85 % exclusivement | 930 € | 540 € | 390 € |
| 85 % à 95 % exclusivement | 960 € | 540 € | 420 € |
| 95 % à 100 % inclusivement | 1.020 € | 540 € | 480 € |

**e) vision / impotence:** forfait majoré **1.515 €** (normal 540 €; fiche RTS 975 €).

Source: https://impotsdirects.public.lu/fr/az/f/frais_salar.html

### 1.4 Frais de déplacement forfaitaires (Art. 105bis) — 确定

- **99 €** per unité d'éloignement.
- First **4 units not taken into account**.
- Maximum **26 units = 2.574 €** per year.
- Independent of means of transport. Covers all domicile–work commuting costs.
- Granted to **each** spouse if both are salariés (al. 4).
- Cannot exceed recettes (al. 5).
- Partial year: 1/12 per full month.
- Non-residents: analogie via arrêté ministériel 15.11.2005 (border commune + entry point).

Source: LIR 2026 Art. 105bis, p. 153–154; ACD frais_salar.

### 1.5 FFO on the fiche de retenue — 确定

Since AY 2021 the fiche de retenue shows **FFO** (540 € salarié / 300 € pensionné) and **FDS** (480 €) separately from **FO** / **DS** (the excess). No taxpayer request is needed; inscription is d'office.

Abattement conjoint « AC » on the 1ère fiche additionnelle = **5.520 €** = 540 + 480 + 4.500 (abattement extra-professionnel). FD is separate.

Sources:
- https://impotsdirects.public.lu/fr/az/f/ffo-fds.html
- https://impotsdirects.public.lu/fr/az/a/abat_conjoi.html
- Chambre des salariés, Les salariés et leur déclaration d'impôt, avril 2025, p. 8–9: https://www.csl.lu/app/uploads/2025/04/les-salaries-et-leur-declaration-dimpot_fr.pdf

---

## 2. Dépenses spéciales (Art. 109–113 LIR)

### 2.1 Architecture — 确定

Art. 109 al. 1 — deductible from **total des revenus nets**, if not dépenses d'exploitation, not frais d'obtention, and not linked to revenus exemptés:

1. **n° 1** — arrérages de rentes / charges permanentes (divorce → Art. 109bis, cap **24.000 €** per ex-spouse).
2. **n° 1a** — **intérêts débiteurs** (personal/consumer) **plus** primes Art. 111 al. 1 lettres a) et b): common annual cap **672 €**, +672 for conjoint if Art. 3 collectif, +672 per enfant with modération Art. 122. Prorata if partial year. Exception for soulte successoral loans.
3. **n° 2** — cotisations/primes Art. 110, 111, 111bis, 111ter + retenue pour pension secteur public.
4. **n° 3** — libéralités Art. 112, max **20 %** du total des revenus nets and **1.000.000 €**; excess reportable 2 years.
5. **n° 4** — reports de pertes Art. 114.

Art. 113 — **minimum forfaitaire 480 €** covering Art. 109 al. 1 n° 1 and 1a, Art. 110 n° 4, Art. 111, 111bis, 111ter. **Does not cover** Art. 110 n° 1–3a (obligatory social security, LRCP) or Art. 112 dons.

Sources: LIR 2026 p. 159–170; ACD https://impotsdirects.public.lu/fr/az/d/depens_spe.html

### 2.2 Forfait dépenses spéciales 480 € / 960 € — 确定, **not indexed in 2025 or 2026**

- **480 € per taxpayer** (Art. 113 al. 1), prorata for partial years.
- Époux collectifs who each have salary: forfait = sum of individual forfaits, reduced if the lesser-paid spouse's salary after FO and Art. 110 DS is below 480 € (al. 2). Practical result for a two-earner couple: **960 €**.
- ACD: "Il est déduit d'office un minimum forfaitaire de 480 € par année d'imposition… Le minimum forfaitaire est censé couvrir" the items listed in §2.1.
- If actual DS (in the covered categories) exceed 480 €, deduct the actual (still capped) amounts instead.
- **No 2025 or 2026 indexation** of the 480 € forfait. Still 480 € in the LIR 2026 coordinated text (Art. 113) and on ACD FFO/FDS (updated 12.12.2023, still current) and ACD depens_spe.

The user's "€480/€960 or updated" → **still 480 € / 960 € (couple), unchanged**.

### 2.3 Insurance (Art. 110 vs Art. 111) — 确定

**Art. 110 — social / pension (not in the 672 € envelope, except n° 4 is inside the 480 € forfait):**

| n° | What | Cap |
|---|---|---|
| 1 | Cotisations **obligatoires** salariés (maladie, pension) + obligatory foreign social security | **Unlimited** |
| 2 | Cotisations **obligatoires** non-salariés (maladie, accidents, pension) | **Unlimited** |
| 3 | LRCP employeur, cotisations personnelles du salarié | **1.200 € / year** |
| 3a | LRCP contributions du travailleur indépendant (prestations de retraite) | **20 %** de la somme des revenus nets Art. 10 n° 1–3 (+ salaire Art. 95 n° 6 under conditions) |
| 4 | Assurance continuée, volontaire ou facultative + achat de périodes (maladie, pension), Luxembourg or treaty foreign regime | Unlimited as a legal cap, but **inside the 480 € forfait** (Art. 113) |

**Art. 111 al. 1 a) et b) — private insurance / secours mutuels, inside the 672 € envelope with Art. 109 n° 1a intérêts:**

Risks: **vie, décès, accidents, invalidité, maladie, responsabilité civile**; secours mutuels: maladie, accidents, incapacité, infirmité, chômage, vieillesse, décès.

Excluded (not DS): vol, incendie, bris de glace, casco, etc.

Conditions:
- Assureur agréé au Luxembourg or UE with siège in UE (Art. 111 al. 1).
- Assuré = contribuable, conjoint, partenaire, enfants with modération Art. 122 (al. 2).
- Primes en relation économique avec un prêt: excluded, **unless** contract > 5 years with unchanged premiums, **or** assurance solde restant-dû for a loan to acquire a "bien" (al. 3).
- Assurance-vie with advantages en cas de vie: duration **≥ 10 years**, primes actuarielles (al. 4). Unit-linked: ≥10 years + décès ≥60 % of primes (min 5 annual primes) or ≥130 % of primes paid.
- **Plafond 672 €** shared with personal interest (Art. 109 n° 1a), +672 conjoint if collectif, +672 per enfant modéré. **Unchanged for 2025 and 2026.**

**Majoration / surmajoration for prime unique solde restant-dû** (RGC 7 mars 1969, circulaire LIR 111/1 du 02.11.2017):

- Majoration: prime unique, extra cap max **6.000 € + 1.200 € per enfant modéré**.
- Surmajoration (maison/appartement habitation personnelle, souscripteur > 30 ans): **8 % of the majoration maximale per year of age above 30, max 160 %**.
- Table (sans enfant / 1 / 2 / 3 enfants): 6.000 / 7.200 / 8.400 / 9.600 up to 15.600 / 18.720 / 21.840 / 24.960 (50 ans et plus) + 1.200 € per extra child.
- Indemnité journalière (indépendants without legal compensatory indemnity): majoration of the prime portion, max **1.500 €**.

Sources:
- LIR 2026 Art. 110–111, p. 162–164.
- ACD https://impotsdirects.public.lu/fr/az/c/cotis_prim.html
- Circulaire LIR n° 111/1 du 2 novembre 2017: https://impotsdirects.public.lu/dam-assets/fr/legislation/legi17/lir-111-1-02112017.pdf

### 2.4 Épargne-logement (Art. 111 al. 1 c, al. 5) — 确定

- Caisses d'épargne-logement agréées Luxembourg or UE; contrat d'épargne-logement.
- Funds must be used for: construction/achat/entretien/réparation/transformation of owner-occupied housing (incl. terrain), installation solaire PV/thermique intégrée, remboursement d'obligations for those ends. From AY 2022, ordinary entretien/réparation qualifies (no longer only "dépenses importantes").
- Plafonds (al. 5), **age au 1er janvier**:

| Âge accompli au 1er janvier | Plafond annuel |
|---|---|
| 18 à 40 ans accomplis | **1.344 €** |
| Autres cas | **672 €** |

- Couple: plafond of the **younger adult** applies as the majoré 1.344 € base if imposés collectivement (Art. 111 al. 5: "La détermination du plafond majoré de 1.344 euros est fonction de l'âge du souscripteur adulte le plus jeune").
- + own plafond for conjoint if Art. 3 collectif; + plafond for each enfant modéré.
- **Separate** from the 672 € insurance/interest envelope ("s'appliquent de façon distincte et ne se confondent pas").
- Résiliation < 10 years or mauvaise affectation → imposition rectificative (exceptions: décès, incapacité permanente, > 10 ans).
- **Unchanged 2025/2026.**

Source: LIR 2026 Art. 111 al. 5; ACD https://impotsdirects.public.lu/fr/az/c/cotis-epargne-logement.html

### 2.5 Prévoyance-vieillesse Art. 111bis / 111ter — 确定, **reformed for 2026**

Conditions (both 111bis and PEPP 111ter):
- Compagnie d'assurances or établissement de crédit (or PEPP sous-compte luxembourgeois).
- Remboursement différé **≥ 10 ans**, payable **au plus tôt 60 ans, au plus tard 75 ans**.
- Capital, rente viagère mensuelle, retraits annuels, or combiné.
- Souscription avant la veille du 65e anniversaire (ACD A–Z).
- Anticipation (hors maladie grave / invalidité ≥50 %) → fully taxable.

**Plafond annuel (per person, each spouse calculated individually):**

| AY | Plafond |
|---|---|
| 2017–2025 | **3.200 €** |
| **2026 et suivantes** | **4.500 €** |

LIR 2026 Art. 111bis al. 7 and 111ter al. 7 already state **4.500 euros** (modified by **L.19.12.25,2** — loi du 19 décembre 2025). ACD prévoyance-vieillesse (updated 27.01.2026): "La déduction fiscale annuelle maximale… est de 4 500 euros à partir de l'année d'imposition 2026. Pour les années d'imposition 2017 à 2025… 3 200 euros."

**App implication: AY 2025 returns (filed 2026) use 3.200 €; AY 2026 uses 4.500 €.** Do not apply 4.500 € to 2025.

Old age-tranche table (1.500–3.200 €) applies only to 2002–2016; ignore for 2025/2026.

Sources:
- LIR 2026 Art. 111bis/111ter, p. 165–167.
- ACD https://impotsdirects.public.lu/fr/az/p/prevoyance_vieillesse.html
- mfin.gouvernement.lu Nouveautés 2026 (29.12.2025): "Le plafond de déduction fiscale pour les contrats de prévoyance-vieillesse passera de 3 200 à 4 500 euros par an."

### 2.6 Dons / libéralités Art. 112 — 确定

- Dons **en espèces** to organismes reconnus d'utilité publique, offices sociaux, CHL, ONGD, FNR,-listed établissements, Fonds culturel national (aussi en nature), Fonds audiovisuel, Kultur|lx, SIS, dons UE/AELE similaires, dotation initiale de fondation.
- **Minimum: 120 €** total annual (RGC can fix a minimum; ACD applies 120 €).
- **Max: 20 %** du total des revenus nets **et** **1.000.000 €**.
- Excess reportable on the **two** following AYs, same limits (Art. 109 n° 3).
- **Unchanged 2025/2026.** No 120 € minimum change.

Source: LIR 2026 Art. 112 p. 168–170; ACD https://impotsdirects.public.lu/fr/az/l/libera_dons.html

### 2.7 Childcare and household help — **NOT dépenses spéciales** — 确定

They are **charges extraordinaires** (Art. 127 / ACD), specifically the **abattement forfaitaire**:

- Frais de domesticité (aides de ménage déclarées SS),
- frais d'aides et de soins en raison de l'état de dépendance,
- frais de garde d'enfant (placement de jour/nuit, crèches, foyers, garderies agréés; also EU).

**Montant: 5.400 € par année d'imposition** (since AY 2017; 3.600 € up to 2016). Cannot exceed real expenses nor **450 € / mois**.

- Enfants: modération d'impôt + **moins de 14 ans accomplis au 1er janvier** (no age limit if handicapés).
- Abattement granted **once** even if several categories cumulated.
- If forfait claimed, those same costs cannot also be claimed in the non-forfaitaire CE calculation.
- Alternative: real CE with the % of revenu imposable table (since 2018), depending on classe d'impôt and number of modérations.

**App implication: do not code garde d'enfants or aides domestiques as Art. 109–112 dépenses spéciales.** They belong in charges extraordinaires / abattement forfaitaire.

Sources:
- ACD https://impotsdirects.public.lu/fr/az/a/abat_forf_dom.html
- ACD https://impotsdirects.public.lu/fr/az/c/charg_extra.html
- Circulaire LIR 127/1 du 2 avril 2012 (still the reference circular for CE domesticité/garde).

---

## 3. Mortgage interest — owner-occupied primary residence

### 3.1 Legal qualification — 确定

- Revenu = **valeur locative** of the habitation occupée ou destinée à être occupée par le propriétaire (**Art. 98 al. 1 n° 5**).
- Frais d'obtention of that category: **intérêts débiteurs et arrérages de rente viagère**, after fixation of the valeur locative, **capped**.
- Before libre disposition (construction / remise en état): intérêts **intégralement** deductible + frais d'ouverture de crédit (dossier, acte notarié, inscription hypothécaire). Entretien/réparation **not** deductible in that period.
- **Not** a dépense spéciale Art. 111. Art. 111 / Art. 109 n° 1a interest is **personal/consumer** interest (voitures, biens meubles, etc.), 672 € envelope.
- ACD depens_spe: "Les intérêts en rapport avec des immeubles bâtis… constituent par nature des frais d'obtention déductibles dans la catégorie des revenus nets provenant de la location."
- Résidence **secondaire**: intérêts **non** déductibles (valeur locative = 0 € since 2017).
- Bien **loué**: intérêts as frais d'obtention of rental income, **no owner-occupier cap**.
- Subventions d'intérêts de l'État reduce the deductible charge.

Source ACD (updated 18.02.2025): https://impotsdirects.public.lu/fr/az/h/habit_pers.html

### 3.2 Caps from AY 2024 — ACD operational rule (高置信 / 确定 as ACD doctrine)

ACD habit_pers (18.02.2025), "à partir de l'année d'imposition 2024":

| Période (from année de fixation de la valeur locative) | Plafond annuel (per qualifying person) |
|---|---|
| Année de la fixation **+ première année qui suit** | **Intégralement** (no numeric cap) |
| Deuxième année qui suit **+ les trois années suivantes** (years 3–6) | **4.000 €** |
| Cinq années subséquentes (years 7–11) | **3.000 €** |
| Années suivantes (year 12+) | **2.000 €** |

Majoration:
- **+ own amount** for conjoint/partenaire **if imposés collectivement** (Art. 3).
- **+ own amount** for **each enfant** with modération d'impôt (Art. 122).
- Formula: cap × (1 + conjoint_collectif + enfants_modérés).

**No prorata temporis** of the cap for the occupation period (unlike the valeur locative).

Gouvernement.lu / Fillo note 31.01.2024 announced a **one-third increase** of the former caps:

| Ancien | Nouveau |
|---|---|
| 3.000 € (année d'occupation + 5 suivantes) | **4.000 €** |
| 2.250 € (5 années subséquentes) | **3.000 €** |
| 1.500 € (au-delà) | **2.000 €** |

Source: https://gouvernement.lu/dam-assets/documents/actualites/2024/01/31-mesures-logement-fiscalite/mesures-adoptes-logement-et-fiscalit-31012024.pdf (section 2.1).

**Conflict to record (do not silently reconcile):**

- ACD (Feb 2025) = 2 years unlimited, then 4.000 / 3.000 / 2.000 by **duration since fixation**.
- Gouvernement (31.01.2024) = 4.000 for years 1–6, 3.000 for years 6–10, 2.000 after; **no unlimited first two years**.
- taxx.lu (23.03.2026, secondary) presents a **date-of-availability table**: after 31.12.2023 → always intégral; 2014–2019 → 4.000; etc. That is a **different reading** (permanent full deduction for post-2023 homes). It is not the ACD rule.

**App should follow ACD habit_pers** (the administration that will assess). Flag the unlimited-first-two-years as ACD doctrine more favorable than the 2024 government note. Do not implement taxx.lu's "always intégral after 2023" without an ACD confirmation.

The numeric caps are **not in the LIR 2026 body** as a standalone 4.000/3.000/2.000 article; they are ACD application of Art. 98 n° 5 + Art. 105 after the 2024 housing package.

### 3.3 Worked household examples (ACD multiplier) — 高置信

- Célibataire, 3rd year of occupation: **4.000 €**.
- Couple classe 2, no child, 3rd year: **8.000 €**.
- Couple + 2 children modérés, 3rd year: **16.000 €** (matches gouvernement illustration of 16.000 € for a ménage of 4 from 2024).
- Couple + 1 child, years 7–11: **9.000 €** (3.000 × 3).
- Same couple, year 12+: **6.000 €** (2.000 × 3).
- First two years after fixation: actual interest, no cap (ACD).

### 3.4 Art. 102 vs other interest — summary for the app

| Interest type | Legal box | Cap 2025/2026 |
|---|---|---|
| Owner-occupied primary home, after valeur locative | **Frais d'obtention** (Art. 98 n° 5 / Art. 105) | ACD schedule 4.000/3.000/2.000 × household; 2 years intégral |
| Owner-occupied, before libre disposition | Frais d'obtention | Intégral + frais d'ouverture |
| Rental property | Frais d'obtention of rental net | No owner-occupier cap |
| Second home | — | **Not deductible** |
| Consumer / personal (car, meubles, private) | **Dépenses spéciales Art. 109 n° 1a** | **672 €** shared with Art. 111 a+b insurance |
| Interest to finance a prime unique | DS Art. 109 n° 1a | 672 € (+ majorations solde restant-dû) |

---

## 4. 2025/2026 indexation and reforms — checklist

| Item | AY 2025 | AY 2026 | Change? |
|---|---|---|---|
| FFO salarié | 540 € | 540 € | **No** |
| FFO pensionné | 300 € | 300 € | **No** |
| Forfait capitaux mobiliers | 25 € | 25 € | **No** |
| FDS / Art. 113 | 480 € (960 € couple) | 480 € (960 € couple) | **No** |
| FD unit | 99 € (max 2.574 €) | 99 € (max 2.574 €) | **No** |
| Plafond 672 € (intérêts personnels + assurance 111 a/b) | 672 € | 672 € | **No** |
| Épargne-logement | 672 / 1.344 € | 672 / 1.344 € | **No** |
| Prévoyance 111bis/ter | **3.200 €** | **4.500 €** | **YES — loi 19.12.2025** |
| Dons 120 € / 20 % / 1 M€ | idem | idem | **No** |
| Garde / domesticité forfait | 5.400 € | 5.400 € | **No** |
| Owner-occupier interest caps | 2024 schedule | 2024 schedule | **No further 2025/26 change** |
| Abattement extra-professionnel | 4.500 € | 4.500 € | **No** (AC 5.520 €) |
| AMVP (nouvel abattement maintien dans la vie professionnelle) | — | **jusqu'à 9.000 € / an** | **NEW 2026** (mfin Nouveautés 2026) |
| Bonification 922,50 € / enfant résidence alternée | applies | applies | Limited to **2025 and 2026** (mfin) |

**No general indexation of these forfaits in 2025 or 2026.** The only deduction-amount reform in scope is **Art. 111bis 3.200 → 4.500 € from AY 2026**, plus the new AMVP (not a forfait FO/DS).

Sources for "no change":
- LIR 2026 Art. 107, 109, 111, 112, 113 still carry 540/300/25, 672, 1.344/672, 480.
- ACD FFO/FDS still 540/300/480 (page 12.12.2023, not revised upward).
- ACD cotis_prim still 672 / 1.200.
- mfin Nouveautés 2026 lists 111bis 4.500 and AMVP 9.000; it does **not** list any change to 540/480/672.

---

## 5. App-audit punch list (highest-value checks)

1. Replace any "Art 102" label on frais d'obtention / owner-occupier interest with **Art. 105 / 107 / 98 n° 5**.
2. Forfait FO: 540 salarié, 300 pensionné, 25 capitaux; prorata 45/25/2; double for couple if each has the income; never give 540 to indépendants.
3. FDS: 480 per person, 960 two-earner couple; only for Art. 113 categories; don't swallow obligatory social security or dons.
4. 672 € is **one envelope** for personal interest **and** private insurance/sectes mutuelles; épargne-logement is **separate** (672/1.344).
5. 111bis: **3.200 € for AY 2025**, **4.500 € for AY 2026**.
6. Owner-occupier mortgage: frais d'obtention of valeur locative, ACD declining caps, household multiplier = 1 + conjoint collectif + enfants modérés; not 672 €, not Art. 111.
7. Garde d'enfant / aides à domicile: charges extraordinaires forfait 5.400 € (450 €/mois), not DS.
8. Dons: min 120 €, max 20 % revenus nets and 1.000.000 €.
9. Invalides: use the majoré table, not a flat 540.
10. FD: 99 €/unit, ignore first 4, cap 2.574 €.

---

## 6. Source list (all accessed 8 Nov 2026)

- LIR texte coordonné 01.01.2026 (08.05.2026): https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2026-ver-08052026.pdf
- LIR texte coordonné 01.01.2025: https://impotsdirects.public.lu/dam-assets/fr/legislation/LIR/texte-coordonn-en-vigueur-au-1er-janvier-2025.pdf
- ACD A–Z frais salarié: https://impotsdirects.public.lu/fr/az/f/frais_salar.html
- ACD A–Z FFO/FDS: https://impotsdirects.public.lu/fr/az/f/ffo-fds.html
- ACD A–Z abattement conjoint: https://impotsdirects.public.lu/fr/az/a/abat_conjoi.html
- ACD A–Z dépenses spéciales: https://impotsdirects.public.lu/fr/az/d/depens_spe.html
- ACD A–Z cotisations et primes: https://impotsdirects.public.lu/fr/az/c/cotis_prim.html
- ACD A–Z épargne-logement: https://impotsdirects.public.lu/fr/az/c/cotis-epargne-logement.html
- ACD A–Z prévoyance-vieillesse: https://impotsdirects.public.lu/fr/az/p/prevoyance_vieillesse.html
- ACD A–Z libéralités et dons: https://impotsdirects.public.lu/fr/az/l/libera_dons.html
- ACD A–Z habitation personnelle: https://impotsdirects.public.lu/fr/az/h/habit_pers.html
- ACD A–Z charges extraordinaires: https://impotsdirects.public.lu/fr/az/c/charg_extra.html
- ACD A–Z abattement forfaitaire domesticité/garde: https://impotsdirects.public.lu/fr/az/a/abat_forf_dom.html
- Circulaire LIR 111/1 (02.11.2017): https://impotsdirects.public.lu/dam-assets/fr/legislation/legi17/lir-111-1-02112017.pdf
- Gouvernement, mesures logement et fiscalité (31.01.2024): https://gouvernement.lu/dam-assets/documents/actualites/2024/01/31-mesures-logement-fiscalite/mesures-adoptes-logement-et-fiscalit-31012024.pdf
- mfin / Gouvernement, Nouveautés 2026 (29.12.2025): https://mfin.gouvernement.lu/fr/actualites.gouvernement2024+fr+actualites+toutes_actualites+articles+2025+12-decembre+nouveautes-2026.html
- Chambre des salariés, Les salariés et leur déclaration d'impôt (avril 2025): https://www.csl.lu/app/uploads/2025/04/les-salaries-et-leur-declaration-dimpot_fr.pdf
