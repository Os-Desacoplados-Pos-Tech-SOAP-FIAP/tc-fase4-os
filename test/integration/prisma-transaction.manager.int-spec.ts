import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PrismaTransactionManager } from '../../src/infrastructure/database/prisma-transaction.manager';
import { conectar, limparBanco } from '../helpers/database';

describe('PrismaTransactionManager (integração)', () => {
  let prisma: PrismaService;
  let tm: PrismaTransactionManager;

  beforeAll(async () => {
    prisma = await conectar();
    tm = new PrismaTransactionManager(prisma);
  });
  beforeEach(() => limparBanco(prisma));
  afterAll(() => prisma.$disconnect());

  it('confirma o que foi gravado pelo client da transação', async () => {
    await tm.run(() => tm.client.processedMessage.create({ data: { messageId: 'm1' } }));
    expect(await prisma.processedMessage.count()).toBe(1);
  });

  it('desfaz tudo quando o trabalho lança', async () => {
    await expect(
      tm.run(async () => {
        await tm.client.processedMessage.create({ data: { messageId: 'm1' } });
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect(await prisma.processedMessage.count()).toBe(0);
  });

  it('run aninhado reaproveita a transação externa', async () => {
    await expect(
      tm.run(async () => {
        await tm.run(() => tm.client.processedMessage.create({ data: { messageId: 'm1' } }));
        throw new Error('externa falhou');
      }),
    ).rejects.toThrow();
    expect(await prisma.processedMessage.count()).toBe(0);
  });

  it('fora de transação o client é o PrismaService', () => {
    expect(tm.client).toBe(prisma);
  });
});
