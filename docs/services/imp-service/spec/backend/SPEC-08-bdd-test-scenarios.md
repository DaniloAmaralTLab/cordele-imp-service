# SPEC-08 — BDD Test Scenarios

**Module:** IMP · **Refs:** `tests/cucumber/*.feature` (Gherkin puro), SPEC-01..07.

## Objetivo

Documentar a estratégia BDD, os steps reutilizáveis e os dados de exemplo em prosa. Os cenários
executáveis vivem em `tests/cucumber/*.feature` (o `be-bdd-generator.py` só lê `.feature`).

## Cobertura (feature → SPEC)

| Feature | Cobre | SPEC |
|---|---|---|
| `manuscript-upload-sync-parse.feature` | upload síncrono → 201 com estrutura; formato/tamanho; binding de projeto (D-A, D-C) | SPEC-01, SPEC-02 |
| `lossless-parse-unparsed-segments.feature` | preservação/relato de unparsed; determinismo; content sacrossanto (ADR-002) | SPEC-03 |
| `manuscript-immutability-and-tenancy.feature` | imutabilidade / re-upload; isolamento de tenant; leitura por projeto | SPEC-04, SPEC-05, SPEC-06 |

## Steps reutilizáveis (implementados no scaffold, não no `.feature`)

- `Given an authenticated editor of empresa "<slug>"` — popula `EmpresaContext` + JWT com scope.
- `Given an existing project "<id>" in the active empresa` — semeia `projeto_editorial`.
- `When the editor uploads "<fixture>" [with projetoTitulo "<t>" | projetoId "<id>"]` — POST multipart.
- `Then the response status is <code>` / `Then the manuscript has <n> chapters and <m> unparsed segments`.

## Dados de exemplo (fixtures)

- `livro-3-capitulos.docx` — DOCX limpo (3 capítulos, 2 imagens, 0 unparsed).
- `livro-com-tabela-complexa.docx` — 1 tabela complexa → 1 unparsed (`complex_table`).
- `livro.md` — Markdown com imagem referenciada.
- `livro.pdf` — formato não suportado (415).
- `livro-51mb.docx` — acima do limite (413).
- `livro-corrompido.docx` — arquivo ilegível/corrompido → 422 `parse-failed`.

## Nota de validação (M3 — be-architect-specs-validate)

Correcções aplicadas no ciclo de validação:

| # | Arquivo | Problema | Correcção |
|---|---|---|---|
| V1 | `manuscript-upload-sync-parse.feature` | Cenário cross-tenant retornava 404; api-contract.md D-C e SPEC-10 especificam 422 `projeto-not-found` para projetoId não resolvido na empresa activa (POST). | Alterado para 422 + `urn:cordele:imp:projeto-not-found`. |
| V2 | `manuscript-upload-sync-parse.feature` | Ausência de cenário para parse irrecuperável (api-contract.md §4.1 EARS). | Adicionado cenário `parse-failed` → 422. |
| V3 | `lossless-parse-unparsed-segments.feature` | Outline cobria 6 de 7 reasons (faltava `other`). | Adicionada linha `other` na tabela Examples. |

## Convenção

- Um `Feature` por arquivo, kebab-case, sem sufixo `-feature`.
- Tabelas Gherkin/`Scenario Outline` para parametrização; docstrings para payloads.
- Asserções sobre "nenhum conteúdo perdido": união de nós parseados + unparsed = fonte.
