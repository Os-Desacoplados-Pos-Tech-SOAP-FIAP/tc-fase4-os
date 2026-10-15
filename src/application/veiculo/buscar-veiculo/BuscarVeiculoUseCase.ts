import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { ensureFound } from '../../ensure-found';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { IVeiculoRepository } from '../../../domain/veiculo/repositories/IVeiculoRepository';

@Injectable()
export class BuscarVeiculoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.VEICULO_REPOSITORY)
    private readonly veiculoRepository: IVeiculoRepository,
  ) {}

  async porId(id: string): Promise<Veiculo> {
    return ensureFound(await this.veiculoRepository.buscarPorId(new UniqueID(id)), 'Veículo');
  }

  async porPlaca(placa: string): Promise<Veiculo> {
    return ensureFound(await this.veiculoRepository.buscarPorPlaca(placa), 'Veículo');
  }
}
