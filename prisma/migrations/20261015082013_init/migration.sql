-- CreateEnum
CREATE TYPE "PerfilAcesso" AS ENUM ('ADMINISTRADOR', 'ATENDENTE', 'MECANICO');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('RECEBIDA', 'EM_DIAGNOSTICO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'EM_EXECUCAO', 'FINALIZADA', 'PAGA', 'ENTREGUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoItemOrcamento" AS ENUM ('SERVICO', 'INSUMO');

-- CreateEnum
CREATE TYPE "EtapaSaga" AS ENUM ('DIAGNOSTICO', 'ORCAMENTO', 'RESERVA', 'EXECUCAO_SOLICITADA', 'EXECUCAO', 'COBRANCA', 'CONCLUIDA', 'ENCERRADA', 'COMPENSANDO_RESERVAS', 'COMPENSANDO_ORCAMENTO', 'COMPENSADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "perfil" "PerfilAcesso" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL,
    "documento" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Veiculo" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeServico" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "clienteId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "status" "StatusOS" NOT NULL,
    "observacoes" TEXT,
    "valorOrcamento" DECIMAL(10,2),
    "orcamentoValidoAte" TIMESTAMP(3),
    "linkPagamento" TEXT,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemDeServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrcamento" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "tipo" "TipoItemOrcamento" NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoStatus" (
    "id" SERIAL NOT NULL,
    "osId" TEXT NOT NULL,
    "de" "StatusOS",
    "para" "StatusOS" NOT NULL,
    "motivo" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SagaInstance" (
    "osId" TEXT NOT NULL,
    "etapa" "EtapaSaga" NOT NULL,
    "motivoCompensacao" TEXT,
    "versao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SagaInstance_pkey" PRIMARY KEY ("osId")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "traceparent" TEXT,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "messageId" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_documento_key" ON "Cliente"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "Veiculo"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeServico_numero_key" ON "OrdemDeServico"("numero");

-- CreateIndex
CREATE INDEX "OrdemDeServico_status_idx" ON "OrdemDeServico"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ItemOrcamento_osId_tipo_referenciaId_key" ON "ItemOrcamento"("osId", "tipo", "referenciaId");

-- CreateIndex
CREATE INDEX "HistoricoStatus_osId_em_idx" ON "HistoricoStatus"("osId", "em");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_seq_key" ON "Outbox"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_messageId_key" ON "Outbox"("messageId");

-- CreateIndex
CREATE INDEX "Outbox_publicadoEm_seq_idx" ON "Outbox"("publicadoEm", "seq");

-- AddForeignKey
ALTER TABLE "Veiculo" ADD CONSTRAINT "Veiculo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeServico" ADD CONSTRAINT "OrdemDeServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeServico" ADD CONSTRAINT "OrdemDeServico_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemDeServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemDeServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice parcial (o schema Prisma não expressa índice com WHERE).
-- Seleção de cabeças da outbox: DISTINCT ON "groupId" ORDER BY "groupId", "seq" só entre pendentes.
CREATE INDEX "Outbox_pendentes_grupo_idx" ON "Outbox"("groupId", "seq") WHERE "publicadoEm" IS NULL;
