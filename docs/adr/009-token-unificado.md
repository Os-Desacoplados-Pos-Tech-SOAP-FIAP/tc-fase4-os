# ADR 009 — JWT único para clientes e funcionários

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution, Auth, `tc-fase4-infra` (gateway e segredos)

## Contexto

Quatro serviços expõem rotas protegidas por perfil, e há dois tipos de usuário: funcionários (atendente, mecânico,
administrador), cadastrados no OS, e clientes, que se identificam pelo CPF. A Fase 3 já tinha login de funcionário no
monolito e uma Lambda de CPF. Os serviços não podem consultar um serviço de identidade a cada requisição sem criar mais
uma dependência síncrona.

## Decisão

- **Um contrato de token para todos:** JWT HS256 com `{ sub, perfil }`, `perfil` ∈ `CLIENTE`, `ATENDENTE`,
  `MECANICO`, `ADMINISTRADOR` (`src/common/auth/perfil.ts`), assinado com o segredo compartilhado
  `oficina-fase4/JWT_SECRET`, criado em `secrets.tf` no `tc-fase4-infra`.
- **Cada serviço valida sozinho**, com o próprio `JwtStrategy` (só HS256, exige `sub` e `perfil` válido) e guard de
  perfil (`src/infrastructure/auth/jwt.strategy.ts` em cada serviço; no OS também `src/common/guards/roles.guard.ts`).
- **Funcionário:** `POST /auth/login` no OS (`src/application/auth/login/LoginUseCase.ts`), token de 8 h
  (`JWT_EXPIRES_IN`), com `email` além de `sub` e `perfil`.
- **Cliente:** Lambda `auth-cpf` (`POST /auth` no API Gateway) valida o CPF, consulta o OS em
  `GET /api/os/internal/clientes/cpf/:cpf` e emite token de 1 h com `perfil = CLIENTE`, sem CPF no payload (LGPD)
  (`src/jwt.ts` e `src/auth.handler.ts` no `tc-fase4-auth`).
- **Proteção da rota interna**, em duas camadas:
  - no OS, header `X-Internal-Token` comparado em tempo constante com `INTERNAL_SERVICE_TOKEN`
    (`src/common/guards/internal-token.guard.ts`);
  - no API Gateway, `ANY /api/os/internal/{proxy+}` exige `AWS_IAM`, então quem vem de fora recebe 403
    (`gateway/apigateway.tf` no `tc-fase4-infra`). A Lambda roda na VPC e chama o ALB interno direto.
- **Authorizer na borda:** `authorizer-cliente` (`src/authorizer.handler.ts` no `tc-fase4-auth`) valida o JWT de
  cliente nas rotas `ANY /api/os/publico/{proxy+}`. O OS confere de novo o perfil e que a OS é do cliente do token
  ([README do OS — Decisões](../../README.md#decisões)).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Amazon Cognito | Mais um serviço gerenciado a configurar (user pool, grupos, migração de usuários da Fase 3) e login por CPF sem senha exigiria fluxo customizado. |
| Serviço de identidade dedicado no EKS | Mais um deploy e um banco, e uma dependência síncrona para validar token. |
| Login de funcionário também na Lambda | Fora de escopo (spec §10); os usuários já vivem no OS. |
| Chave assimétrica (RS256 + JWKS) | Resolveria a rotação, mas exige publicar e buscar JWKS; desnecessário para o escopo. |

## Consequências

- **Positivas:**
  - Validação local, sem chamada de rede, em qualquer serviço; o mesmo guard aceita cliente e funcionário.
  - A rota interna do OS não fica exposta na internet.
- **Negativas / limitações aceitas:**
  - **Segredo simétrico compartilhado:** quem tem o `JWT_SECRET` emite token de qualquer perfil. Rotação exige
    regravar o segredo e reiniciar todos os serviços e a Lambda (os pods leem o valor do Secret criado pelo CD).
  - Sem revogação: o token vale até expirar (8 h funcionário, 1 h cliente).
  - Rotas de funcionário não têm authorizer no gateway; a validação fica só no serviço
    ([README da infra — Rotas do gateway](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md#rotas-do-gateway)).

## Referências

- [README do auth](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-auth/blob/main/README.md) (fluxo,
  contrato do token, rede)
- [README do OS — Rotas](../../README.md#rotas)
- [README da infra — Segredos](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md#segredos)
