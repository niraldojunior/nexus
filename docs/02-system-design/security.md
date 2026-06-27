# Design de Sistema - Segurança

## Proteção HTTP

- Remover cabeçalhos de resposta desnecessários.
- Usar Helmet ou equivalente em todas as aplicações HTTP.
- Centralizar configuração e validação de ambiente.
- Falhar cedo quando a configuração obrigatória estiver ausente ou inválida.
- Manter os padrões de segurança no bootstrap, e não espalhados pelos módulos.

## Acesso e Governança

- Manter contratos de autenticação e autorização explícitos quando aplicável.
- Preservar fronteiras claras para operações exclusivas de administrador ou migração.
- Não expor campos de histórico mutáveis sem uma regra de governança.
- Tornar operações protegidas visíveis no modelo de domínio e na documentação.

## Resiliência e Segurança Operacional

- Preferir desligamento controlado e transições seguras em vez de operações destrutivas.
- Evitar caminhos de exclusão física quando o domínio exigir auditabilidade.
- Manter validação de entrada rigorosa na fronteira da aplicação.
- Usar tratamento estruturado de erros e exceções tipadas.
