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

  it('compara a senha mesmo com e-mail inexistente ou usuário inativo (tempo constante)', async () => {
    const compare = jest.spyOn(hashFalso, 'compare');
    const hash = jest.spyOn(hashFalso, 'hash');
    try {
      await usuarios.salvar(
        Usuario.restaurar(
          { nome: 'Bia', email: 'bia@oficina.local', senha: 'hash:senha123', perfil: PerfilAcesso.MECANICO, ativo: false },
          new UniqueID(),
        ),
      );
      await expect(useCase.execute('ninguem@oficina.local', 'senha123')).rejects.toBeInstanceOf(CredenciaisInvalidasError);
      await expect(useCase.execute('bia@oficina.local', 'senha123')).rejects.toBeInstanceOf(CredenciaisInvalidasError);
      expect(compare).toHaveBeenCalledTimes(2);
      // O hash de mentira vem do próprio provedor (sem hash fixo no código) e é gerado uma vez só.
      expect(hash).toHaveBeenCalledTimes(1);
      const hashDeMentira = await hash.mock.results[0].value;
      expect(compare.mock.calls).toEqual([
        ['senha123', hashDeMentira],
        ['senha123', hashDeMentira],
      ]);
    } finally {
      compare.mockRestore();
      hash.mockRestore();
    }
  });
});
