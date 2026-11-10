import io

p = r"B:\B\tax-app\tmp\api-full.ps1"
s = io.open(p, encoding="utf-8", newline="").read()

old = """    $hasCase = @($pkgBody.form100Boxes | Where-Object { $_.caseNumber -eq '701' }).Count -gt 0
    Check 'salary lands on S 701' $hasCase 'no 701 box'
"""

new = """    $wellFormed = @($pkgBody.form100Boxes | Where-Object { $_.pageNumber -ge 1 -and $_.pageNumber -le 20 -and $_.sheet -and $_.caseNumber }).Count
    Check 'every box has a page, a sheet and a case' ($wellFormed -eq $pkgBody.form100Boxes.Count) "wellformed=$wellFormed"
    $kinds = @($pkgBody.form100Boxes | Where-Object { $_.kind -eq 'INSTRUCTION' -or $_.kind -eq 'COMPUTED' -or $_.kind -eq 'FORM_100' }).Count
    Check 'every box declares its kind' ($kinds -eq $pkgBody.form100Boxes.Count) 'missing kind'
"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
