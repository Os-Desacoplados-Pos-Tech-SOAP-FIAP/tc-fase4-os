import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';

/** Cliente PF e veículo gravados direto no banco (sem passar pelos casos de uso). */
export async function criarClienteComVeiculo(
  prisma: PrismaService,
  documento = '52998224725',
  placa = 'ABC1D23',
): Promise<{ clienteId: string; veiculoId: string }> {
  const clienteId = randomUUID();
  const veiculoId = randomUUID();
  await prisma.cliente.create({
    data: { id: clienteId, tipo: 'PF', documento, nome: 'Maria Souza', email: 'maria@example.com' },
  });
  await prisma.veiculo.create({
    data: { id: veiculoId, placa, marca: 'Fiat', modelo: 'Argo', ano: 2022, clienteId },
  });
  return { clienteId, veiculoId };
}
