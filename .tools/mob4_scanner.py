import io

# ---------------- DocumentCameraScanner: queue a failed upload
p = "apps/mobile/src/components/DocumentCameraScanner.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""      const res = await mobileApiClient.uploadDocument(workspaceId, {
        fileName: captured.fileName,
        mimeType: captured.mimeType,
        fileContentBase64: captured.base64,
        visibility,
      });

      setUploading(false);
      if (res.data) {""",
"""      const body = {
        fileName: captured.fileName,
        mimeType: captured.mimeType,
        fileContentBase64: captured.base64,
        visibility,
      };
      const res = await mobileApiClient.uploadDocument(workspaceId, body);

      setUploading(false);

      // MOB-4: keep the scan instead of losing it when the connection drops.
      if (!res.data && isNetworkError(res.error?.message)) {
        const queued = await enqueueOperation({
          kind: 'UPLOAD_DOCUMENT',
          workspaceId,
          payload: body,
          dedupeKey: `upload:${workspaceId}:${captured.fileName}`,
        });
        Alert.alert(
          'Saved offline',
          queued.ok
            ? 'You are offline. The scan is queued and will be uploaded when the connection returns.'
            : 'You are offline, and this scan is already queued.',
        );
        handleReset();
        onClose();
        return;
      }

      if (res.data) {""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("scanner wired")
