import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

# import the DTO
rep("""  Form100BoxMapping,
  MyGuichetStepGuide,""",
"""  Form100BoxMapping,
  MyGuichetStepGuide,
  AnnexRequestDto,""")

# build annexes right before the assistant exclusions
rep("""    // Assistant electronique exclusions (guichet.lu, 7 April 2026).""",
"""    // ------------------------------------------------------------------
    // ACD annexes implied by the declared data. The app supplies the values
    // and says plainly that the official PDF is not generated.
    // ------------------------------------------------------------------
    const annexes: AnnexRequestDto[] = [];

    const rentalNet = Number(calc?.rental?.net ?? 0);
    if (rentalNet !== 0) {
      annexes.push({
        code: "190/210",
        title: "Revenus de location — biens batis",
        reason: "Une location declaree ouvre l'annexe 190/210.",
        fields: [
          { label: "Loyers bruts", value: Number(calc?.rental?.gross ?? 0).toFixed(2) },
          { label: "Charges", value: Number(calc?.rental?.charges ?? 0).toFixed(2) },
          { label: "Resultat net", value: rentalNet.toFixed(2) },
        ],
        produced: false,
      });
    }

    const plusValues = calc?.plusValues;
    if (plusValues && (plusValues.speculation > 0 || plusValues.article100 > 0 || plusValues.article99ter > 0)) {
      annexes.push({
        code: "700",
        title: "Plus-values immobilieres et cessions",
        reason: "Une plus-value imposable ouvre le modele 700.",
        fields: [
          { label: "Speculation (Art. 99bis)", value: Number(plusValues.speculation).toFixed(2) },
          { label: "Participation importante (Art. 100)", value: Number(plusValues.article100).toFixed(2) },
          { label: "Immeubles > 5 ans (Art. 99ter)", value: Number(plusValues.article99ter).toFixed(2) },
          { label: "Abattement applique", value: Number(plusValues.abattement).toFixed(2) },
        ],
        produced: false,
      });
    }

    const dependants = workspace.household?.dependants?.length ?? 0;
    if (dependants > 0) {
      annexes.push({
        code: "104",
        title: "Designation du parent — garde alternee",
        reason: "A remplir uniquement en cas de garde alternee (un seul menage percoit la moderation).",
        fields: [{ label: "Enfants declares", value: String(dependants) }],
        produced: false,
      });
    }

    if (Number(calc?.credits?.cim ?? 0) > 0) {
      annexes.push({
        code: "100 - feuille Enfants (case 228+)",
        title: "Demande de credit d'impot monoparental",
        reason: "Le CIM se demande dans la feuille Enfants du modele 100.",
        fields: [{ label: "CIM calcule", value: Number(calc.credits.cim).toFixed(2) }],
        produced: false,
      });
    }

    // Assistant electronique exclusions (guichet.lu, 7 April 2026).""")

# persist annexes
rep("""        form100BoxesJson: form100Boxes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },""",
"""        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },""")

# include annexes in the payload hash and the returned DTO (generate)
rep("""      form100Boxes,
      myGuichetGuide,
    });
    const packageSha256""",
"""      form100Boxes,
      annexes,
      myGuichetGuide,
    });
    const packageSha256""")

rep("""      form100Boxes,
      myGuichetGuide,
      packageSha256,
    };
  }""",
"""      form100Boxes,
      annexes,
      myGuichetGuide,
      packageSha256,
    };
  }""")

# getLatestFilingPackage: return persisted annexes
rep("""      form100Boxes: (fp.form100BoxesJson as any) || [],
      myGuichetGuide: (fp.myGuichetGuideJson as any) || [],""",
"""      form100Boxes: (fp.form100BoxesJson as any) || [],
      annexes: (fp.annexesJson as any) || [],
      myGuichetGuide: (fp.myGuichetGuideJson as any) || [],""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
