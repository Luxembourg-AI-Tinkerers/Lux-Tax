import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

s = s.replace("throwaway copy in Phase 33 exactly so that day is mechanical.\n\n\n**Decision: parked.**",
              "throwaway copy in Phase 33 exactly so that day is mechanical.\n\n**Decision: parked.**", 1)
s = s.replace("**Delivered and evidenced.** Phases 0–33.",
              "**Delivered and evidenced.** Phases 0–42.", 1)

if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
