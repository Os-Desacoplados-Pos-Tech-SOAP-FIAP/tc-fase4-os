import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Maior número de OS aceito: a coluna `numero` é `INTEGER` (int32) no Postgres. */
export const NUMERO_OS_MAXIMO = 2_147_483_647;

const APENAS_DIGITOS = /^\d+$/;

/** Converte o número da OS vindo da rota, aceitando só inteiros de 1 a 2147483647 (fora disso, 400). */
@Injectable()
export class ParseNumeroOsPipe implements PipeTransform<string, number> {
  transform(valor: string): number {
    const numero = APENAS_DIGITOS.test(valor) ? Number(valor) : Number.NaN;
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > NUMERO_OS_MAXIMO) {
      throw new BadRequestException(`Número de OS inválido: use um inteiro de 1 a ${NUMERO_OS_MAXIMO}`);
    }
    return numero;
  }
}
