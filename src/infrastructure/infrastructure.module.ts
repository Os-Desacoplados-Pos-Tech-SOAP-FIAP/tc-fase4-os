import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { INJECTION_TOKENS } from '../common/constants/injection-tokens';
import { lerConfigCatalogo, lerDestinosComandos } from '../config/os.config';
import { BcryptHashProvider } from './auth/bcrypt-hash.provider';
import { JwtStrategy } from './auth/jwt.strategy';
import { CatalogoHttp, CONFIG_CATALOGO } from './catalogo/catalogo-http';
import { DatabaseModule } from './database/database.module';
import { PrismaTransactionManager } from './database/prisma-transaction.manager';
import { MessagingModule } from './messaging/messaging.module';
import { PrismaClienteRepository } from './repositories/PrismaClienteRepository';
import { PrismaOrdemDeServicoRepository } from './repositories/PrismaOrdemDeServicoRepository';
import { PrismaOutbox } from './repositories/PrismaOutbox';
import { PrismaProcessedMessageRepository } from './repositories/PrismaProcessedMessageRepository';
import { PrismaSagaRepository } from './repositories/PrismaSagaRepository';
import { PrismaTravaPorOs } from './repositories/PrismaTravaPorOs';
import { PrismaUsuarioRepository } from './repositories/PrismaUsuarioRepository';
import { PrismaVeiculoRepository } from './repositories/PrismaVeiculoRepository';
import { GaugeOsPorStatus, MetricasSaga } from './telemetry/metricas-saga';

const bindings = [
  { provide: INJECTION_TOKENS.USUARIO_REPOSITORY, useClass: PrismaUsuarioRepository },
  { provide: INJECTION_TOKENS.CLIENTE_REPOSITORY, useClass: PrismaClienteRepository },
  { provide: INJECTION_TOKENS.VEICULO_REPOSITORY, useClass: PrismaVeiculoRepository },
  {
    provide: INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY,
    useClass: PrismaOrdemDeServicoRepository,
  },
  { provide: INJECTION_TOKENS.SAGA_REPOSITORY, useClass: PrismaSagaRepository },
  {
    provide: INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY,
    useClass: PrismaProcessedMessageRepository,
  },
  { provide: INJECTION_TOKENS.OUTBOX, useClass: PrismaOutbox },
  { provide: INJECTION_TOKENS.TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
  { provide: INJECTION_TOKENS.TRAVA_POR_OS, useClass: PrismaTravaPorOs },
  { provide: INJECTION_TOKENS.HASH_PROVIDER, useClass: BcryptHashProvider },
  { provide: INJECTION_TOKENS.CATALOGO, useClass: CatalogoHttp },
  {
    provide: INJECTION_TOKENS.DESTINOS_COMANDOS,
    useFactory: () => lerDestinosComandos(process.env),
  },
  { provide: INJECTION_TOKENS.SAGA_METRICAS, useClass: MetricasSaga },
];

@Global()
@Module({
  imports: [DatabaseModule, MessagingModule, PassportModule],
  providers: [
    ...bindings,
    { provide: CONFIG_CATALOGO, useFactory: () => lerConfigCatalogo(process.env) },
    JwtStrategy,
    GaugeOsPorStatus,
  ],
  exports: bindings.map((binding) => binding.provide),
})
export class InfrastructureModule {}
