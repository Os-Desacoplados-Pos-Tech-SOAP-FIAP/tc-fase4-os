import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';

import { RolesGuard } from './common/guards/roles.guard';
import { semDadoPessoal } from './common/logging/sem-dado-pessoal';
import { validarAmbiente } from './config/env.validation';
import { JwtAuthGuard } from './infrastructure/auth/jwt-auth.guard';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClienteModule } from './modules/cliente/cliente.module';
import { HealthModule } from './modules/health/health.module';
import { InternoModule } from './modules/interno/interno.module';
import { OrdemDeServicoModule } from './modules/ordem-de-servico/ordem-de-servico.module';
import { PublicoModule } from './modules/publico/publico.module';
import { VeiculoModule } from './modules/veiculo/veiculo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        // Token JWT, cookies, Referer e o segredo da chamada interna nunca vão para o log.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.referer',
          'req.headers["x-internal-token"]',
        ],
        // CPF, documento e placa (LGPD) também não. O pino-http aplica este serializer
        // sobre o padrão (pino.stdSerializers.req).
        serializers: { req: semDadoPessoal },
        // trace_id/span_id em todo log: salto direto do log para o trace no Grafana.
        mixin() {
          const span = trace.getActiveSpan();
          if (!span) return {};
          const { traceId, spanId } = span.spanContext();
          return { trace_id: traceId, span_id: spanId };
        },
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    InfrastructureModule,
    HealthModule,
    AuthModule,
    ClienteModule,
    VeiculoModule,
    OrdemDeServicoModule,
    PublicoModule,
    InternoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
