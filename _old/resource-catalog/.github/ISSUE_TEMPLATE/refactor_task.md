---
name: Refatoração técnica
about: Refatoração ou débito técnico a ser resolvido
title: "refactor: "
labels: [type:refactor]
assignees: ''

---

## 🔧 Descrição da refatoração

_Explique o que será refatorado e por quê._

> Exemplo: Separar lógica de geração de pastas da CLI em pacotes distintos para melhorar manutenibilidade

---

## 📉 Motivação

_Qual o problema atual?_

> A função `GenerateStructure()` tem muitas responsabilidades e torna difícil adicionar novos módulos

---

## ✅ Resultado esperado

_Como saberemos que a refatoração foi bem-sucedida?_

> O código estará modularizado, testável e mais fácil de manter

---

## 🔬 Impacto previsto

- [ ] Apenas interno (sem mudanças para usuários)
- [ ] Mudança em interface API
- [ ] Mudança de comportamento do fluxo
- [ ] Outro: _______

---

## 🧪 Testes afetados ou adicionados?

> Todos os testes CLI devem continuar passando. Novos testes unitários devem ser criados para os pacotes refatorados.

---

## 👤 Responsável sugerido (opcional)

_Mencione alguém caso já saiba quem pode desenvolver._
