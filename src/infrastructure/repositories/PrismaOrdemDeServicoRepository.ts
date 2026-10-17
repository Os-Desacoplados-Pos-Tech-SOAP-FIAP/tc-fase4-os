import { Injectable } from '@nestjs/common';
import {
  HistoricoStatus as HistoricoRow,
  ItemOrcamento as ItemRow,
  OrdemDeServico as OrdemRow,
  StatusOS as StatusOSRow,
  TipoItemOrcamento as TipoItemRow,
} from '@prisma/client';

import { ConcorrenciaError } from '../../application/errors';
import { ItemOrcamento, TipoItemOrcamento } from '../../domain/ordem-de-servico/entities/ItemOrcamento';
import {
  OrdemDeServico,
  RegistroHistorico,
} from '../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { UniqueID } from '../../domain/shared/UniqueID';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

type OrdemComItens = OrdemRow & { itens: ItemRow[] };

const COM_ITENS = { itens: { orderBy: [{ criadoEm: 'asc' as const }, { id: 'asc' as const }] } };

@Injectable()
export class PrismaOrdemDeServicoRepository implements IOrdemDeServicoRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  async proximoNumero(): Promise<number> {
    const [{ numero }] = await this.db.client.$queryRaw<{ numero: bigint }[]>`
      SELECT nextval(pg_get_serial_sequence('"OrdemDeServico"', 'numero')) AS "numero"`;
    return Number(numero);
  }

  /** OS, itens e histórico numa transação só (aninha na corrente, se houver). */
  async salvar(os: OrdemDeServico): Promise<void> {
    await this.db.run(async () => {
      await this.gravarOrdem(os);
      await this.gravarItens(os);
      await this.gravarHistorico(os);
    });
    os.confirmarHistorico();
  }

  async buscarPorId(id: string): Promise<OrdemDeServico | null> {
    const row = await this.db.client.ordemDeServico.findUnique({ where: { id }, include: COM_ITENS });
    return row ? paraDominio(row) : null;
  }

  async buscarPorNumero(numero: number): Promise<OrdemDeServico | null> {
    const row = await this.db.client.ordemDeServico.findUnique({ where: { numero }, include: COM_ITENS });
    return row ? paraDominio(row) : null;
  }

  async listar(filtro: { status?: StatusOS }): Promise<OrdemDeServico[]> {
    const rows = await this.db.client.ordemDeServico.findMany({
      where: filtro.status ? { status: StatusOSRow[filtro.status] } : undefined,
      include: COM_ITENS,
      orderBy: { numero: 'desc' },
    });
    return rows.map(paraDominio);
  }

  async historico(osId: string): Promise<RegistroHistorico[]> {
    const rows = await this.db.client.historicoStatus.findMany({
      where: { osId },
      orderBy: { id: 'asc' },
    });
    return rows.map(paraRegistro);
  }

  private async gravarOrdem(os: OrdemDeServico): Promise<void> {
    const mutaveis = {
      status: StatusOSRow[os.status],
      valorOrcamento: os.orcamento?.valor ?? null,
      orcamentoValidoAte: os.orcamento?.validoAte ?? null,
      linkPagamento: os.linkPagamento,
    };
    if (os.versao === 0) {
      await this.db.client.ordemDeServico.create({
        data: {
          id: os.id.toValue(),
          numero: os.numero,
          clienteId: os.clienteId,
          veiculoId: os.veiculoId,
          observacoes: os.observacoes,
          versao: 1,
          ...mutaveis,
        },
      });
      return;
    }
    const { count } = await this.db.client.ordemDeServico.updateMany({
      where: { id: os.id.toValue(), versao: os.versao },
      data: { ...mutaveis, versao: { increment: 1 } },
    });
    if (count === 0) throw new ConcorrenciaError('Ordem de serviço');
  }

  /** Itens só entram ou têm a quantidade aumentada (OrdemDeServico.adicionarItem). */
  private async gravarItens(os: OrdemDeServico): Promise<void> {
    for (const item of os.itens) {
      await this.db.client.itemOrcamento.upsert({
        where: { id: item.id.toValue() },
        create: {
          id: item.id.toValue(),
          osId: os.id.toValue(),
          tipo: TipoItemRow[item.tipo],
          referenciaId: item.referenciaId,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          criadoEm: item.criadoEm,
        },
        update: { quantidade: item.quantidade },
      });
    }
  }

  private async gravarHistorico(os: OrdemDeServico): Promise<void> {
    const pendentes = os.historicoPendente;
    if (pendentes.length === 0) return;
    await this.db.client.historicoStatus.createMany({
      data: pendentes.map((registro) => ({
        osId: os.id.toValue(),
        de: registro.de ? StatusOSRow[registro.de] : null,
        para: StatusOSRow[registro.para],
        motivo: registro.motivo,
        em: registro.em,
      })),
    });
  }
}

function paraDominio(row: OrdemComItens): OrdemDeServico {
  return OrdemDeServico.restaurar(
    {
      numero: row.numero,
      clienteId: row.clienteId,
      veiculoId: row.veiculoId,
      status: StatusOS[row.status],
      observacoes: row.observacoes,
      itens: row.itens.map(paraItem),
      orcamento:
        row.valorOrcamento && row.orcamentoValidoAte
          ? { valor: row.valorOrcamento.toNumber(), validoAte: row.orcamentoValidoAte }
          : null,
      linkPagamento: row.linkPagamento,
      versao: row.versao,
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    },
    new UniqueID(row.id),
  );
}

function paraItem(row: ItemRow): ItemOrcamento {
  return ItemOrcamento.restaurar(
    {
      tipo: TipoItemOrcamento[row.tipo],
      referenciaId: row.referenciaId,
      descricao: row.descricao,
      quantidade: row.quantidade,
      valorUnitario: row.valorUnitario.toNumber(),
      criadoEm: row.criadoEm,
    },
    new UniqueID(row.id),
  );
}

function paraRegistro(row: HistoricoRow): RegistroHistorico {
  return {
    de: row.de ? StatusOS[row.de] : null,
    para: StatusOS[row.para],
    motivo: row.motivo,
    em: row.em,
  };
}
