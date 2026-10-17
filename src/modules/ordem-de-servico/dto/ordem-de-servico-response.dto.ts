import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { OrdemComSaga } from '../../../application/ordem-de-servico/abrir-ordem/AbrirOrdemDeServicoUseCase';
import { TipoItemOrcamento } from '../../../domain/ordem-de-servico/entities/ItemOrcamento';
import { OrdemDeServico, RegistroHistorico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { StatusOS } from '../../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../../domain/saga/SagaInstance';

class ItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TipoItemOrcamento }) tipo!: TipoItemOrcamento;
  @ApiProperty() referenciaId!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty() quantidade!: number;
  @ApiProperty() valorUnitario!: number;
  @ApiProperty() valorTotal!: number;
}

class OrcamentoResponseDto {
  @ApiProperty() valor!: number;
  @ApiProperty() validoAte!: Date;
}

export class ResumoOrdemDeServicoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() numero!: number;
  @ApiProperty() clienteId!: string;
  @ApiProperty() veiculoId!: string;
  @ApiProperty({ enum: StatusOS }) status!: StatusOS;
  @ApiProperty() valorTotal!: number;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty() atualizadoEm!: Date;

  static de(os: OrdemDeServico): ResumoOrdemDeServicoResponseDto {
    return {
      id: os.id.toValue(),
      numero: os.numero,
      clienteId: os.clienteId,
      veiculoId: os.veiculoId,
      status: os.status,
      valorTotal: os.valorTotal,
      criadoEm: os.criadoEm,
      atualizadoEm: os.atualizadoEm,
    };
  }
}

export class OrdemDeServicoResponseDto extends ResumoOrdemDeServicoResponseDto {
  @ApiProperty({ enum: EtapaSaga }) etapaSaga!: EtapaSaga;
  @ApiPropertyOptional({ nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: ItemResponseDto, isArray: true }) itens!: ItemResponseDto[];
  @ApiPropertyOptional({ type: OrcamentoResponseDto, nullable: true }) orcamento!: OrcamentoResponseDto | null;
  @ApiPropertyOptional({ nullable: true, description: 'Link de pagamento da cobrança atual' })
  linkPagamento!: string | null;

  static deOrdem({ os, saga }: OrdemComSaga): OrdemDeServicoResponseDto {
    return {
      ...ResumoOrdemDeServicoResponseDto.de(os),
      etapaSaga: saga.etapa,
      observacoes: os.observacoes,
      itens: os.itens.map((item) => ({
        id: item.id.toValue(),
        tipo: item.tipo,
        referenciaId: item.referenciaId,
        descricao: item.descricao,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        valorTotal: item.valorTotal,
      })),
      orcamento: os.orcamento,
      linkPagamento: os.linkPagamento,
    };
  }
}

export class RegistroHistoricoResponseDto {
  @ApiPropertyOptional({ enum: StatusOS, nullable: true }) de!: StatusOS | null;
  @ApiProperty({ enum: StatusOS }) para!: StatusOS;
  @ApiPropertyOptional({ nullable: true }) motivo!: string | null;
  @ApiProperty() em!: Date;

  static de(registro: RegistroHistorico): RegistroHistoricoResponseDto {
    return { ...registro };
  }
}
