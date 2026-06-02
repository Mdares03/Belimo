-- Persist paid/unpaid annotations for computed monthly reference ledger.

CREATE TYPE "ComputedPaidStatus" AS ENUM ('PENDIENTE', 'PAGADO');

CREATE TABLE "ComputedMonthlyStatus" (
  "id" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "monthKey" TEXT NOT NULL,
  "status" "ComputedPaidStatus" NOT NULL DEFAULT 'PENDIENTE',
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ComputedMonthlyStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComputedMonthlyStatus_localId_monthKey_key" ON "ComputedMonthlyStatus"("localId", "monthKey");
CREATE INDEX "ComputedMonthlyStatus_monthKey_idx" ON "ComputedMonthlyStatus"("monthKey");

ALTER TABLE "ComputedMonthlyStatus"
  ADD CONSTRAINT "ComputedMonthlyStatus_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
