ALTER TABLE "Invoice"
  ADD COLUMN "periodStartTs" TIMESTAMP(3),
  ADD COLUMN "periodEndTs" TIMESTAMP(3),
  ADD COLUMN "startReadingTs" TIMESTAMP(3),
  ADD COLUMN "endReadingTs" TIMESTAMP(3),
  ADD COLUMN "startReadingId" TEXT,
  ADD COLUMN "endReadingId" TEXT,
  ADD COLUMN "anomalies" JSONB;
