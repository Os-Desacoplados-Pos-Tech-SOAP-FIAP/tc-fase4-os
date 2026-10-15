import { DomainError } from '../../shared/DomainError';
import { Placa } from './Placa';

describe('Placa', () => {
  it('aceita formato antigo com hífen', () => {
    const p = Placa.create('ABC-1234');
    expect(p.value).toBe('ABC1234');
    expect(p.format()).toBe('ABC-1234');
  });

  it('aceita formato antigo sem hífen', () => {
    const p = Placa.create('ABC1234');
    expect(p.format()).toBe('ABC-1234');
  });

  it('aceita formato Mercosul', () => {
    const p = Placa.create('ABC1D23');
    expect(p.value).toBe('ABC1D23');
    expect(p.format()).toBe('ABC1D23');
  });

  it('rejeita placa inválida', () => {
    expect(() => Placa.create('A1B2C3D')).toThrow(DomainError);
    expect(() => Placa.create('XYZ')).toThrow(DomainError);
  });
});
