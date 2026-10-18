import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { IClienteRepository } from '../../../domain/cliente/repositories/IClienteRepository';
import { OrdemDeServico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { ISagaRepository } from '../../../domain/saga/ISagaRepository';
import { SagaInstance } from '../../../domain/saga/SagaInstance';
import { DomainError } from '../../../domain/shared/DomainError';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { IVeiculoRepository } from '../../../domain/veiculo/repositories/IVeiculoRepository';
import { ensureFound } from '../../ensure-found';
import { DestinosComandos } from '../../ports/destinos-comandos';
import { IOutbox } from '../../ports/outbox';
import { ITransactionManager } from '../../ports/transaction-manager';
import { comandos, enviarComandos } from '../../saga/comandos-saga';
import { ISagaMetricas } from '../../saga/saga-metricas';

export interface AbrirOrdemDeServicoInput {
  clienteId: string;
  veiculoId: string;
  observacoes?: string;
}

export interface OrdemComSaga {
  os: OrdemDeServico;
  saga: SagaInstance;
}

/** Abre a OS e inicia a saga (passo 1 da spec §4.3): OS, saga e comando na mesma transação. */
@Injectable()
export class AbrirOrdemDeServicoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
    @Inject(INJECTION_TOKENS.SAGA_REPOSITORY) private readonly sagas: ISagaRepository,
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY) private readonly clientes: IClienteRepository,
    @Inject(INJECTION_TOKENS.VEICULO_REPOSITORY) private readonly veiculos: IVeiculoRepository,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.DESTINOS_COMANDOS) private readonly destinos: DestinosComandos,
    @Inject(INJECTION_TOKENS.SAGA_METRICAS) private readonly metricas: ISagaMetricas,
  ) {}

  async execute(input: AbrirOrdemDeServicoInput): Promise<OrdemComSaga> {
    ensureFound(await this.clientes.buscarPorId(new UniqueID(input.clienteId)), 'Cliente');
    const veiculo = ensureFound(await this.veiculos.buscarPorId(new UniqueID(input.veiculoId)), 'Veículo');
    if (veiculo.clienteId.toValue() !== input.clienteId) {
      throw new DomainError('Veículo informado não pertence ao cliente', 'VEICULO_NAO_PERTENCE_AO_CLIENTE');
    }

    const aberta = await this.transacao.run(async () => {
      const os = OrdemDeServico.abrir({ ...input, numero: await this.ordens.proximoNumero() });
      const saga = SagaInstance.iniciar(os.id.toValue());
      await this.ordens.salvar(os);
      await this.sagas.salvar(saga);
      await enviarComandos(this.outbox, this.destinos, os.id.toValue(), [comandos.enfileirarDiagnostico(os)]);
      return { os, saga };
    });
    this.metricas.iniciada(); // depois do commit
    return aberta;
  }
}
