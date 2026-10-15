import { DomainError } from '../../shared/DomainError';
import { UniqueID } from '../../shared/UniqueID';
import { Veiculo } from './Veiculo';

const base = {
  placa: 'ABC1234',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2020,
  clienteId: new UniqueID().toValue(),
};

describe('Veiculo', () => {
  it('cria veículo com placa antiga válida', () => {
    const v = Veiculo.criar(base);
    expect(v.placa.value).toBe('ABC1234');
    expect(v.marca.value).toBe('Toyota');
  });

  it('cria veículo com placa Mercosul', () => {
    const v = Veiculo.criar({ ...base, placa: 'ABC1D23' });
    expect(v.placa.value).toBe('ABC1D23');
  });

  it('lança DomainError para placa inválida', () => {
    expect(() => Veiculo.criar({ ...base, placa: 'INVALIDA' })).toThrow(DomainError);
  });

  it('atualiza placa, marca, modelo e ano', () => {
    const v = Veiculo.criar(base);
    v.atualizar({ placa: 'XYZ9876', marca: 'Honda', modelo: 'Civic', ano: 2022 });
    expect(v.placa.value).toBe('XYZ9876');
    expect(v.marca.value).toBe('Honda');
    expect(v.ano.value).toBe(2022);
  });
});
