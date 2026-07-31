# Arquitetura de Sistema

## Foundation

O repositório inicia com uma aplicação TypeScript de execução única, organizada em camadas
infraestruturais:

- `shared/config` para configuração de ambiente;
- `shared/http` para bootstrap HTTP e roteamento mínimo;
- `shared/logging` para logs estruturados;
- `shared/errors` para normalização de falhas;
- `shared/persistence` para portas e adaptadores iniciais;
- `test/` para validação da fundação.

O objetivo é preparar o terreno para os módulos TMF sem misturar regras de negócio no bootstrapping.

## Camada web com Vite

A camada web do Nexus deve ser estruturada com Vite como build tool e dev server, separando claramente:

- `Dashboard` como página inicial;
- `Geo` como módulo específico acessado pelo menu lateral;
- shell compartilhado com navegação lateral, header e layout responsivo;
- dicionário central de termos para tradução de labels técnicos na interface.

Essa separação evita acoplamento entre a página inicial de operação e a experiência funcional do módulo Geo.
