/**
 * Erros da camada de aplicação: independentes de HTTP e fora da hierarquia de
 * DomainError, pois não representam regra de negócio violada (422), e sim
 * recurso ausente (404) ou conflito de estado (409). O mapeamento para status
 * fica na borda (AllExceptionsFilter).
 */
export class RecursoNaoEncontradoError extends Error {
  public readonly code = 'RECURSO_NAO_ENCONTRADO';

  constructor(entidade: string) {
    super(`${entidade} não encontrado(a)`);
    this.name = 'RecursoNaoEncontradoError';
    Object.setPrototypeOf(this, RecursoNaoEncontradoError.prototype);
  }
}

export class ConflitoError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CONFLITO') {
    super(message);
    this.name = 'ConflitoError';
    this.code = code;
    Object.setPrototypeOf(this, ConflitoError.prototype);
  }
}

/** Versão otimista divergente: outra operação gravou antes. HTTP → 409; fila → retentativa. */
export class ConcorrenciaError extends ConflitoError {
  constructor(entidade: string) {
    super(`${entidade} foi alterado(a) por outra operação; tente novamente`, 'CONCORRENCIA');
    this.name = 'ConcorrenciaError';
    Object.setPrototypeOf(this, ConcorrenciaError.prototype);
  }
}

/** Catalog fora do ar, lento ou respondendo fora do contrato. HTTP → 503. */
export class CatalogoIndisponivelError extends Error {
  public readonly code = 'CATALOGO_INDISPONIVEL';

  constructor(motivo: string) {
    super(`Catalog indisponível: ${motivo}`);
    this.name = 'CatalogoIndisponivelError';
    Object.setPrototypeOf(this, CatalogoIndisponivelError.prototype);
  }
}

/** E-mail inexistente, senha errada ou usuário inativo: mesma resposta (HTTP → 401). */
export class CredenciaisInvalidasError extends Error {
  public readonly code = 'CREDENCIAIS_INVALIDAS';

  constructor() {
    super('Credenciais inválidas');
    this.name = 'CredenciaisInvalidasError';
    Object.setPrototypeOf(this, CredenciaisInvalidasError.prototype);
  }
}
