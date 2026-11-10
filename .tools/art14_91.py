import io

p = r"B:\B\tax-app\apps\api\src\modules\filing\filing.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# 1. Key the accumulator by owner AND nature.
old_decl = """    const freelanceByOwner = new Map<
      string,
      { ownerId: string | null; revenue: number; expenses: number; liberal: boolean }
    >();"""
new_decl = """    // Keyed by owner AND nature: a filer can carry an Art. 14 commercial profit
    // and an Art. 91 liberal profit in the same year. Netted together they would
    // produce one wrong line, and the liberal flag would drag the commercial
    // profit onto sheet I with it.
    const freelanceByOwner = new Map<
      string,
      { ownerId: string | null; revenue: number; expenses: number; liberal: boolean }
    >();"""
assert s.count(old_decl) == 1
s = s.replace(old_decl, new_decl)

# 2. Accumulate into an owner+nature bucket.
old_key = """          const key = !fact.ownerId || fact.ownerId === primaryUserId ? "__primary__" : fact.ownerId;
          const entry =
            freelanceByOwner.get(key) ?? {
              ownerId: fact.ownerId,
              revenue: 0,
              expenses: 0,
              liberal: false,
            };
          if (category === "FREELANCE_INCOME") entry.revenue += Number(amount) || 0;
          else entry.expenses += Number(amount) || 0;
          // Art. 91 (profession libérale) is page 6 sheet I, not C/A 501. The
          // distinction is carried by the fact's field key because the activity
          // type in the profile is free text and cannot be relied on.
          if (fact.fieldKey === "professionalRevenue" || fact.fieldKey === "professionalExpense") {
            entry.liberal = true;
          }
          freelanceByOwner.set(key, entry);
          break;"""

new_key = """          // Art. 91 (profession libérale) is page 6 sheet I, not C/A 501. The
          // distinction is carried by the fact's field key because the activity
          // type in the profile is free text and cannot be relied on.
          const liberal =
            fact.fieldKey === "professionalRevenue" || fact.fieldKey === "professionalExpense";
          const ownerKey =
            !fact.ownerId || fact.ownerId === primaryUserId ? "__primary__" : fact.ownerId;
          // Owner *and* nature: Art. 14 and Art. 91 profits are separate lines
          // and must never be netted against each other.
          const key = `${ownerKey}::${liberal ? "art91" : "art14"}`;
          const entry =
            freelanceByOwner.get(key) ?? {
              ownerId: fact.ownerId,
              revenue: 0,
              expenses: 0,
              liberal,
            };
          if (category === "FREELANCE_INCOME") entry.revenue += Number(amount) || 0;
          else entry.expenses += Number(amount) || 0;
          freelanceByOwner.set(key, entry);
          break;"""
assert s.count(old_key) == 1, s.count(old_key)
s = s.replace(old_key, new_key)

# 3. Emit both natures for the same owner, with the correct per-nature label.
old_loop = """    for (const group of freelanceByOwner.values()) {
      const owner = ownerOf(group.ownerId);
      const net = group.revenue - group.expenses;
      if (group.liberal) {"""
new_loop = """    for (const group of freelanceByOwner.values()) {
      const owner = ownerOf(group.ownerId);
      const net = group.revenue - group.expenses;
      if (group.liberal) {"""
# unchanged; keep for clarity
assert s.count(old_loop) == 1

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
