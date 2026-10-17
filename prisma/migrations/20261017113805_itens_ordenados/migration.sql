-- AlterTable
ALTER TABLE "ItemOrcamento" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ItemOrcamento_seq_key" ON "ItemOrcamento"("seq");

