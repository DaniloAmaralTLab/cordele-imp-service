# SPEC-02 — Import Orchestration (core)

**Module:** IMP · **Refs:** doc 02 §End-to-End Flows, doc 04, `adr/ADR-002-manuscript-immutability-lossless-parse.md`,
shared `ADR-001-hexagonal-node.md`.

## Objetivo

Especificar o caso de uso central `ImportManuscriptUseCase`: **validar → (criar/validar projeto) →
armazenar binário → parsear → persistir manuscrito imutável → emitir evento**, tudo **síncrono** na
request (D-A).

## Escopo

- **In:** orquestração completa do golden path e alternativos; fronteira transacional.
- **Out:** implementação dos parsers (SPEC-03); DDL (SPEC-04); segurança (SPEC-06).

## Decisões técnicas

- Ordem determinística; fronteira transacional no serviço de aplicação (`modules/imp`).
- Parser selecionado por `formato` atrás de `ManuscriptParserPort` (nunca nomeia mammoth/remark).
- Evento `ManuscriptImported` publicado **após commit** (in-process).

## Implementação (pseudo-fluxo)

```
1. validar formato ∈ {docx, markdown} e tamanho ≤ 50MB     → senão 415/413, emite ManuscriptImportRejected
2. resolver projeto (D-C):
     projetoTitulo → PROJ.CreateProjetoEditorialUseCase.create()
     projetoId     → PROJ.ProjetoEditorialLookup.exists() (empresa ativa) senão 422
3. armazenar binário original (FileStoragePort, chave tenant-scoped)
4. parse(stream, formato) → { contentTree, unparsedSegments, counts }   (streamed)
5. extrair imagens → FileStoragePort; referenciar por storageKey no tree
6. montar counts; persistir Manuscrito imutável (status='imported') em TX
7. commit; publicar ManuscriptImported (in-process); retornar 201 ManuscritoDetail
```

## Casos de borda

- Parse produz unparsed segments → import **continua** (201), `trechosNaoParseados > 0` (ADR-002).
- Parse irreparável → 422 `parse-failed`, `ManuscriptImportRejected`, nada persistido.
- Falha de storage → aborta import, nada persistido.
- Criação de projeto OK mas parse falha → projeto `rascunho` sem manuscrito permanece (aceitável).

## Critérios de aceite (EARS)

- `WHEN validate, store, parse and persist all succeed, THE SYSTEM SHALL commit the manuscrito and then
  publish ManuscriptImported exactly once.`
- `IF any step before persistence fails, THEN THE SYSTEM SHALL persist no manuscrito and publish
  ManuscriptImportRejected (for format/size/parse failures).`
- `WHILE parsing yields unparsed regions, THE SYSTEM SHALL still persist and respond 201 with a non-zero
  trechosNaoParseados.`
- `THE SYSTEM SHALL run the whole flow within the request lifecycle (no background job in the MVP).`
- `THE SYSTEM SHALL derive totalCapitulos/totalImagens/trechosNaoParseados from the produced tree.`
