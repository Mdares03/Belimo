-- Feature batch foundation: logo storage + valve command state + command audit trail.

CREATE TYPE "ValveCommandedState" AS ENUM ('ON', 'OFF');

ALTER TABLE "Building"
  ADD COLUMN "logoPath" TEXT,
  ADD COLUMN "logoMime" TEXT,
  ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Valve"
  ADD COLUMN "commandedState" "ValveCommandedState",
  ADD COLUMN "lastCommandAt" TIMESTAMP(3),
  ADD COLUMN "lastCommandBy" TEXT,
  ADD COLUMN "lastCommandResult" TEXT;

CREATE TABLE "ValveCommandAudit" (
  "id" TEXT NOT NULL,
  "valveId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "requestedState" "ValveCommandedState" NOT NULL,
  "requestHash" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ValveCommandAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ValveCommandAudit_valveId_createdAt_idx" ON "ValveCommandAudit"("valveId", "createdAt");

ALTER TABLE "ValveCommandAudit"
  ADD CONSTRAINT "ValveCommandAudit_valveId_fkey"
  FOREIGN KEY ("valveId") REFERENCES "Valve"("id") ON DELETE CASCADE ON UPDATE CASCADE;
