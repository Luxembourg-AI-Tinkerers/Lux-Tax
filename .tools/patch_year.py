import io

# 1) dashboard passes the selected year
p = "apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """          <TaxCalculatorView
            workspaceId={workspace.id}
            onCalculated={loadData}
            onNavigateToFiling={() => setActiveTab('filing')}
          />"""
new = """          <TaxCalculatorView
            workspaceId={workspace.id}
            taxYear={workspace.taxYear}
            onCalculated={loadData}
            onNavigateToFiling={() => setActiveTab('filing')}
          />"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# 2) calculator: accept taxYear prop, default 2025 (current filing season), show supported years
p2 = "apps/web/src/components/TaxCalculatorView.tsx"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

old2 = """interface TaxCalculatorViewProps {
  workspaceId: string;
  onCalculated?: () => void;
  onNavigateToFiling?: () => void;
}

export function TaxCalculatorView({ workspaceId, onCalculated, onNavigateToFiling }: TaxCalculatorViewProps) {"""
new2 = """interface TaxCalculatorViewProps {
  workspaceId: string;
  /** Tax year of the active workspace. 2025 stays fully supported (filing until 31 Dec 2026). */
  taxYear?: number;
  onCalculated?: () => void;
  onNavigateToFiling?: () => void;
}

export function TaxCalculatorView({ workspaceId, taxYear = 2025, onCalculated, onNavigateToFiling }: TaxCalculatorViewProps) {"""
assert s2.count(old2) == 1
s2 = s2.replace(old2, new2)

s2 = s2.replace("""            Deterministic Tax Engine (Tax Year {calc?.taxYear ?? new Date().getFullYear()})""",
"""            Deterministic Tax Engine (Tax Year {calc?.taxYear ?? taxYear})""")

s2 = s2.replace("""            {calculating ? 'Running Tax Formulas...' : `⚡ Calculate ${calc?.taxYear ?? new Date().getFullYear()} Tax`}""",
"""            {calculating ? 'Running Tax Formulas...' : `⚡ Calculate ${calc?.taxYear ?? taxYear} Tax`}""")

old3 = """            Calculated with the versioned rule package {calc?.rulePackageVersion ?? ''} — Art. 118–121, 120bis, 124, 126 LIR."""
new3 = """            Calculated with the versioned rule package {calc?.rulePackageVersion ?? ''} — Art. 118–121, 120bis, 124, 126 LIR.
            <span className="block mt-1 text-[11px] text-slate-400">
              Supported tax years: 2025 (returns due 31 December 2026) · 2026 · 2028 preview
            </span>"""
assert s2.count(old3) == 1
s2 = s2.replace(old3, new3)

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
