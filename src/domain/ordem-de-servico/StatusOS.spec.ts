import { podeTransicionar, StatusOS, STATUS_TERMINAIS } from './StatusOS';

describe('StatusOS', () => {
  it.each([
    [StatusOS.RECEBIDA, StatusOS.EM_DIAGNOSTICO],
    [StatusOS.EM_DIAGNOSTICO, StatusOS.AGUARDANDO_APROVACAO],
    [StatusOS.AGUARDANDO_APROVACAO, StatusOS.APROVADA],
    [StatusOS.AGUARDANDO_APROVACAO, StatusOS.REPROVADA],
    [StatusOS.APROVADA, StatusOS.EM_EXECUCAO],
    [StatusOS.APROVADA, StatusOS.CANCELADA],
    [StatusOS.EM_EXECUCAO, StatusOS.FINALIZADA],
    [StatusOS.FINALIZADA, StatusOS.PAGA],
    [StatusOS.PAGA, StatusOS.ENTREGUE],
  ])('permite %s → %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(true);
  });

  it.each([
    [StatusOS.RECEBIDA, StatusOS.APROVADA],
    [StatusOS.EM_EXECUCAO, StatusOS.CANCELADA],
    [StatusOS.FINALIZADA, StatusOS.ENTREGUE],
    [StatusOS.ENTREGUE, StatusOS.PAGA],
    [StatusOS.CANCELADA, StatusOS.APROVADA],
  ])('bloqueia %s → %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(false);
  });

  it('terminais: reprovada, entregue e cancelada', () => {
    expect([...STATUS_TERMINAIS].sort()).toEqual(
      [StatusOS.CANCELADA, StatusOS.ENTREGUE, StatusOS.REPROVADA].sort(),
    );
  });
});
