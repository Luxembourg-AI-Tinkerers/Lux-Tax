import io

paths = [
    r"B:\B\tax-app\apps\api\src\modules\calculations\calculations.controller.ts",
    r"B:\B\tax-app\apps\api\src\modules\workspaces\workspaces.controller.ts",
]

for p in paths:
    raw = io.open(p, encoding="utf-8-sig", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")
    if "HouseholdRole" in s.split("@Controller")[0]:
        print("already", p)
        continue
    anchor = "import { Roles } from '../../common/decorators/roles.decorator';"
    assert s.count(anchor) == 1, p
    s = s.replace(anchor, anchor + "\nimport { HouseholdRole } from '@luxtax/contracts';")
    io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    print("patched", p)
