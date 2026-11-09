import io
p = "apps/mobile/app/(tabs)/documents.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""import { replayQueue } from '../../src/lib/queue-runtime';""",
"""import { replayQueue } from '../../src/lib/queue-runtime';
import { canSeeAmount, REDACTED_PLACEHOLDER } from '../../src/lib/privacy';""")

rep("""  const [workspaceId, setWorkspaceId] = useState<string | null>(null);""",
"""  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);""")

rep("""  const loadData = async () => {
    try {""",
"""  // MOB-5: a fact is readable only when its source document is shared with the
  // household; another member's private draft shows a placeholder instead.
  const canSeeFact = (fact: { documentId?: string | null }): boolean => {
    const source = documents.find((doc) => doc.id === fact.documentId);
    return canSeeAmount(
      { ownerId: source?.ownerId ?? null, visibility: source?.visibility ?? null },
      viewerId,
    );
  };

  const loadData = async () => {
    try {
      const me = await mobileApiClient.getMe();
      if (me.data) setViewerId(me.data.id);
""")

rep("""                  <Text style={styles.factValue}>
                    €{Number(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>""",
"""                  <Text style={styles.factValue}>
                    {canSeeFact(fact)
                      ? `€${Number(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : REDACTED_PLACEHOLDER}
                  </Text>""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
