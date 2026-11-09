import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

start_marker = "    // Generate Form 100 Box Mappings"
end_marker = "    // Compute checksum"
i = s.index(start_marker)
j = s.index(end_marker)
head, tail = s[:i], s[j:]

new_block = '''    // ---------------------------------------------------------------------
    // Form 100F sheet map.
    //
    // The official return is a 20-page letter-coded form: Signalétique,
    // Enfants, E/R, NR, C/A, I, S, P, CM, L, D, EX, DS, CE, DD, RD, Recap.
    // There is no "100A-100L" series, and 101/103/105 are modele 160
    // salary-certificate codes, not Form 100 cases. We therefore emit
    // sheet-level mappings with the legal label, and a separate
    // certificate-import sheet that keeps the 160 codes.
    // ---------------------------------------------------------------------
    const calc = (workspace.calculationResult ?? {}) as any;
    const calcDeductions = calc.deductions ?? {};
    const calcCredits = calc.credits ?? {};

    const form100Boxes: Form100BoxMapping[] = [];
    const certificateImport: Array<{ code: string; label: string; amount: string; sourceFactId?: string }> = [];

    const addBox = (
      pageNumber: number,
      sheet: string,
      labelFr: string,
      labelDe: string,
      amount: number | string,
      sourceFactId?: string,
    ) => {
      form100Boxes.push({ pageNumber, boxNumber: sheet, labelFr, labelDe, amount, sourceFactId });
    };

    for (const fact of workspace.confirmedFacts) {
      const amount = fact.amount.toString();
      switch (fact.category) {
        case 'EMPLOYMENT_INCOME':
          if (fact.fieldKey === 'grossSalary' || fact.fieldKey === 'code_101') {
            addBox(7, 'S', "Feuille S - remuneration brute (Art. 95)", 'Blatt S - Bruttoarbeitslohn', amount, fact.id);
            certificateImport.push({ code: '101', label: 'Remuneration brute (modele 160)', amount, sourceFactId: fact.id });
          } else if (fact.fieldKey === 'socialSecurity' || fact.fieldKey === 'code_103') {
            addBox(7, 'S', "Feuille S - cotisations sociales deductibles", 'Blatt S - Sozialversicherungsbeitrage', amount, fact.id);
            certificateImport.push({ code: '103', label: 'Cotisations sociales (modele 160)', amount, sourceFactId: fact.id });
          } else if (fact.fieldKey === 'withholdingTax' || fact.fieldKey === 'code_105') {
            addBox(19, 'RD', "Feuille RD - retenue d'impot sur traitements et salaires", 'Blatt RD - einbehaltene Lohnsteuer', amount, fact.id);
            certificateImport.push({ code: '105', label: "Retenue d'impot (modele 160)", amount, sourceFactId: fact.id });
          }
          break;

        case 'PENSION_INCOME':
          addBox(8, 'P', 'Feuille P - pensions et rentes (Art. 96)', 'Blatt P - Pensionen und Renten', amount, fact.id);
          break;

        case 'CAPITAL_INCOME':
          addBox(9, 'CM', 'Feuille CM - revenus de capitaux mobiliers (Art. 97)', 'Blatt CM - Kapitaleinkunfte', amount, fact.id);
          break;

        case 'RENTAL_INCOME':
          addBox(10, 'L', 'Feuille L - revenus de location (Art. 98)', 'Blatt L - Mieteinkunfte', amount, fact.id);
          break;

        case 'FOREIGN_INCOME':
          addBox(3, 'E/R', 'Feuille E/R - revenus etrangers (methodes conventionnelles)', 'Blatt E/R - auslandische Einkunfte', amount, fact.id);
          break;

        case 'FREELANCE_INCOME':
          addBox(5, 'C/A-I', 'Feuilles C/A ou I - benefice commercial / profession liberale (Art. 14 / 91)', 'Blatt C/A oder I - Gewinn', amount, fact.id);
          break;

        case 'BUSINESS_EXPENSE':
          addBox(5, 'C/A-I', 'Feuilles C/A ou I - frais d\'exploitation deductibles', 'Blatt C/A oder I - Betriebsausgaben', amount, fact.id);
          break;

        case 'MORTGAGE_DEDUCTION':
        case 'MORTGAGE_INTEREST':
          addBox(10, 'L', "Feuille L - interets debiteurs de l'habitation personnelle (Art. 98 n 5 / 105)", 'Blatt L - Schuldzinsen selbstgenutztes Wohneigentum', amount, fact.id);
          break;

        case 'INSURANCE_DEDUCTION':
          addBox(13, 'DS', 'Feuille DS - primes Art. 111 (enveloppe 672 EUR)', 'Blatt DS - Versicherungspramien (Art. 111)', amount, fact.id);
          break;

        case 'PENSION_SAVINGS_111BIS':
          addBox(13, 'DS', 'Feuille DS - prevoyance-vieillesse Art. 111bis / 111ter', 'Blatt DS - Altersvorsorge (Art. 111bis)', amount, fact.id);
          break;

        case 'SAVINGS_HOUSING':
          addBox(13, 'DS', 'Feuille DS - epargne-logement Art. 111 al. 5', 'Blatt DS - Bausparen', amount, fact.id);
          break;

        case 'LRCP_CONTRIBUTION':
          addBox(13, 'DS', 'Feuille DS - cotisations LRCP Art. 110 n 3', 'Blatt DS - LRCP-Beitrage', amount, fact.id);
          break;

        case 'DONATION_DEDUCTION':
          addBox(13, 'DS', 'Feuille DS - dons Art. 112 (en plus du forfait)', 'Blatt DS - Spenden (Art. 112)', amount, fact.id);
          break;

        case 'CHILDCARE_EXPENSE':
        case 'HOUSEHOLD_HELP_EXPENSE':
          addBox(17, 'CE', "Feuille CE - frais de garde / domesticite (Art. 127, forfait 5 400 EUR)", 'Blatt CE - Kinderbetreuung / Haushaltshilfe', amount, fact.id);
          break;

        default:
          break;
      }
    }

    // Computed forfaits - never a hard-coded 540.
    addBox(7, 'S', "Feuille S - frais d'obtention forfaitaires (Art. 107)", 'Blatt S - Werbungskosten-Pauschbetrag', Number(calcDeductions.fraisObtention ?? 0).toFixed(2));
    if (Number(calcDeductions.travel ?? 0) > 0) {
      addBox(7, 'S', 'Feuille S - frais de deplacement (Art. 105bis)', 'Blatt S - Fahrtkosten', Number(calcDeductions.travel).toFixed(2));
    }
    addBox(13, 'DS', 'Feuille DS - forfait depenses speciales (Art. 113)', 'Blatt DS - Sonderausgaben-Pauschbetrag', Number(calcDeductions.specialExpensesForfait ?? 0).toFixed(2));
    if (Number(calcDeductions.aep ?? 0) > 0) {
      addBox(20, 'Recap', "Recapitulation - abattement extra-professionnel (Art. 129b)", 'Zusammenfassung - Berufsabattement (Art. 129b)', Number(calcDeductions.aep).toFixed(2));
    }

    // Credits are granted through the fiche / assessment; list them for review.
    const creditLines: Array<[string, number]> = [
      ['CIS (Art. 154quater)', Number(calcCredits.cis ?? 0)],
      ['CI-CO2 salarie', Number(calcCredits.ciCo2Salary ?? 0)],
      ['CIP (Art. 154quinquies)', Number(calcCredits.cip ?? 0)],
      ['CII (Art. 152ter)', Number(calcCredits.cii ?? 0)],
      ['CIM (Art. 154ter)', Number(calcCredits.cim ?? 0)],
    ];
    for (const [label, value] of creditLines) {
      if (value > 0) {
        addBox(20, 'Recap', `Recapitulation - credit ${label}`, `Zusammenfassung - Gutschrift ${label}`, value.toFixed(2));
      }
    }

    // Assistant electronique exclusions (guichet.lu, 7 April 2026).
    const assistantExclusions: string[] = [];
    if (workspace.taxClass === TaxClass.CLASS_2) {
      assistantExclusions.push(
        "Une demande d'imposition individuelle (Art. 3ter) ne peut pas etre introduite via l'assistant electronique : deposez le modele 100 PDF via MyGuichet.",
      );
    }
    if (workspace.residenceStatus === 'NON_RESIDENT') {
      assistantExclusions.push(
        "L'option collective resident/non-resident (regle des 90 %) ne peut pas etre demandee via l'assistant electronique.",
      );
    }

    const myGuichetGuide: MyGuichetStepGuide[] = [
      {
        sectionIndex: 1,
        sectionTitle: "Etape 1 - Identite et situation familiale (feuilles Signaletique, Enfants, E/R)",
        instructions: [
          'Connectez-vous a MyGuichet.lu avec votre produit LuxTrust ou votre eID luxembourgeoise.',
          'Selectionnez la demarche "Declaration de l\\'impot sur le revenu (modele 100)".',
          `Confirmez l'annee d'imposition ${workspace.taxYear} et la classe d'impot (${workspace.taxClass || '1'}).`,
          "Feuille E/R : mariés, la case 317 (imposition collective) est le defaut. Les cases 318/319 ne se cochent que sur demande conjointe d'imposition individuelle (Art. 3ter) et exigent la double signature en page 20.",
          ...assistantExclusions,
        ],
        fieldsToEnter: [],
      },
      {
        sectionIndex: 2,
        sectionTitle: 'Etape 2 - Revenus (feuilles S, P, CM, L, C/A-I)',
        instructions: [
          'Ouvrez chaque feuille correspondant a un revenu declare ci-dessous.',
          'Recopiez le montant dans la case indiquee ; ne recopiez jamais un code 101/103/105 sur le modele 100 (ce sont des codes du certificat 160).',
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => [7, 8, 9, 10, 5].includes(b.pageNumber) && b.labelFr.includes('Feuille'))
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: `Feuille ${b.boxNumber}`, value: b.amount })),
      },
      {
        sectionIndex: 3,
        sectionTitle: 'Etape 3 - Depenses speciales et charges (feuilles DS, CE)',
        instructions: [
          "Saisissez les primes Art. 111 dans l'enveloppe 672 EUR, et les versements Art. 111bis separement (plafond 3 200 EUR pour 2025, 4 500 EUR a partir de 2026).",
          'Les dons Art. 112 se declarent en plus du forfait de 480/960 EUR.',
          'Les frais de garde et d\'aide a domicile vont en feuille CE (forfait 5 400 EUR), pas en DS.',
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => [13, 17].includes(b.pageNumber))
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: `Feuille ${b.boxNumber}`, value: b.amount })),
      },
      {
        sectionIndex: 4,
        sectionTitle: 'Etape 4 - Recapitulation et signature',
        instructions: [
          'Verifiez que le revenu imposable ajuste affiche par MyGuichet correspond au recapitulatif ci-dessous.',
          'Signez electroniquement avec LuxTrust, puis telechargez le recepisse officiel de transmission ACD.',
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => b.pageNumber === 19 || b.pageNumber === 20)
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: b.boxNumber, value: b.amount })),
      },
    ];

'''

out = (head + new_block + tail).replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched filing")
