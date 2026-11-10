import io

p = r"B:\B\tax-app\tmp\api-smoke.ps1"
s = io.open(p, encoding="utf-8", newline="").read()

s = s.replace("/api/auth/me", "/api/users/me")
s = s.replace("GET /api/users/me", "GET /api/users/me")

old = """    $ws = Invoke-Api -Method POST -Path "/api/households/$householdId/workspaces" -Body @{ taxYear = 2025; taxClass = 'CLASS_1' } -Token $token
    Check 'POST workspace' ($ws.status -ge 200 -and $ws.status -lt 300) "status=$($ws.status) body=$($ws.body.Substring(0,[Math]::Min(250,$ws.body.Length)))"

    $workspaceId = $null
    try { $workspaceId = ($ws.body | ConvertFrom-Json).id } catch {}"""

new = """    # Creating a household already creates its first workspace, so list before
    # creating another one (a duplicate tax year is a 409 by design).
    $existing = Invoke-Api -Method GET -Path "/api/households/$householdId/workspaces" -Token $token
    $workspaceId = $null
    try {
      $parsed = $existing.body | ConvertFrom-Json
      if ($parsed -is [array] -and $parsed.Count -gt 0) { $workspaceId = $parsed[0].id }
      elseif ($parsed.id) { $workspaceId = $parsed.id }
    } catch {}
    Check 'a workspace exists for the household' ([bool]$workspaceId) "status=$($existing.status) body=$($existing.body.Substring(0,[Math]::Min(250,$existing.body.Length)))"

    if (-not $workspaceId) {
      $ws = Invoke-Api -Method POST -Path "/api/households/$householdId/workspaces" -Body @{ taxYear = 2025; taxClass = 'CLASS_1' } -Token $token
      Check 'POST workspace' ($ws.status -ge 200 -and $ws.status -lt 300) "status=$($ws.status) body=$($ws.body.Substring(0,[Math]::Min(250,$ws.body.Length)))"
      try { $workspaceId = ($ws.body | ConvertFrom-Json).id } catch {}
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
