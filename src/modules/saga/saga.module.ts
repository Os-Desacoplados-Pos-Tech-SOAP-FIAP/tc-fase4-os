import { Module } from '@nestjs/common';

import { OrquestradorSaga } from '../../application/saga/orquestrador-saga';
import { SagaMessageHandlers } from './saga-message.handlers';

@Module({ providers: [OrquestradorSaga, SagaMessageHandlers] })
export class SagaModule {}
