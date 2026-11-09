import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "**Requirements source:**"
box = """> **Status at 2026-11-09 (end of the current run)**
>
> - **Implemented and tested:** Phases 0–29 — tax engine, filing package + annex PDFs, eight
>   Prisma migrations applied with zero drift, API hardening, mobile policy layers.
>   Evidence: **373 / 373 tests**, `tsc` exit 0, 52 files syntax `ok`.
> - **Written but unverified:** the two mobile renderers (`OfflineBanner`, `AppLockScreen`) and the
>   screen wiring in Phases 22–24 — no React Native runtime exists in this workspace, so nothing
>   here can be rendered or exercised on a device.
> - **Blocked on an external document (not on code):** **R6** (2026 CIC monthly bands) and **R7**
>   (épargne-logement age limit). Projet de loi 8775 is unpublished — the ACD list
>   `legi26.html` still ends at the *loi du 16 juillet 2026* (Mémorial A N° 360) and
>   `chd.lu/fr/dossier/8775` still shows only *22.06.2026 — Déposé*, re-verified on 2026-11-09.
>   Both are gated in the rule package with their source and activation diff, and a test proves the
>   activation. No number has been invented to close them.
>
> **Requirements source:**"""

assert s.count(anchor) == 1
s = s.replace(anchor, box)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
