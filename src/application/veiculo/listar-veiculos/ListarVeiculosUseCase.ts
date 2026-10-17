import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { IVeiculoRepository } from '../../../domain/veiculo/repositories/IVeiculoRepository';

@Injectable()
export class ListarVeiculosUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.VEICULO_REPOSITORY)
    private readonly veiculoRepository: IVeiculoRepository,
  ) {}

  async execute(clienteId?: string): Promise<Veiculo[]> {
    if (clienteId) return this.veiculoRepository.listarPorCliente(new UniqueID(clienteId));
    return this.veiculoRepository.listar();
  }
}
