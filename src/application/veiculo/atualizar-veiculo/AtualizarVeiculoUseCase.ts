import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { ensureFound } from '../../ensure-found';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { IVeiculoRepository } from '../../../domain/veiculo/repositories/IVeiculoRepository';
import { Placa } from '../../../domain/veiculo/value-objects/Placa';
import { ConflitoError } from '../../errors';

interface AtualizarVeiculoInput {
  id: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
}

@Injectable()
export class AtualizarVeiculoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.VEICULO_REPOSITORY)
    private readonly veiculoRepository: IVeiculoRepository,
  ) {}

  async execute(input: AtualizarVeiculoInput): Promise<Veiculo> {
    const veiculo = ensureFound(
      await this.veiculoRepository.buscarPorId(new UniqueID(input.id)),
      'Veículo',
    );
    if (input.placa !== undefined) {
      const dono = await this.veiculoRepository.buscarPorPlaca(Placa.create(input.placa).value);
      if (dono && !dono.id.equals(veiculo.id)) {
        throw new ConflitoError('Placa já cadastrada', 'PLACA_JA_CADASTRADA');
      }
    }
    veiculo.atualizar(input);
    await this.veiculoRepository.salvar(veiculo);
    return veiculo;
  }
}
