import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

const resumo = (valor: string): Buffer => createHash('sha256').update(valor).digest();

/**
 * Protege as rotas /internal (chamadas da Lambda de autenticação, E11). Compara os resumos
 * SHA-256 em tempo constante: tamanhos iguais e sem vazar o segredo pelo tempo de resposta.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const recebido: unknown = context.switchToHttp().getRequest().headers['x-internal-token'];
    const esperado = this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
    if (typeof recebido !== 'string' || !timingSafeEqual(resumo(recebido), resumo(esperado))) {
      throw new UnauthorizedException('Token interno inválido');
    }
    return true;
  }
}
