import io
p = "packages/tax-engine/src/deductions.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """    // Cap: net of the lower professional income of the couple.
    const professionalNet = (person: PersonIncome): number =>
      Math.max(0, person.grossSalary - person.socialContributions) + person.independentProfit;

    const nets = [ctx.primary, ctx.spouse].map(professionalNet).filter((n) => n > 0);
    const lowerNet = nets.length > 0 ? Math.min(...nets) : 0;

    aep = Math.min(base, lowerNet);"""

new = """    // Art. 129b al. 3: the allowance cannot exceed the net of the taxpayer's own
    // professional income, nor the net the other spouse would have realised.
    // A professional LOSS caps the AEP at zero for that spouse; a spouse with no
    // professional income at all (conjoint-aidant route) does not cap it.
    const professionalNet = (person: PersonIncome): number =>
      Math.max(0, person.grossSalary - person.socialContributions) + person.independentProfit;

    const hasProfessionalActivity = (person: PersonIncome): boolean =>
      person.grossSalary > 0 || person.independentProfit !== 0;

    const activeNets = [ctx.primary, ctx.spouse]
      .filter(hasProfessionalActivity)
      .map(professionalNet);

    const lowerNet = activeNets.length > 0 ? Math.min(...activeNets) : 0;

    aep = Math.max(0, Math.min(base, lowerNet));"""

assert s.count(old) == 1
out = s.replace(old, new).replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("ok")
