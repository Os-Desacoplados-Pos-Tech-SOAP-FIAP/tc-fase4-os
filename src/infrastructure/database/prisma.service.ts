import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Desconecta no último hook do Nest (onModuleDestroy roda antes do beforeApplicationShutdown),
   * para que consumidor e publicador terminem o trabalho em andamento com o banco ainda conectado.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
