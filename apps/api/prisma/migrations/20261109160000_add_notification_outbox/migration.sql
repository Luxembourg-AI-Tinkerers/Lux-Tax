-- Notification outbox: one delivery row per notification and channel, retried
-- with exponential backoff by the worker.
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'PUSH');

CREATE TYPE "public"."NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "public"."notification_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "status" "public"."NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key" ON "public"."notification_deliveries"("notificationId", "channel");

CREATE INDEX "notification_deliveries_status_nextAttemptAt_idx" ON "public"."notification_deliveries"("status", "nextAttemptAt");

ALTER TABLE "public"."notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
