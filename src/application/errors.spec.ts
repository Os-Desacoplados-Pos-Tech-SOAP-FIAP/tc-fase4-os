import { DomainError } from '../domain/shared/DomainError';
import {
  CatalogoIndisponivelError,
  ConcorrenciaError,
  ConflitoError,
  CredenciaisInvalidasError,
  RecursoNaoEncontradoError,
} from './errors';

describe('erros de aplicação', () => {
  it('RecursoNaoEncontradoError monta a mensagem a partir da entidade', () => {
    const erro = new RecursoNaoEncontradoError('Serviço');
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(DomainError);
    expect(erro.name).toBe('RecursoNaoEncontradoError');
    expect(erro.code).toBe('RECURSO_NAO_ENCONTRADO');
    expect(erro.message).toBe('Serviço não encontrado(a)');
  });

  it('ConflitoError usa CONFLITO como code padrão', () => {
    const erro = new ConflitoError('Já existe');
    expect(erro).not.toBeInstanceOf(DomainError);
    expect(erro.name).toBe('ConflitoError');
    expect(erro.code).toBe('CONFLITO');
    expect(erro.message).toBe('Já existe');
  });

  it('ConflitoError aceita code específico', () => {
    expect(new ConflitoError('Duplicado', 'CODIGO_DUPLICADO').code).toBe('CODIGO_DUPLICADO');
  });

  it('ConcorrenciaError é um ConflitoError com code CONCORRENCIA', () => {
    const erro = new ConcorrenciaError('Ordem de serviço');
    expect(erro).toBeInstanceOf(ConflitoError);
    expect(erro.code).toBe('CONCORRENCIA');
    expect(erro.message).toContain('Ordem de serviço');
  });

  it('CatalogoIndisponivelError carrega code e motivo', () => {
    const erro = new CatalogoIndisponivelError('timeout');
    expect(erro).toBeInstanceOf(Error);
    expect(erro.code).toBe('CATALOGO_INDISPONIVEL');
    expect(erro.message).toBe('Catalog indisponível: timeout');
  });

  it('CredenciaisInvalidasError tem mensagem genérica', () => {
    const erro = new CredenciaisInvalidasError();
    expect(erro.code).toBe('CREDENCIAIS_INVALIDAS');
    expect(erro.message).toBe('Credenciais inválidas');
  });
});
