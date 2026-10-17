import { PrismaService } from './prisma.service';
import { PrismaTransactionManager } from './prisma-transaction.manager';

describe('PrismaTransactionManager', () => {
  const tx = { marcador: 'tx' };
  const transaction = jest.fn((work: (client: unknown) => Promise<unknown>) => work(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const tm = new PrismaTransactionManager(prisma);

  beforeEach(() => transaction.mockClear());

  it('abre a transação com timeout e maxWait explícitos', async () => {
    await tm.run(async () => 'ok');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000, maxWait: 5_000 });
  });

  it('emTransacao só é verdadeiro dentro de run', async () => {
    expect(tm.emTransacao).toBe(false);
    expect(await tm.run(async () => tm.emTransacao)).toBe(true);
    expect(tm.emTransacao).toBe(false);
  });
});
