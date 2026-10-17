import { DomainError } from '../../shared/DomainError';
import { Entity, EntityProps } from '../../shared/Entity';
import { UniqueID } from '../../shared/UniqueID';
import { PerfilAcesso } from '../../../common/auth/perfil';

export interface UsuarioProps extends EntityProps {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilAcesso;
  ativo: boolean;
}

export interface NovoUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilAcesso;
}

export class Usuario extends Entity<UsuarioProps> {
  private constructor(props: UsuarioProps, id?: UniqueID) {
    super(props, id);
  }

  public static criar(input: NovoUsuarioInput): Usuario {
    if (!input.nome?.trim() || !input.email?.trim() || !input.senha) {
      throw new DomainError('Dados obrigatórios do usuário ausentes', 'USUARIO_DADOS_INVALIDOS');
    }
    if (input.perfil === PerfilAcesso.CLIENTE) {
      throw new DomainError('Cliente não é usuário do sistema', 'USUARIO_PERFIL_INVALIDO');
    }
    return new Usuario({
      nome: input.nome.trim(),
      email: input.email.trim(),
      senha: input.senha,
      perfil: input.perfil,
      ativo: true,
    });
  }

  public static restaurar(props: UsuarioProps, id: UniqueID): Usuario {
    return new Usuario(props, id);
  }

  public get nome(): string {
    return this.props.nome;
  }

  public get email(): string {
    return this.props.email;
  }

  public get senha(): string {
    return this.props.senha;
  }

  public get perfil(): PerfilAcesso {
    return this.props.perfil;
  }

  public get ativo(): boolean {
    return this.props.ativo;
  }
}
