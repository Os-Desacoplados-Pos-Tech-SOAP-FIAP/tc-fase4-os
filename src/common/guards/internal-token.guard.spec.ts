import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InternalTokenGuard } from './internal-token.guard';

function contexto(headers: Record<string, string | undefined>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as unknown as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  const guard = new InternalTokenGuard({ getOrThrow: () => 'segredo-interno' } as unknown as ConfigService);

  it('aceita o token certo', () => {
    expect(guard.canActivate(contexto({ 'x-internal-token': 'segredo-interno' }))).toBe(true);
  });

  it.each([[undefined], ['errado'], ['segredo-interno-com-sufixo'], ['']])('recusa %p', (valor) => {
    expect(() => guard.canActivate(contexto({ 'x-internal-token': valor }))).toThrow(UnauthorizedException);
  });
});
