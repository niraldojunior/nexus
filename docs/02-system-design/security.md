# Segurança

## Fundação

Autenticação básica por bearer token via variável de ambiente:

- habilitada por `AUTH_ENABLED=true`;
- token configurado em `AUTH_TOKEN`;
- rotas de bootstrap exigem autorização;
- `/health` permanece sem autenticação para readiness.
