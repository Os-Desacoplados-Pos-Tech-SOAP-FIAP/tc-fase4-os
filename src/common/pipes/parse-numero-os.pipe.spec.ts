import { BadRequestException } from '@nestjs/common';

import { NUMERO_OS_MAXIMO, ParseNumeroOsPipe } from './parse-numero-os.pipe';

describe('ParseNumeroOsPipe', () => {
  const pipe = new ParseNumeroOsPipe();

  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', NUMERO_OS_MAXIMO],
  ])('aceita %s', (entrada, esperado) => {
    expect(pipe.transform(entrada)).toBe(esperado);
  });

  it.each(['0', '-1', '2147483648', '99999999999999999999', '1.5', 'abc', '', '12abc', ' 7'])(
    'recusa %p com 400',
    (entrada) => {
      expect(() => pipe.transform(entrada)).toThrow(BadRequestException);
    },
  );
});
