import { Entity, EntityProps } from '../../shared/Entity';
import { UniqueID } from '../../shared/UniqueID';
import { Ano } from '../value-objects/Ano';
import { Marca } from '../value-objects/Marca';
import { Modelo } from '../value-objects/Modelo';
import { Placa } from '../value-objects/Placa';

export interface VeiculoProps extends EntityProps {
  placa: Placa;
  marca: Marca;
  modelo: Modelo;
  ano: Ano;
  clienteId: UniqueID;
}

export interface NovoVeiculoInput {
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  clienteId: string;
}

export class Veiculo extends Entity<VeiculoProps> {
  private constructor(props: VeiculoProps, id?: UniqueID) {
    super(props, id);
  }

  public static criar(input: NovoVeiculoInput): Veiculo {
    const veiculo = new Veiculo({
      placa: Placa.create(input.placa),
      marca: Marca.create(input.marca),
      modelo: Modelo.create(input.modelo),
      ano: Ano.create(input.ano),
      clienteId: new UniqueID(input.clienteId),
    });
    return veiculo;
  }

  public static restaurar(props: VeiculoProps, id: UniqueID): Veiculo {
    return new Veiculo(props, id);
  }

  public get placa(): Placa {
    return this.props.placa;
  }
  public get marca(): Marca {
    return this.props.marca;
  }
  public get modelo(): Modelo {
    return this.props.modelo;
  }
  public get ano(): Ano {
    return this.props.ano;
  }
  public get clienteId(): UniqueID {
    return this.props.clienteId;
  }

  public atualizar(input: Partial<Omit<NovoVeiculoInput, 'clienteId'>>): void {
    if (input.placa !== undefined) this.props.placa = Placa.create(input.placa);
    if (input.marca !== undefined) this.props.marca = Marca.create(input.marca);
    if (input.modelo !== undefined) this.props.modelo = Modelo.create(input.modelo);
    if (input.ano !== undefined) this.props.ano = Ano.create(input.ano);
    this.touch();
  }
}
