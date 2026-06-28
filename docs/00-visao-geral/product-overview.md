# VisÃ£o Geral do Produto

## Status da fundaÃ§Ã£o

Esta fase entrega apenas a base tÃ©cnica do Nexus:

- bootstrap da aplicaÃ§Ã£o;
- configuraÃ§Ã£o de qualidade;
- infraestrutura de persistÃªncia;
- autenticaÃ§Ã£o bÃ¡sica por bearer token;
- logging estruturado;
- tratamento global de erros;
- documentaÃ§Ã£o inicial e CI.

NÃ£o hÃ¡ regra de negÃ³cio implementada nesta fase.
## Camada web

A interface gráfica do Nexus é organizada como uma aplicação Vite com navegação lateral comum:

- a página inicial é um dashboard com indicadores das entidades existentes;
- o menu lateral é compartilhado por todas as telas;
- o módulo Geo fica em página específica e é acessado pelo menu lateral;
- termos técnicos expostos na UI usam um dicionário reutilizável de tradução.
