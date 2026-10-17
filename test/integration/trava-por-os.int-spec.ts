import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PrismaTransactionManager } from '../../src/infrastructure/database/prisma-transaction.manager';
import { PrismaTravaPorOs } from '../../src/infrastructure/repositories/PrismaTravaPorOs';
import { conectar } from '../helpers/database';

const OS_A = '55555555-5555-4555-8555-555555555555';
const OS_B = '66666666-6666-4666-8666-666666666666';
const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function esperarAte(condicao: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condicao(); i++) await pausa(20);
  if (!condicao()) throw new Error('condição não atingida');
}

describe('PrismaTravaPorOs', () => {
  let prisma: PrismaService;
  let tm: PrismaTransactionManager;
  let trava: PrismaTravaPorOs;

  beforeAll(async () => {
    prisma = await conectar();
    tm = new PrismaTransactionManager(prisma);
    trava = new PrismaTravaPorOs(tm);
  });

  afterAll(() => prisma.$disconnect());

  async function segurarTrava(osId: string, eventos: string[]) {
    let liberar!: () => void;
    const solta = new Promise<void>((resolve) => (liberar = resolve));
    const transacao = tm.run(async () => {
      await trava.travar(osId);
      eventos.push('1-travou');
      await solta;
      eventos.push('1-fim');
    });
    await esperarAte(() => eventos.includes('1-travou'));
    return { liberar, transacao };
  }

  it('serializa duas transações da mesma OS até o commit da primeira', async () => {
    const eventos: string[] = [];
    const primeira = await segurarTrava(OS_A, eventos);
    const segunda = tm.run(async () => {
      await trava.travar(OS_A);
      eventos.push('2-travou');
    });
    await pausa(300);
    expect(eventos).toEqual(['1-travou']);

    primeira.liberar();
    await Promise.all([primeira.transacao, segunda]);
    expect(eventos).toEqual(['1-travou', '1-fim', '2-travou']);
  });

  it('OS diferentes não esperam uma pela outra', async () => {
    const eventos: string[] = [];
    const primeira = await segurarTrava(OS_A, eventos);
    await tm.run(async () => {
      await trava.travar(OS_B);
      eventos.push('2-travou');
    });
    expect(eventos).toEqual(['1-travou', '2-travou']);
    primeira.liberar();
    await primeira.transacao;
  });
});
