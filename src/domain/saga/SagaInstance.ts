import { DomainError } from '../shared/DomainError';
import { UniqueID } from '../shared/UniqueID';

export enum EtapaSaga {
  DIAGNOSTICO = 'DIAGNOSTICO',
  ORCAMENTO = 'ORCAMENTO',
  RESERVA = 'RESERVA',
  EXECUCAO_SOLICITADA = 'EXECUCAO_SOLICITADA',
  /** Pivô atingido: daqui em diante não há compensação, só retentativa (spec §4.5). */
  EXECUCAO = 'EXECUCAO',
  COBRANCA = 'COBRANCA',
  CONCLUIDA = 'CONCLUIDA',
  ENCERRADA = 'ENCERRADA',
  COMPENSANDO_RESERVAS = 'COMPENSANDO_RESERVAS',
  COMPENSANDO_ORCAMENTO = 'COMPENSANDO_ORCAMENTO',
  COMPENSADA = 'COMPENSADA',
}

const TRANSICOES: Readonly<Record<EtapaSaga, readonly EtapaSaga[]>> = {
  [EtapaSaga.DIAGNOSTICO]: [EtapaSaga.ORCAMENTO],
  [EtapaSaga.ORCAMENTO]: [EtapaSaga.RESERVA, EtapaSaga.ENCERRADA],
  [EtapaSaga.RESERVA]: [EtapaSaga.EXECUCAO_SOLICITADA, EtapaSaga.COMPENSANDO_ORCAMENTO],
  [EtapaSaga.EXECUCAO_SOLICITADA]: [EtapaSaga.EXECUCAO, EtapaSaga.COMPENSANDO_RESERVAS],
  [EtapaSaga.EXECUCAO]: [EtapaSaga.COBRANCA],
  [EtapaSaga.COBRANCA]: [EtapaSaga.CONCLUIDA],
  [EtapaSaga.COMPENSANDO_RESERVAS]: [EtapaSaga.COMPENSANDO_ORCAMENTO],
  [EtapaSaga.COMPENSANDO_ORCAMENTO]: [EtapaSaga.COMPENSADA],
  [EtapaSaga.CONCLUIDA]: [],
  [EtapaSaga.ENCERRADA]: [],
  [EtapaSaga.COMPENSADA]: [],
};

const COMPENSACOES: ReadonlySet<EtapaSaga> = new Set([
  EtapaSaga.COMPENSANDO_RESERVAS,
  EtapaSaga.COMPENSANDO_ORCAMENTO,
]);

const POS_PIVO: ReadonlySet<EtapaSaga> = new Set([
  EtapaSaga.EXECUCAO,
  EtapaSaga.COBRANCA,
  EtapaSaga.CONCLUIDA,
]);

export interface SagaInstanceProps {
  osId: string;
  etapa: EtapaSaga;
  /** Código da falha que disparou a compensação (define o texto enviado ao cliente). */
  codigoCompensacao: string | null;
  /** Detalhe técnico legível da falha (histórico da OS). */
  motivoCompensacao: string | null;
  /** Versão lida do banco (0 = ainda não persistida). */
  versao: number;
}

/** Estado do orquestrador de uma OS (id = osId). Só guarda a etapa; quem decide é o orquestrador. */
export class SagaInstance {
  private constructor(private readonly props: SagaInstanceProps) {}

  public static iniciar(osId: string): SagaInstance {
    return new SagaInstance({ osId: new UniqueID(osId).toValue(), etapa: EtapaSaga.DIAGNOSTICO, codigoCompensacao: null, motivoCompensacao: null, versao: 0 });
  }

  public static restaurar(props: SagaInstanceProps): SagaInstance {
    return new SagaInstance({ ...props });
  }

  public get osId(): string {
    return this.props.osId;
  }
  public get etapa(): EtapaSaga {
    return this.props.etapa;
  }
  public get codigoCompensacao(): string | null {
    return this.props.codigoCompensacao;
  }
  public get motivoCompensacao(): string | null {
    return this.props.motivoCompensacao;
  }
  public get versao(): number {
    return this.props.versao;
  }
  public get terminada(): boolean {
    return TRANSICOES[this.props.etapa].length === 0;
  }
  public get pivoAtingido(): boolean {
    return POS_PIVO.has(this.props.etapa);
  }

  public em(...etapas: EtapaSaga[]): boolean {
    return etapas.includes(this.props.etapa);
  }

  /** Entrar em compensação vindo do fluxo normal exige `compensar` (que guarda o motivo). */
  public avancar(para: EtapaSaga): void {
    this.validarTransicao(para);
    if (COMPENSACOES.has(para) && !COMPENSACOES.has(this.props.etapa)) {
      throw new DomainError(
        `Entrada em ${para} exige motivo; use compensar em vez de avancar`,
        'SAGA_COMPENSACAO_SEM_MOTIVO',
      );
    }
    this.props.etapa = para;
  }

  /** Entra numa etapa de compensação guardando o código da falha e o motivo técnico. */
  public compensar(para: EtapaSaga, codigo: string, motivo: string): void {
    if (!COMPENSACOES.has(para)) {
      throw new DomainError(`${para} não é etapa de compensação`, 'SAGA_COMPENSACAO_INVALIDA');
    }
    this.validarTransicao(para);
    this.props.etapa = para;
    this.props.codigoCompensacao = codigo;
    this.props.motivoCompensacao = motivo;
  }

  private validarTransicao(para: EtapaSaga): void {
    if (!TRANSICOES[this.props.etapa].includes(para)) {
      throw new DomainError(
        `Saga não pode ir de ${this.props.etapa} para ${para}`,
        'SAGA_TRANSICAO_INVALIDA',
      );
    }
  }
}
