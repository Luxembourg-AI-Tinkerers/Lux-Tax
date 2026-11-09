-- Notification idempotency: a repeated emission (regenerating a package,
-- approving again) must not multiply the recipient's inbox.
ALTER TABLE "public"."notifications" ADD COLUMN "dedupeKey" VARCHAR(200);

CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "public"."notifications"("userId", "dedupeKey");
