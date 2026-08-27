-- CreateTable
CREATE TABLE "BotHealthIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botAccountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "faultNotifiedAt" TIMESTAMP(3),
    "recoveryNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotHealthIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMessageInbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botAccountId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "rawEvent" JSONB NOT NULL,
    "messageType" TEXT NOT NULL,
    "conversationKey" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotMessageInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotHealthIncident_tenantId_botAccountId_kind_resolvedAt_idx" ON "BotHealthIncident"("tenantId", "botAccountId", "kind", "resolvedAt");
CREATE INDEX "BotHealthIncident_botAccountId_kind_startedAt_idx" ON "BotHealthIncident"("botAccountId", "kind", "startedAt");
CREATE UNIQUE INDEX "BotMessageInbox_botAccountId_eventKey_key" ON "BotMessageInbox"("botAccountId", "eventKey");
CREATE INDEX "BotMessageInbox_botAccountId_status_availableAt_idx" ON "BotMessageInbox"("botAccountId", "status", "availableAt");
CREATE INDEX "BotMessageInbox_tenantId_status_availableAt_idx" ON "BotMessageInbox"("tenantId", "status", "availableAt");
CREATE INDEX "BotMessageInbox_conversationKey_status_availableAt_idx" ON "BotMessageInbox"("conversationKey", "status", "availableAt");
CREATE INDEX "BotMessageInbox_processedAt_idx" ON "BotMessageInbox"("processedAt");

-- AddForeignKey
ALTER TABLE "BotHealthIncident" ADD CONSTRAINT "BotHealthIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotHealthIncident" ADD CONSTRAINT "BotHealthIncident_botAccountId_fkey" FOREIGN KEY ("botAccountId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotMessageInbox" ADD CONSTRAINT "BotMessageInbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotMessageInbox" ADD CONSTRAINT "BotMessageInbox_botAccountId_fkey" FOREIGN KEY ("botAccountId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
