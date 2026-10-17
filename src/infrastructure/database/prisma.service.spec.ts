import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from './database.module';
import { PrismaService } from './prisma.service';

@Injectable()
class DrenagemNoShutdown implements BeforeApplicationShutdown {
  desconectadoAntesDaDrenagem?: boolean;

  constructor(private readonly prisma: PrismaService) {}

  async beforeApplicationShutdown(): Promise<void> {
    this.desconectadoAntesDaDrenagem = jest.mocked(this.prisma.$disconnect).mock.calls.length > 0;
  }
}

describe('PrismaService (encerramento)', () => {
  it('só desconecta depois do beforeApplicationShutdown (consumidor e publicador drenam antes)', async () => {
    jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue();
    const desconectar = jest.spyOn(PrismaService.prototype, '$disconnect').mockResolvedValue();

    const modulo = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [DrenagemNoShutdown],
    }).compile();
    await modulo.init();
    await modulo.close();

    expect(modulo.get(DrenagemNoShutdown).desconectadoAntesDaDrenagem).toBe(false);
    expect(desconectar).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});
