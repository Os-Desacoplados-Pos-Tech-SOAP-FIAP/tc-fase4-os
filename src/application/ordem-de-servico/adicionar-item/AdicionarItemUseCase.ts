import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { TipoItemOrcamento } from '../../../domain/ordem-de-servico/entities/ItemOrcamento';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { ISagaRepository } from '../../../domain/saga/ISagaRepository';
import { EtapaSaga } from '../../../domain/saga/SagaInstance';
import { DomainError } from '../../../domain/shared/DomainError';
import { ensureFound } from '../../ensure-found';
import { RecursoNaoEncontradoError } from '../../errors';
import { ICatalogo, ItemDoCatalogo } from '../../ports/catalogo';
import { ITransactionManager } from '../../ports/transaction-manager';
import { ITravaPorOs } from '../../ports/trava-por-os';
import { OrdemComSaga } from '../abrir-ordem/AbrirOrdemDeServicoUseCase';

export interface AdicionarItemInput {
  osId: string;
  tipo: TipoItemOrcamento;
  referenciaId: string;
  quantidade: number;
  /** Header Authorization de quem chamou, repassado ao Catalog. */
  autorizacao: string;
}

/**
 * Inclui um item no diagnóstico com nome e preço do Catalog (E10). A consulta ao Catalog
 * fica fora da transação (rede); a escrita trava a OS para não correr com diagnostico-concluido.
 */
@Injectable()
export class AdicionarItemUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.TRAVA_POR_OS) private readonly trava: ITravaPorOs,
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
    @Inject(INJECTION_TOKENS.SAGA_REPOSITORY) private readonly sagas: ISagaRepository,
    @Inject(INJECTION_TOKENS.CATALOGO) private readonly catalogo: ICatalogo,
  ) {}

  async execute(input: AdicionarItemInput): Promise<OrdemComSaga> {
    // Leitura simples antes do Catalog: OS inexistente é 404 mesmo com o Catalog fora.
    ensureFound(await this.ordens.buscarPorId(input.osId), 'Ordem de serviço');
    const doCatalogo = await this.buscarNoCatalogo(input);

    return this.transacao.run(async () => {
      await this.trava.travar(input.osId);
      const os = ensureFound(await this.ordens.buscarPorId(input.osId), 'Ordem de serviço');
      const saga = ensureFound(await this.sagas.buscar(input.osId), 'Saga da ordem de serviço');
      if (!saga.em(EtapaSaga.DIAGNOSTICO)) {
        throw new DomainError(
          'O orçamento desta OS já foi solicitado; não é possível incluir itens',
          'OS_ORCAMENTO_JA_SOLICITADO',
        );
      }
      os.adicionarItem({
        tipo: input.tipo,
        referenciaId: input.referenciaId,
        descricao: doCatalogo.descricao,
        quantidade: input.quantidade,
        valorUnitario: doCatalogo.valorUnitario,
      });
      await this.ordens.salvar(os);
      return { os, saga };
    });
  }

  private async buscarNoCatalogo(input: AdicionarItemInput): Promise<ItemDoCatalogo> {
    const servico = input.tipo === TipoItemOrcamento.SERVICO;
    const item = servico
      ? await this.catalogo.buscarServico(input.referenciaId, input.autorizacao)
      : await this.catalogo.buscarInsumo(input.referenciaId, input.autorizacao);
    if (!item) throw new RecursoNaoEncontradoError(servico ? 'Serviço' : 'Insumo');
    if (!item.ativo) {
      throw new DomainError(`${item.descricao} está inativo no catálogo`, 'ITEM_INATIVO_NO_CATALOGO');
    }
    return item;
  }
}
