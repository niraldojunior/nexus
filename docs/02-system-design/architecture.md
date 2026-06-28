# Arquitetura de Sistema

## Foundation

O repositÃ³rio inicia com uma aplicaÃ§Ã£o TypeScript de execuÃ§Ã£o Ãºnica, organizada em camadas
infraestruturais:

- `shared/config` para configuraÃ§Ã£o de ambiente;
- `shared/http` para bootstrap HTTP e roteamento mÃ­nimo;
- `shared/logging` para logs estruturados;
- `shared/errors` para normalizaÃ§Ã£o de falhas;
- `shared/persistence` para portas e adaptadores iniciais;
- `test/` para validaÃ§Ã£o da fundaÃ§Ã£o.

O objetivo Ã© preparar o terreno para os mÃ³dulos TMF sem misturar regras de negÃ³cio no bootstrapping.
## Camada web com Vite

A camada web do Nexus deve ser estruturada com Vite como build tool e dev server, separando claramente:

- `Dashboard` como página inicial;
- `Geo` como módulo específico acessado pelo menu lateral;
- shell compartilhado com navegação lateral, header e layout responsivo;
- dicionário central de termos para tradução de labels técnicos na interface.

Essa separação evita acoplamento entre a página inicial de operação e a experiência funcional do módulo Geo.
