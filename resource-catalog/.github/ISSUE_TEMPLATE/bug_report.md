---
name: Bug report
about: Relatar um problema encontrado
title: "bug: "
labels: [type:bug]
assignees: ''

---

## 🐛 Descrição do bug

_Explique de forma objetiva o erro encontrado._

> Exemplo: O template Go API está gerando um `main.go` sem o módulo de observabilidade.

---

## ✅ Passos para reproduzir

_Descreva como reproduzir o erro, por exemplo:_

1. Vá até o diretório `worker/go/worker-template`
2. Execute o comando `tetrix-compose --lang go --workload worker`
3. Observe que o arquivo `observability.go` não está presente

---

## 🧾 Comportamento esperado

_O que deveria acontecer?_

> O `observability.go` deveria ser incluído automaticamente via snippet de OTEL

---

## 💻 Ambiente

- OS: [ex: Ubuntu 22.04, Windows 11]
- Go version: `go version`
- Comando executado: `tetrix-compose ...`

---

## 📎 Evidências (logs, prints, diffs)

_Se possível, inclua logs ou prints relevantes._

---

## 👤 Responsável sugerido (opcional)

_Mencione alguém caso já saiba quem pode resolver._
