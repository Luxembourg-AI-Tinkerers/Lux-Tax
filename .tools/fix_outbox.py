import io

p = r"B:\B\tax-app\apps\api\src\modules\notifications\notification-outbox.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# 1. Type the channel parameter.
old_sig = "  async enqueue(notificationId: string, channels: readonly string[]): Promise<number> {"
new_sig = "  async enqueue(notificationId: string, channels: readonly DeliveryChannel[]): Promise<number> {"
assert s.count(old_sig) == 1
s = s.replace(old_sig, new_sig)

# 2. The store getter returned an object literal whose methods used `this.prisma`
#    — inside that literal `this` is the literal, not the service, so the whole
#    delivery worker threw on its first query. Capture the client instead.
old_store = """  /** Prisma implementation of the pass's storage contract. */
  private get store(): OutboxStore {
    return {"""
new_store = """  /** Prisma implementation of the pass's storage contract. */
  private get store(): OutboxStore {
    // Captured here on purpose: inside the object literal below `this` is the
    // literal, not the service, so `this.prisma` was undefined and every
    // delivery attempt failed with a TypeError before reaching the database.
    const prisma = this.prisma;
    return {"""
assert s.count(old_store) == 1
s = s.replace(old_store, new_store)

# 3. Point every query in the literal at the captured client.
store_start = s.index(new_store)
store_end = s.index("\n  }\n\n  /** Send every delivery whose scheduled time has passed. */", store_start)
segment = s[store_start:store_end]
segment_fixed = segment.replace("this.prisma.", "prisma.")
s = s[:store_start] + segment_fixed + s[store_end:]

# 4. Import the channel type.
if "DeliveryChannel" not in s.split("export class")[0]:
    anchor = "import { Logger, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';"
    if s.count(anchor) == 1:
        s = s.replace(anchor, anchor + "\nimport type { DeliveryChannel } from './notification-delivery';")
    else:
        # fall back: add after the first import line
        first_nl = s.index("\n")
        s = s[:first_nl] + "\nimport type { DeliveryChannel } from './notification-delivery';" + s[first_nl:]

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
