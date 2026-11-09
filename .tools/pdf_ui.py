import io

# api helper
p = "apps/web/src/lib/api.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.rstrip() + """

/**
 * Download the ACD annex PDF produced by the API for a filing package.
 * Uses a blob download because the endpoint is JWT-protected.
 */
export async function downloadAnnexPdf(workspaceId: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxtax_access_token') : null;
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${workspaceId}/filing-package/annexes.pdf`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  if (!response.ok) {
    throw new Error(`Annex PDF could not be generated (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `luxtax-annexes-${workspaceId.slice(0, 8)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
"""
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# view: replace the print button with download + print
p2 = "apps/web/src/components/FilingPackageView.tsx"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old = """                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                      >
                        Print / Save as PDF
                      </button>"""
new = """                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await downloadAnnexPdf(workspace.id);
                            } catch (error) {
                              console.error(error);
                            }
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-500"
                        >
                          Download annex PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                        >
                          Print
                        </button>
                      </div>"""
assert s2.count(old) == 1
s2 = s2.replace(old, new)
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
