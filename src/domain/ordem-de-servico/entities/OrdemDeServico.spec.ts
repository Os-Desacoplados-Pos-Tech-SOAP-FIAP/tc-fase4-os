import { StatusOS } from '../StatusOS';
import { NovoItemOrcamento, TipoItemOrcamento } from './ItemOrcamento';
import { OrdemDeServico } from './OrdemDeServico';

const CLIENTE = '11111111-1111-4111-8111-111111111111';
const VEICULO = '22222222-2222-4222-8222-222222222222';
const SERVICO = '33333333-3333-4333-8333-333333333333';
const INSUMO = '44444444-4444-4444-8444-444444444444';

const servico: NovoItemOrcamento = {
  tipo: TipoItemOrcamento.SERVICO,
  referenciaId: SERVICO,
  descricao: 'Revisão',
  quantidade: 1,
  valorUnitario: 200,
};
const insumo: NovoItemOrcamento = {
  tipo: TipoItemOrcamento.INSUMO,
  referenciaId: INSUMO,
  descricao: 'Filtro',
  quantidade: 2,
  valorUnitario: 35.5,
};

function abrir(): OrdemDeServico {
  return OrdemDeServico.abrir({ numero: 7, clienteId: CLIENTE, veiculoId: VEICULO, observacoes: ' barulho ' });
}

function emDiagnosticoComItens(): OrdemDeServico {
  const os = abrir();
  os.iniciarDiagnostico();
  os.adicionarItem(servico);
  os.adicionarItem(insumo);
  return os;
}

function aprovada(): OrdemDeServico {
  const os = emDiagnosticoComItens();
  os.registrarOrcamentoEnviado(271, new Date('2026-10-20T12:00:00Z'));
  os.aprovarOrcamento();
  return os;
}

describe('OrdemDeServico', () => {
  it('abre RECEBIDA, versão 0 e com o registro de abertura no histórico', () => {
    const os = abrir();
    expect(os.status).toBe(StatusOS.RECEBIDA);
    expect(os.versao).toBe(0);
    expect(os.observacoes).toBe('barulho');
    expect(os.historicoPendente).toEqual([
      expect.objectContaining({ de: null, para: StatusOS.RECEBIDA, motivo: 'OS aberta' }),
    ]);
  });

  it('recusa número inválido e ids que não são UUID', () => {
    expect(() => OrdemDeServico.abrir({ numero: 0, clienteId: CLIENTE, veiculoId: VEICULO })).toThrow(
      expect.objectContaining({ code: 'OS_NUMERO_INVALIDO' }),
    );
    expect(() => OrdemDeServico.abrir({ numero: 1, clienteId: 'x', veiculoId: VEICULO })).toThrow(
      expect.objectContaining({ code: 'INVALID_ID' }),
    );
    expect(() => OrdemDeServico.abrir({ numero: 1, clienteId: CLIENTE, veiculoId: 'x' })).toThrow(
      expect.objectContaining({ code: 'INVALID_ID' }),
    );
  });

  describe('imutabilidade dos getters', () => {
    it('alterar um item obtido pelos getters não muda a OS', () => {
      const os = emDiagnosticoComItens();
      os.itens[0].incrementar(5);
      os.itensDeServico[0].incrementar(5);
      os.itensDeInsumo[0].incrementar(5);
      expect(os.itens.map((i) => i.quantidade)).toEqual([1, 2]);
      expect(os.valorTotal).toBe(271);
    });

    it('o item devolvido por adicionarItem não altera a OS', () => {
      const os = abrir();
      os.iniciarDiagnostico();
      os.adicionarItem(servico).incrementar(5);
      expect(os.itens[0].quantidade).toBe(1);
    });

    it('orçamento e histórico não vazam referências internas', () => {
      const os = emDiagnosticoComItens();
      const validade = new Date('2026-10-20T12:00:00Z');
      os.registrarOrcamentoEnviado(271, validade);
      os.orcamento?.validoAte.setUTCFullYear(2000);
      expect(os.orcamento?.validoAte).toEqual(validade);
      const em = os.historicoPendente[0].em.getTime();
      os.historicoPendente[0].em.setUTCFullYear(2000);
      expect(os.historicoPendente[0].em.getTime()).toBe(em);
    });

    it('restaurar copia o orçamento recebido', () => {
      const original = aprovada();
      const orcamento = { valor: 271, validoAte: new Date('2026-10-20T12:00:00Z') };
      const os = OrdemDeServico.restaurar(
        {
          numero: original.numero,
          clienteId: CLIENTE,
          veiculoId: VEICULO,
          status: StatusOS.APROVADA,
          observacoes: null,
          itens: [...original.itens],
          orcamento,
          linkPagamento: null,
          versao: 1,
        },
        original.id,
      );
      orcamento.validoAte.setUTCFullYear(2000);
      orcamento.valor = 1;
      expect(os.orcamento).toEqual({ valor: 271, validoAte: new Date('2026-10-20T12:00:00Z') });
    });
  });

  describe('diagnóstico', () => {
    it('inicia uma vez; repetir (reabertura) não muda nada', () => {
      const os = abrir();
      expect(os.iniciarDiagnostico()).toBe(true);
      expect(os.iniciarDiagnostico()).toBe(false);
      expect(os.status).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(os.historicoPendente).toHaveLength(2);
    });

    it('só aceita item em EM_DIAGNOSTICO e soma quantidade do mesmo item', () => {
      const os = abrir();
      expect(() => os.adicionarItem(servico)).toThrow(
        expect.objectContaining({ code: 'OS_ITEM_FORA_DO_DIAGNOSTICO' }),
      );
      os.iniciarDiagnostico();
      os.adicionarItem(insumo);
      os.adicionarItem({ ...insumo, quantidade: 1 });
      expect(os.itens).toHaveLength(1);
      expect(os.itens[0].quantidade).toBe(3);
    });

    it('item repetido mantém descrição e preço da primeira inclusão (snapshot)', () => {
      const os = abrir();
      os.iniciarDiagnostico();
      os.adicionarItem(insumo);
      os.adicionarItem({ ...insumo, descricao: 'Filtro novo', quantidade: 1, valorUnitario: 99.9 });
      expect(os.itens).toHaveLength(1);
      expect(os.itens[0].quantidade).toBe(3);
      expect(os.itens[0].descricao).toBe('Filtro');
      expect(os.itens[0].valorUnitario).toBe(35.5);
      expect(os.valorTotal).toBe(106.5);
    });

    it('repetir item com quantidade 0 é recusado', () => {
      const os = abrir();
      os.iniciarDiagnostico();
      os.adicionarItem(insumo);
      expect(() => os.adicionarItem({ ...insumo, quantidade: 0 })).toThrow(
        expect.objectContaining({ code: 'ITEM_QUANTIDADE_INVALIDA' }),
      );
      expect(os.itens[0].quantidade).toBe(2);
    });

    it('reabrirDiagnostico só em EM_DIAGNOSTICO', () => {
      expect(() => abrir().reabrirDiagnostico('x')).toThrow(
        expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
      );
    });

    it('iniciarDiagnostico não volta de APROVADA', () => {
      expect(() => aprovada().iniciarDiagnostico()).toThrow(
        expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
      );
    });

    it('calcula total, separa serviços e insumos', () => {
      const os = emDiagnosticoComItens();
      expect(os.valorTotal).toBe(271);
      expect(os.itensDeServico.map((i) => i.referenciaId)).toEqual([SERVICO]);
      expect(os.itensDeInsumo.map((i) => i.referenciaId)).toEqual([INSUMO]);
    });

    it.each<[string, NovoItemOrcamento[], string]>([
      ['sem itens', [], 'Nenhum item registrado no diagnóstico'],
      ['sem serviço', [insumo], 'O orçamento precisa de ao menos um serviço'],
      ['total zero', [{ ...servico, valorUnitario: 0 }], 'Orçamento sem valor a cobrar'],
      ['acima do limite', [{ ...servico, quantidade: 2, valorUnitario: 50_000_000 }], 'Valor total do orçamento excede o limite'],
    ])('orçamento inválido: %s', (_caso, itens, motivo) => {
      const os = abrir();
      os.iniciarDiagnostico();
      itens.forEach((item) => os.adicionarItem(item));
      expect(os.motivoOrcamentoInvalido()).toBe(motivo);
    });

    it('orçamento válido não tem motivo', () => {
      expect(emDiagnosticoComItens().motivoOrcamentoInvalido()).toBeNull();
    });

    it('reabertura fica no histórico sem mudar o status', () => {
      const os = abrir();
      os.iniciarDiagnostico();
      os.reabrirDiagnostico('Nenhum item registrado no diagnóstico');
      expect(os.status).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(os.historicoPendente.at(-1)).toEqual(
        expect.objectContaining({
          de: StatusOS.EM_DIAGNOSTICO,
          para: StatusOS.EM_DIAGNOSTICO,
          motivo: 'Diagnóstico reaberto: Nenhum item registrado no diagnóstico',
        }),
      );
    });
  });

  describe('orçamento', () => {
    it('registra o envio uma vez, com valor e validade', () => {
      const os = emDiagnosticoComItens();
      const validade = new Date('2026-10-20T12:00:00Z');
      expect(os.registrarOrcamentoEnviado(271, validade)).toBe(true);
      expect(os.registrarOrcamentoEnviado(271, validade)).toBe(false);
      expect(os.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
      expect(os.orcamento).toEqual({ valor: 271, validoAte: validade });
    });

    it('aprova e reprova a partir de AGUARDANDO_APROVACAO', () => {
      expect(aprovada().status).toBe(StatusOS.APROVADA);
      const reprovada = emDiagnosticoComItens();
      reprovada.registrarOrcamentoEnviado(271, new Date());
      reprovada.reprovarOrcamento('Orçamento expirado');
      expect(reprovada.status).toBe(StatusOS.REPROVADA);
      expect(reprovada.terminal).toBe(true);
      expect(reprovada.historicoPendente.at(-1)?.motivo).toBe('Orçamento expirado');
    });

    it('não aprova fora de AGUARDANDO_APROVACAO', () => {
      expect(() => emDiagnosticoComItens().aprovarOrcamento()).toThrow(
        expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
      );
    });

    it('cancela uma OS aprovada (fim da compensação)', () => {
      const os = aprovada();
      os.cancelar('Sem estoque');
      expect(os.status).toBe(StatusOS.CANCELADA);
      expect(os.historicoPendente.at(-1)).toEqual(
        expect.objectContaining({ de: StatusOS.APROVADA, para: StatusOS.CANCELADA, motivo: 'Sem estoque' }),
      );
    });
  });

  describe('execução, cobrança e entrega', () => {
    function finalizada(): OrdemDeServico {
      const os = aprovada();
      os.iniciarExecucao();
      os.finalizarExecucao();
      return os;
    }

    it('percorre execução, cobrança, pagamento e entrega', () => {
      const os = finalizada();
      os.registrarCobranca('https://pagar/1');
      expect(os.linkPagamento).toBe('https://pagar/1');
      os.confirmarPagamento();
      os.entregar();
      expect(os.status).toBe(StatusOS.ENTREGUE);
      expect(os.historicoPendente.map((r) => r.para)).toEqual([
        StatusOS.RECEBIDA,
        StatusOS.EM_DIAGNOSTICO,
        StatusOS.AGUARDANDO_APROVACAO,
        StatusOS.APROVADA,
        StatusOS.EM_EXECUCAO,
        StatusOS.FINALIZADA,
        StatusOS.PAGA,
        StatusOS.ENTREGUE,
      ]);
    });

    it('pagamento recusado limpa o link e fica no histórico', () => {
      const os = finalizada();
      os.registrarCobranca('https://pagar/1');
      os.registrarPagamentoRecusado('cc_rejected_other_reason');
      expect(os.linkPagamento).toBeNull();
      expect(os.status).toBe(StatusOS.FINALIZADA);
      expect(os.historicoPendente.at(-1)?.motivo).toBe('Pagamento recusado: cc_rejected_other_reason');
    });

    it('cobrança e recusa só com a OS FINALIZADA', () => {
      const os = aprovada();
      expect(() => os.registrarCobranca('https://pagar/1')).toThrow(
        expect.objectContaining({ code: 'OS_COBRANCA_FORA_DE_FASE' }),
      );
      expect(() => os.registrarPagamentoRecusado('x')).toThrow(
        expect.objectContaining({ code: 'OS_COBRANCA_FORA_DE_FASE' }),
      );
    });

    it('não cancela depois do pivô (EM_EXECUCAO)', () => {
      const os = aprovada();
      os.iniciarExecucao();
      expect(() => os.cancelar('x')).toThrow(
        expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
      );
    });

    it('entrega só depois de PAGA', () => {
      expect(() => finalizada().entregar()).toThrow(
        expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
      );
    });
  });

  it('confirmarHistorico esvazia os registros pendentes', () => {
    const os = abrir();
    os.confirmarHistorico();
    expect(os.historicoPendente).toEqual([]);
  });

  it('restaura com itens, orçamento, link e versão', () => {
    const original = aprovada();
    const os = OrdemDeServico.restaurar(
      {
        numero: original.numero,
        clienteId: CLIENTE,
        veiculoId: VEICULO,
        status: StatusOS.FINALIZADA,
        observacoes: null,
        itens: [...original.itens],
        orcamento: { valor: 271, validoAte: new Date('2026-10-20T12:00:00Z') },
        linkPagamento: 'https://pagar/2',
        versao: 4,
      },
      original.id,
    );
    expect(os.versao).toBe(4);
    expect(os.valorTotal).toBe(271);
    expect(os.linkPagamento).toBe('https://pagar/2');
    expect(os.historicoPendente).toEqual([]);
  });
});
