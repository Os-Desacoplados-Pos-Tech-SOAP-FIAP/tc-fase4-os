import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { ConflitoError } from '../../errors';
import { CadastrarClienteUseCase } from './CadastrarClienteUseCase';

describe('CadastrarClienteUseCase', () => {
  let repo: InMemoryClienteRepository;
  let useCase: CadastrarClienteUseCase;

  beforeEach(() => {
    repo = new InMemoryClienteRepository();
    useCase = new CadastrarClienteUseCase(repo);
  });

  it('cadastra cliente PF válido', async () => {
    const cliente = await useCase.execute({
      tipo: TipoCliente.PF,
      documento: '529.982.247-25',
      nome: 'João Silva',
      email: 'joao@email.com',
    });
    expect(cliente.nome).toBe('João Silva');
    expect(repo.clientes).toHaveLength(1);
  });

  it('recusa documento duplicado', async () => {
    await useCase.execute({
      tipo: TipoCliente.PF,
      documento: '52998224725',
      nome: 'João Silva',
      email: 'joao@email.com',
    });
    await expect(
      useCase.execute({
        tipo: TipoCliente.PF,
        documento: '52998224725',
        nome: 'Outra Pessoa',
        email: 'outra@email.com',
      }),
    ).rejects.toBeInstanceOf(ConflitoError);
  });
});
