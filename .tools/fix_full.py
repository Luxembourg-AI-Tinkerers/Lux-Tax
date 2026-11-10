import io

p = r"B:\B\tax-app\tmp\api-full.ps1"
s = io.open(p, encoding="utf-8", newline="").read()

# The facts controller has no plain POST route: facts arrive from documents or
# the demo loader, and are confirmed with POST /facts/confirm. Drop that check.
old_fact = """  # A fact + questionnaire + calculation, so the package has something to map.
  $fact = Invoke-Api -Method POST -Path "/api/workspaces/$workspaceId/facts" -Body @{ category = 'EMPLOYMENT_INCOME'; fieldKey = 'grossSalary'; amount = 60000; currency = 'EUR' } -Token $token
  Check 'fact created' ($fact.status -ge 200 -and $fact.status -lt 300) "status=$($fact.status) body=$($fact.body.Substring(0,[Math]::Min(200,$fact.body.Length)))"

"""
assert s.count(old_fact) == 1
s = s.replace(old_fact, "")

# The package requires an approved return version.
old_pkg = """  $pkg = Invoke-Api -Method POST -Path "/api/workspaces/$workspaceId/filing-package" -Token $token"""
new_pkg = """  # A package can only be generated for an approved version (API-6 contract).
  $approve = Invoke-Api -Method POST -Path "/api/workspaces/$workspaceId/approve" -Token $token
  Check 'approve the return (PROD-2 code path)' ($approve.status -ge 200 -and $approve.status -lt 300) "status=$($approve.status) body=$($approve.body.Substring(0,[Math]::Min(250,$approve.body.Length)))"

  $pkg = Invoke-Api -Method POST -Path "/api/workspaces/$workspaceId/filing-package" -Token $token"""
assert s.count(old_pkg) == 1
s = s.replace(old_pkg, new_pkg)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
