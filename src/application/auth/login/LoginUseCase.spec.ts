import { JwtService } from '@nestjs/jwt';

import { InMemoryUsuarioRepository } from '../../../../test/fakes/in-memory-usuario.repository';
import { PerfilAcesso } from '../../../common/auth/perfil';
import { Usuario } from '../../../domain/auth/entities/Usuario';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { CredenciaisInvalidasError } from '../../errors';
import { IHashProvider } from '../../ports/hash-provider';
import { LoginUseCase } from './LoginUseCase';

const hashFalso: IHashProvider = {
  hash: async (plain) => `hash:${plain}`,
  compare: async (plain, hashed) => hashed === `hash:${plain}`,
};

describe('LoginUseCase', () => {
  const jwt = new JwtService({ secret: 'segredo', signOptions: { expiresIn: '1h' } });
  let usuarios: InMemoryUsuarioRepository;
  let useCase: LoginUseCase;

  beforeEach(async () => {
    usuarios = new InMemoryUsuarioRepository();
    await usuarios.salvar(
      Usuario.criar({ nome: 'Ana', email: 'ana@oficina.local', senha: 'hash:senha123', perfil: PerfilAcesso.ATENDENTE }),
    );
    useCase = new LoginUseCase(usuarios, jwt, hashFalso);
  });

  it('emite JWT com sub, email e perfil', async () => {
    const resultado = await useCase.execute('ana@oficina.local', 'senha123');
    const payload = jwt.verify(resultado.accessToken);
    expect(payload).toEqual(
      expect.objectContaining({ sub: resultado.usuario.id, email: 'ana@oficina.local', perfil: 'ATENDENTE' }),
    );
    expect(resultado.usuario).toEqual({
      id: expect.any(String),
      nome: 'Ana',
      email: 'ana@oficina.local',
      perfil: PerfilAcesso.ATENDENTE,
    });
  });

  it('senha errada, e-mail inexistente e usuário inativo têm a mesma resposta', async () => {
    await expect(useCase.execute('ana@oficina.local', 'errada')).rejects.toBeInstanceOf(CredenciaisInvalidasError);
    await expect(useCase.execute('ninguem@oficina.local', 'senha123')).rejects.toBeInstanceOf(CredenciaisInvalidasError);

    const inativo = Usuario.restaurar(
      { nome: 'Bia', email: 'bia@oficina.local', senha: 'hash:senha123', perfil: PerfilAcesso.MECANICO, ativo: false },
      new UniqueID(),
    );
    await usuarios.salvar(inativo);
    await expect(useCase.execute('bia@oficina.local', 'senha123')).rejects.toBeInstanceOf(CredenciaisInvalidasError);
  });
});
