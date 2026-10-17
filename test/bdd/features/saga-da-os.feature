# language: pt
Funcionalidade: Saga da ordem de serviço
  A OS avança pelos serviços de execução, estoque e cobrança sem intervenção manual.
  Falhas antes da execução (pivô) desfazem o que já foi feito, em ordem inversa;
  depois do pivô, só há nova tentativa.

  Cenário: Fluxo feliz até a entrega do veículo
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o cliente aprova o orçamento
    E o Catalog reserva os insumos
    E o Execution aceita a execução
    E o Execution inicia e conclui o reparo
    E o Billing gera a cobrança
    E o Billing confirma o pagamento
    E o atendente entrega o veículo
    Então a OS fica com status "ENTREGUE" e a saga na etapa "CONCLUIDA"
    E o orquestrador enviou, em ordem, os comandos:
      | comando                             |
      | execution.enfileirar-diagnostico.v1 |
      | billing.gerar-orcamento.v1          |
      | catalog.reservar-insumos.v1         |
      | execution.enfileirar-execucao.v1    |
      | catalog.baixar-reservas.v1          |
      | billing.gerar-cobranca.v1           |

  Cenário: Cliente reprova o orçamento
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o cliente reprova o orçamento
    Então a OS fica com status "REPROVADA" e a saga na etapa "ENCERRADA"

  Cenário: Orçamento expira sem resposta do cliente
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o orçamento expira
    Então a OS fica com status "REPROVADA" e a saga na etapa "ENCERRADA"

  Cenário: Diagnóstico sem serviço volta para o mecânico
    Dado uma OS em diagnóstico só com um insumo
    Quando o Execution conclui o diagnóstico
    Então a OS fica com status "EM_DIAGNOSTICO" e a saga na etapa "DIAGNOSTICO"
    E o último comando enviado foi "execution.reabrir-diagnostico.v1"

  Cenário: Falta de estoque cancela o orçamento
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o cliente aprova o orçamento
    E o Catalog não consegue reservar os insumos
    E o Billing confirma o cancelamento do orçamento
    Então a OS fica com status "CANCELADA" e a saga na etapa "COMPENSADA"
    E o último comando enviado foi "billing.cancelar-orcamento.v1"

  Cenário: Fila de execução cheia libera as reservas e cancela o orçamento
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o cliente aprova o orçamento
    E o Catalog reserva os insumos
    E o Execution recusa a execução por falta de capacidade
    E o Catalog libera as reservas
    E o Billing confirma o cancelamento do orçamento
    Então a OS fica com status "CANCELADA" e a saga na etapa "COMPENSADA"
    E o orquestrador enviou, em ordem, os comandos:
      | comando                             |
      | execution.enfileirar-diagnostico.v1 |
      | billing.gerar-orcamento.v1          |
      | catalog.reservar-insumos.v1         |
      | execution.enfileirar-execucao.v1    |
      | catalog.liberar-reservas.v1         |
      | billing.cancelar-orcamento.v1       |

  Cenário: Pagamento recusado gera um novo link de pagamento
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E o Billing envia o orçamento
    E o cliente aprova o orçamento
    E o Catalog reserva os insumos
    E o Execution aceita a execução
    E o Execution inicia e conclui o reparo
    E o Billing gera a cobrança
    E o Billing recusa o pagamento
    Então a OS fica com status "FINALIZADA" e a saga na etapa "COBRANCA"
    E o último comando enviado foi "billing.gerar-cobranca.v1"
    Quando o Billing gera a cobrança
    E o Billing confirma o pagamento
    Então a OS fica com status "PAGA" e a saga na etapa "CONCLUIDA"

  Cenário: Mensagem entregue duas vezes não repete efeitos
    Dado uma OS em diagnóstico com um serviço e um insumo
    Quando o Execution conclui o diagnóstico
    E a mesma mensagem de diagnóstico concluído chega de novo
    Então a OS fica com status "EM_DIAGNOSTICO" e a saga na etapa "ORCAMENTO"
    E o orquestrador enviou, em ordem, os comandos:
      | comando                             |
      | execution.enfileirar-diagnostico.v1 |
      | billing.gerar-orcamento.v1          |
