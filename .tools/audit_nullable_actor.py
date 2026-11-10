import io

# --- audit.service.ts -------------------------------------------------------
p = r"B:\B\tax-app\apps\api\src\modules\audit\audit.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# Params: actorId optional. Every existing caller passes a string, so this only
# widens the type.
old = "  readonly actorId: string;\n"
new = (
    "  /**\n"
    "   * Absent only when no account matches the identity being recorded — a\n"
    "   * rejected login for an unknown address. Everything else names its actor.\n"
    "   */\n"
    "  readonly actorId?: string;\n"
)
assert t.count(old) == 1, "params actorId"
t = t.replace(old, new, 1)

# The canonical payload must hash null for an anonymous event. A string still
# hashes as itself, so hashes of existing events do not change.
old_hash = "        actorId: params.actorId,\n"
new_hash = "        actorId: params.actorId ?? null,\n"
assert t.count(old_hash) == 1, "hash payload"
t = t.replace(old_hash, new_hash, 1)

# DTO mappers: Prisma yields string | null.
for old_map in [
    "        actorId: unchained.actorId,\n",
    "      actorId: event.actorId,\n",
    "      actorId: e.actorId,\n",
]:
    assert t.count(old_map) == 1, old_map
    t = t.replace(old_map, old_map.replace("actorId: ", "actorId: ").replace(".actorId,", ".actorId || undefined,"), 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("audit.service.ts updated")

# --- audit-chain.ts --------------------------------------------------------
p2 = r"B:\B\tax-app\apps\api\src\modules\audit\audit-chain.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
nl2 = "\r\n" if "\r\n" in raw2 else "\n"
t2 = raw2.replace("\r\n", "\n")

old_entry = "  actorId: string;\n"
new_entry = "  actorId?: string | null;\n"
assert t2.count(old_entry) == 1, "chain entry actorId"
t2 = t2.replace(old_entry, new_entry, 1)

old_payload = "    actorId: entry.actorId,\n"
new_payload = "    actorId: entry.actorId ?? null,\n"
assert t2.count(old_payload) == 1, "chain payload"
t2 = t2.replace(old_payload, new_payload, 1)

io.open(p2, "w", encoding="utf-8", newline=nl2).write(t2)
print("audit-chain.ts updated")
