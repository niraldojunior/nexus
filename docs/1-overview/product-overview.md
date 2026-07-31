# Visão Geral do Produto

## Status da fundação

Esta fase entrega apenas a base técnica do Nexus:

- bootstrap da aplicação;
- configuração de qualidade;
- infraestrutura de persistência;
- autenticação básica por bearer token;
- logging estruturado;
- tratamento global de erros;
- documentação inicial e CI.

Não há regra de negócio implementada nesta fase.

## Camada web

A interface gráfica do Nexus é organizada como uma aplicação Vite com navegação lateral comum:

- a página inicial é um dashboard com indicadores das entidades existentes;
- o menu lateral é compartilhado por todas as telas;
- o módulo Geo fica em página específica e é acessado pelo menu lateral;
- termos técnicos expostos na UI usam um dicionário reutilizável de tradução.
