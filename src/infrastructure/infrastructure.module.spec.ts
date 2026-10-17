import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DestinosComandos } from '../application/ports/destinos-comandos';
import { INJECTION_TOKENS } from '../common/constants/injection-tokens';
import { InfrastructureModule } from './infrastructure.module';

/** O JwtStrategy lê o segredo do ConfigService, que no app vem do ConfigModule global. */
@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { getOrThrow: () => 'segredo-teste' } }],
  exports: [ConfigService],
})
class ConfigFalsoModule {}

describe('InfrastructureModule', () => {
  const compilar = () =>
    Test.createTestingModule({ imports: [ConfigFalsoModule, InfrastructureModule] }).compile();

  it('liga os 12 tokens de injeção', async () => {
    const modulo = await compilar();
    const tokens = Object.values(INJECTION_TOKENS);
    expect(tokens).toHaveLength(12);
    expect(tokens.map((token) => modulo.get(token))).not.toContain(undefined);
  });

  it('lê as filas de destino dos comandos do ambiente', async () => {
    const modulo = await compilar();
    expect(modulo.get<DestinosComandos>(INJECTION_TOKENS.DESTINOS_COMANDOS)).toEqual({
      catalog: process.env.CATALOG_COMMANDS_QUEUE_URL,
      billing: process.env.BILLING_COMMANDS_QUEUE_URL,
      execution: process.env.EXECUTION_COMMANDS_QUEUE_URL,
    });
  });
});
