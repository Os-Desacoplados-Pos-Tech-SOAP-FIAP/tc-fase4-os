import { InMemoryUsuarioRepository } from '../../../../test/fakes/in-memory-usuario.repository';
import { PerfilAcesso } from '../../../common/auth/perfil';
import { ConflitoError } from '../../errors';
import { RegistrarUsuarioUseCase } from './RegistrarUsuarioUseCase';

describe('RegistrarUsuarioUseCase', () => {
  const hash = { hash: async (p: string) => `hash:${p}`, compare: async () => true };
  let usuarios: InMemoryUsuarioRepository;
  let useCase: RegistrarUsuarioUseCase;

  beforeEach(() => {
    usuarios = new InMemoryUsuarioRepository();
    useCase = new RegistrarUsuarioUseCase(usuarios, hash);
  });

  it('registra com senha em hash e devolve sem a senha', async () => {
    const criado = await useCase.execute({ nome: 'Caio', email: 'caio@oficina.local', senha: 'senha123', perfil: PerfilAcesso.MECANICO });
    expect(criado).toEqual({ id: expect.any(String), nome: 'Caio', email: 'caio@oficina.local', perfil: PerfilAcesso.MECANICO });
    expect(usuarios.usuarios[0].senha).toBe('hash:senha123');
  });

  it('recusa e-mail repetido', async () => {
    const dados = { nome: 'Caio', email: 'caio@oficina.local', senha: 'senha123', perfil: PerfilAcesso.MECANICO };
    await useCase.execute(dados);
    await expect(useCase.execute(dados)).rejects.toEqual(expect.any(ConflitoError));
  });
});
