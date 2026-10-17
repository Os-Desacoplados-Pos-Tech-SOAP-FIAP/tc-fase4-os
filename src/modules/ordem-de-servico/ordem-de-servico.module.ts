import { Module } from '@nestjs/common';

import { AbrirOrdemDeServicoUseCase } from '../../application/ordem-de-servico/abrir-ordem/AbrirOrdemDeServicoUseCase';
import { AdicionarItemUseCase } from '../../application/ordem-de-servico/adicionar-item/AdicionarItemUseCase';
import { ConsultarOrdemDeServicoUseCase } from '../../application/ordem-de-servico/consultar-ordem/ConsultarOrdemDeServicoUseCase';
import { EntregarVeiculoUseCase } from '../../application/ordem-de-servico/entregar-veiculo/EntregarVeiculoUseCase';
import { HistoricoDaOrdemUseCase } from '../../application/ordem-de-servico/historico/HistoricoDaOrdemUseCase';
import { ListarOrdensDeServicoUseCase } from '../../application/ordem-de-servico/listar-ordens/ListarOrdensDeServicoUseCase';
import { OrdemDeServicoController } from './ordem-de-servico.controller';

@Module({
  controllers: [OrdemDeServicoController],
  providers: [
    AbrirOrdemDeServicoUseCase,
    AdicionarItemUseCase,
    ConsultarOrdemDeServicoUseCase,
    ListarOrdensDeServicoUseCase,
    HistoricoDaOrdemUseCase,
    EntregarVeiculoUseCase,
  ],
})
export class OrdemDeServicoModule {}
