import { PrismaService } from '../../src/infrastructure/database/prisma.service';

export async function conectar(): Promise<PrismaService> {
  const prisma = new PrismaService();
  await prisma.$connect();
  return prisma;
}

function nomeDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return '';
  return new URL(url).pathname.replace(/^\//, '');
}

export async function limparBanco(prisma: PrismaService): Promise<void> {
  const banco = nomeDoBanco();
  if (!banco.endsWith('_test')) {
    throw new Error(`limparBanco recusado: o banco "${banco}" não termina com "_test"`);
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "HistoricoStatus", "ItemOrcamento", "OrdemDeServico", "SagaInstance", "Veiculo", "Cliente", "Usuario", "Outbox", "ProcessedMessage" CASCADE',
  );
}
