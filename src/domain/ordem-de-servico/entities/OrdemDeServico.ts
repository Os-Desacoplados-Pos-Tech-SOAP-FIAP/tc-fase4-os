import { DomainError } from '../../shared/DomainError';
import { Entity, EntityProps } from '../../shared/Entity';
import { UniqueID } from '../../shared/UniqueID';
import { podeTransicionar, StatusOS, STATUS_TERMINAIS } from '../StatusOS';
import { ItemOrcamento, NovoItemOrcamento, TipoItemOrcamento } from './ItemOrcamento';

/** Cópia desacoplada do item interno, para que quem lê a OS não consiga alterá-la. */
function copiarItem(item: ItemOrcamento): ItemOrcamento {
  return ItemOrcamento.restaurar(
    {
      tipo: item.tipo,
      referenciaId: item.referenciaId,
      descricao: item.descricao,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      criadoEm: new Date(item.criadoEm),
      atualizadoEm: new Date(item.atualizadoEm),
    },
    item.id,
  );
}

/** Limite do Decimal(10,2) do Billing (D13 da Etapa 4). */
export const VALOR_TOTAL_MAXIMO_EM_CENTAVOS = 9_999_999_999;

export interface RegistroHistorico {
  /** null só no registro de abertura. */
  de: StatusOS | null;
  para: StatusOS;
  motivo: string | null;
  em: Date;
}

export interface OrcamentoDaOS {
  valor: number;
  validoAte: Date;
}

export interface NovaOrdemDeServico {
  numero: number;
  clienteId: string;
  veiculoId: string;
  observacoes?: string;
}

export interface OrdemDeServicoProps extends EntityProps {
  numero: number;
  clienteId: string;
  veiculoId: string;
  status: StatusOS;
  observacoes: string | null;
  itens: ItemOrcamento[];
  orcamento: OrcamentoDaOS | null;
  linkPagamento: string | null;
  /** Versão lida do banco (0 = ainda não persistida). */
  versao: number;
}

/**
 * Agregado da OS: guarda as regras de status (spec §4.1). Quem chama os métodos é a saga
 * (eventos) ou a entrega (REST); cada transição vira um registro de histórico pendente,
 * gravado pelo repositório junto com a OS.
 */
export class OrdemDeServico extends Entity<OrdemDeServicoProps> {
  private registrosPendentes: RegistroHistorico[] = [];

  private constructor(props: OrdemDeServicoProps, id?: UniqueID) {
    super(props, id);
  }

  public static abrir(nova: NovaOrdemDeServico): OrdemDeServico {
    if (!Number.isInteger(nova.numero) || nova.numero < 1) {
      throw new DomainError('Número da OS inválido', 'OS_NUMERO_INVALIDO');
    }
    const observacoes = nova.observacoes?.trim();
    const os = new OrdemDeServico({
      numero: nova.numero,
      clienteId: new UniqueID(nova.clienteId).toValue(),
      veiculoId: new UniqueID(nova.veiculoId).toValue(),
      status: StatusOS.RECEBIDA,
      observacoes: observacoes || null,
      itens: [],
      orcamento: null,
      linkPagamento: null,
      versao: 0,
    });
    os.registrar(null, StatusOS.RECEBIDA, 'OS aberta');
    return os;
  }

  public static restaurar(props: OrdemDeServicoProps, id: UniqueID): OrdemDeServico {
    const orcamento = props.orcamento && { ...props.orcamento, validoAte: new Date(props.orcamento.validoAte) };
    return new OrdemDeServico({ ...props, itens: [...props.itens], orcamento }, id);
  }

  public get numero(): number {
    return this.props.numero;
  }
  public get clienteId(): string {
    return this.props.clienteId;
  }
  public get veiculoId(): string {
    return this.props.veiculoId;
  }
  public get status(): StatusOS {
    return this.props.status;
  }
  public get observacoes(): string | null {
    return this.props.observacoes;
  }
  public get itens(): readonly ItemOrcamento[] {
    return this.props.itens.map(copiarItem);
  }
  public get itensDeServico(): ItemOrcamento[] {
    return this.props.itens.filter((item) => item.tipo === TipoItemOrcamento.SERVICO).map(copiarItem);
  }
  public get itensDeInsumo(): ItemOrcamento[] {
    return this.props.itens.filter((item) => item.tipo === TipoItemOrcamento.INSUMO).map(copiarItem);
  }
  public get orcamento(): OrcamentoDaOS | null {
    const orcamento = this.props.orcamento;
    return orcamento && { valor: orcamento.valor, validoAte: new Date(orcamento.validoAte) };
  }
  public get linkPagamento(): string | null {
    return this.props.linkPagamento;
  }
  public get versao(): number {
    return this.props.versao;
  }
  public get terminal(): boolean {
    return STATUS_TERMINAIS.has(this.props.status);
  }
  public get historicoPendente(): RegistroHistorico[] {
    return this.registrosPendentes.map((registro) => ({ ...registro, em: new Date(registro.em) }));
  }

  private get valorTotalEmCentavos(): number {
    return this.props.itens.reduce((total, item) => total + item.valorTotalEmCentavos, 0);
  }

  public get valorTotal(): number {
    return this.valorTotalEmCentavos / 100;
  }

  /** Chamado pelo repositório depois de gravar o histórico. */
  public confirmarHistorico(): void {
    this.registrosPendentes = [];
  }

  /** Devolve false se o diagnóstico já estava em andamento (reabertura). */
  public iniciarDiagnostico(): boolean {
    if (this.props.status === StatusOS.EM_DIAGNOSTICO) return false;
    this.transicionar(StatusOS.EM_DIAGNOSTICO, 'Diagnóstico iniciado');
    return true;
  }

  /** Item repetido só soma a quantidade: descrição e preço ficam os da primeira inclusão (snapshot). */
  public adicionarItem(novo: NovoItemOrcamento): ItemOrcamento {
    if (this.props.status !== StatusOS.EM_DIAGNOSTICO) {
      throw new DomainError(
        'Itens só podem ser incluídos durante o diagnóstico',
        'OS_ITEM_FORA_DO_DIAGNOSTICO',
      );
    }
    const existente = this.props.itens.find(
      (item) => item.tipo === novo.tipo && item.referenciaId === novo.referenciaId,
    );
    if (existente) {
      existente.incrementar(novo.quantidade);
      this.touch();
      return copiarItem(existente);
    }
    const item = ItemOrcamento.criar(novo);
    this.props.itens.push(item);
    this.touch();
    return copiarItem(item);
  }

  /** Mesmas regras do Billing para gerar-orcamento (E5); null = orçamento válido. */
  public motivoOrcamentoInvalido(): string | null {
    if (this.props.itens.length === 0) return 'Nenhum item registrado no diagnóstico';
    if (this.itensDeServico.length === 0) return 'O orçamento precisa de ao menos um serviço';
    const total = this.valorTotalEmCentavos;
    if (total === 0) return 'Orçamento sem valor a cobrar';
    if (total > VALOR_TOTAL_MAXIMO_EM_CENTAVOS) return 'Valor total do orçamento excede o limite';
    return null;
  }

  public reabrirDiagnostico(motivo: string): void {
    this.exigirStatus(StatusOS.EM_DIAGNOSTICO, 'OS_TRANSICAO_INVALIDA');
    this.registrar(StatusOS.EM_DIAGNOSTICO, StatusOS.EM_DIAGNOSTICO, `Diagnóstico reaberto: ${motivo}`);
  }

  /** Devolve false se o envio já tinha sido registrado (evento repetido). */
  public registrarOrcamentoEnviado(valor: number, validoAte: Date): boolean {
    if (this.props.status === StatusOS.AGUARDANDO_APROVACAO) return false;
    this.transicionar(StatusOS.AGUARDANDO_APROVACAO, 'Orçamento enviado ao cliente');
    this.props.orcamento = { valor, validoAte: new Date(validoAte) };
    return true;
  }

  public aprovarOrcamento(): void {
    this.transicionar(StatusOS.APROVADA, 'Orçamento aprovado pelo cliente');
  }

  public reprovarOrcamento(motivo: string): void {
    this.transicionar(StatusOS.REPROVADA, motivo);
  }

  public iniciarExecucao(): void {
    this.transicionar(StatusOS.EM_EXECUCAO, 'Reparo iniciado');
  }

  public finalizarExecucao(): void {
    this.transicionar(StatusOS.FINALIZADA, 'Execução concluída');
  }

  public registrarCobranca(linkPagamento: string): void {
    this.exigirStatus(StatusOS.FINALIZADA, 'OS_COBRANCA_FORA_DE_FASE');
    this.props.linkPagamento = linkPagamento;
    this.touch();
  }

  public registrarPagamentoRecusado(motivo: string): void {
    this.exigirStatus(StatusOS.FINALIZADA, 'OS_COBRANCA_FORA_DE_FASE');
    this.props.linkPagamento = null;
    this.registrar(StatusOS.FINALIZADA, StatusOS.FINALIZADA, `Pagamento recusado: ${motivo}`);
  }

  public confirmarPagamento(): void {
    this.transicionar(StatusOS.PAGA, 'Pagamento confirmado');
  }

  public entregar(): void {
    this.transicionar(StatusOS.ENTREGUE, 'Veículo entregue ao cliente');
  }

  /** Fim da compensação da saga (antes do pivô). */
  public cancelar(motivo: string): void {
    this.transicionar(StatusOS.CANCELADA, motivo);
  }

  private exigirStatus(status: StatusOS, code: string): void {
    if (this.props.status !== status) {
      throw new DomainError(`Operação exige a OS em ${status}; está ${this.props.status}`, code);
    }
  }

  private transicionar(para: StatusOS, motivo: string): void {
    const de = this.props.status;
    if (!podeTransicionar(de, para)) {
      throw new DomainError(`Transição inválida de ${de} para ${para}`, 'OS_TRANSICAO_INVALIDA');
    }
    this.props.status = para;
    this.registrar(de, para, motivo);
  }

  private registrar(de: StatusOS | null, para: StatusOS, motivo: string): void {
    this.registrosPendentes.push({ de, para, motivo, em: new Date() });
    this.touch();
  }
}
