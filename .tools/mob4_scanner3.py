import io
p = "apps/mobile/src/components/DocumentCameraScanner.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("import React, { useState } from 'react';", "import React, { useEffect, useState } from 'react';")

# add a replay effect right after the state declarations (find the first useState block end)
anchor = """  const [uploading, setUploading] = useState(false);"""
addition = """  const [uploading, setUploading] = useState(false);

  // MOB-4: opening the scanner is a natural moment to drain the queue.
  useEffect(() => {
    if (!visible) return;
    void replayQueue(mobileApiClient).catch(() => undefined);
  }, [visible]);"""
rep(anchor, addition)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
