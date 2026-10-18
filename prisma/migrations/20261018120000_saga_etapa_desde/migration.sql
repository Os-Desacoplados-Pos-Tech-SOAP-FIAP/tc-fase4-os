-- Entrada na etapa atual da saga. Linhas existentes: o melhor valor disponível é a última
-- gravação (atualizadoEm).
ALTER TABLE "SagaInstance" ADD COLUMN "etapaDesde" TIMESTAMP(3);
UPDATE "SagaInstance" SET "etapaDesde" = "atualizadoEm";
ALTER TABLE "SagaInstance" ALTER COLUMN "etapaDesde" SET NOT NULL;
