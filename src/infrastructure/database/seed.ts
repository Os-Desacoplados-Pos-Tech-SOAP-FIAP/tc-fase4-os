import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const SEED = {
  admin: '0a000000-0000-4000-8000-000000000001',
  atendente: '0a000000-0000-4000-8000-000000000002',
  mecanico: '0a000000-0000-4000-8000-000000000003',
  cliente: '0c000000-0000-4000-8000-000000000001',
  veiculo: '0d000000-0000-4000-8000-000000000001',
} as const;

function senha(variavel: string, padraoLocal: string): string {
  const valor = process.env[variavel];
  if (valor) return valor;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${variavel} é obrigatória em produção`);
  }
  return padraoLocal;
}

async function usuario(id: string, nome: string, email: string, perfil: 'ADMINISTRADOR' | 'ATENDENTE' | 'MECANICO', senhaPura: string) {
  await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { id, nome, email, perfil, senha: await bcrypt.hash(senhaPura, 12) },
  });
}

async function main(): Promise<void> {
  const senhaAdmin = senha('SEED_SENHA_ADMIN', 'admin123');
  const senhaPadrao = senha('SEED_SENHA_PADRAO', 'senha123');

  await usuario(SEED.admin, 'Administrador', 'admin@oficina.local', 'ADMINISTRADOR', senhaAdmin);
  await usuario(SEED.atendente, 'Atendente', 'atendente@oficina.local', 'ATENDENTE', senhaPadrao);
  await usuario(SEED.mecanico, 'Mecânico', 'mecanico@oficina.local', 'MECANICO', senhaPadrao);

  await prisma.cliente.upsert({
    where: { documento: '52998224725' },
    update: {},
    create: {
      id: SEED.cliente,
      tipo: 'PF',
      documento: '52998224725',
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
      telefone: '11987654321',
    },
  });
  await prisma.veiculo.upsert({
    where: { placa: 'BRA2E19' },
    update: {},
    create: { id: SEED.veiculo, placa: 'BRA2E19', marca: 'Volkswagen', modelo: 'Polo', ano: 2021, clienteId: SEED.cliente },
  });

  console.log('Seed do OS aplicado: admin, atendente, mecânico, 1 cliente com veículo');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
