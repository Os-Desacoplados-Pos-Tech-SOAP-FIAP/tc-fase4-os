import { Global, Module } from '@nestjs/common';

import { PrismaTransactionManager } from './prisma-transaction.manager';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PrismaTransactionManager],
  exports: [PrismaService, PrismaTransactionManager],
})
export class DatabaseModule {}
