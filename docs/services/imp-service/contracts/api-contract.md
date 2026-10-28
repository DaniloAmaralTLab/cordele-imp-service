# Contrato da API — imp-service (Importação)

Serviço `imp-service` · Node 22 · NestJS · Prisma · PostgreSQL 16.
Base path: `/api/imp` (com o prefixo global, `/api/v1/imp`). O frontend fala com o serviço só por
esta API; nunca escreve direto no storage nem no banco.

---

## 0. Decisões gerais

### Parse síncrono

`POST /api/imp/manuscripts` faz o parse do arquivo dentro da própria requisição e devolve o
`Manuscrito` já persistido, com a árvore de conteúdo, na mesma resposta. Não existe job de parse,
`202 Accepted` nem endpoint de polling. A resposta de sucesso é `201 Created` com o
`ManuscritoDetail` completo (incluindo `estrutura`). O limite de 50 MB mantém a requisição
dentro de um tempo aceitável.

`GET /api/imp/manuscripts/{id}` existe para recarregar a tela, abrir por link direto ou retomar a
revisão. É uma leitura simples do recurso, não um teste de "já terminou?".

### Campo `status`

Mesmo com o fluxo síncrono, o `Manuscrito` tem um campo `status`. Hoje todo manuscrito persistido
volta com `status = "imported"`. Os valores `"parsing"` e `"import_failed"` estão reservados para um
eventual fluxo assíncrono no futuro, para que ele possa entrar sem mudar o schema nem o payload.

### Vínculo com o projeto editorial

O `ProjetoEditorial` pertence ao serviço de projetos (PROJ). O IMP só referencia o projeto e nunca
escreve nas tabelas dele. O upload traz **exatamente um** de dois campos, mutuamente exclusivos:

| Campo (multipart) | Significado | O que o IMP faz |
|---|---|---|
| `projetoId` (UUID) | anexar o manuscrito a um projeto **já existente** | confere, pela porta do PROJ, que o projeto existe e pertence à empresa ativa, e então vincula. Não cria nada. |
| `projetoTitulo` (string) | criar o projeto e subir o manuscrito **numa ação só** | pede ao PROJ que crie o projeto e vincula o novo manuscrito a ele. O PROJ continua sendo o único que escreve em `projeto_editorial`. |

- Sem nenhum dos dois, ou com os dois: `400`, problem type `urn:cordele:imp:invalid-project-binding`.
- Com `projetoId` de um projeto que não existe na empresa ativa: `422`, `urn:cordele:imp:projeto-not-found`.
- Com `projetoTitulo`: o projeto é criado antes do parse e o manuscrito fica vinculado ao id criado.

A tela de upload, portanto, manda `file` + `projetoTitulo` (projeto novo) **ou** `projetoId`
(projeto existente). Ela nunca inventa um id de projeto nem chama um endpoint separado de criação
de projeto nesse fluxo.

---

## 1. Convenções

- **Media type:** `application/json` nas respostas; `multipart/form-data` no upload.
- **IDs:** UUID v4 gerados pelo servidor, nunca enviados pelo cliente.
- **Datas:** ISO-8601 em UTC (`criadoEm`).
- **Erros:** RFC 7807, `application/problem+json` (ver §5).
- **Idempotência:** cada upload cria um manuscrito **novo**; manuscritos são imutáveis. Não há
  deduplicação por hash de conteúdo.

## 2. Autenticação, autorização e empresa

- **Autenticação:** Bearer JWT (`Authorization: Bearer <token>`). Sem token válido → `401`.
- **Scopes:** `imp:write` (upload e ações de curadoria), `imp:read` (leituras).
- **Empresa:** a empresa dona dos dados vem **do claim do JWT** e é aplicada pelo `EmpresaContext`
  (AsyncLocalStorage). Ela nunca é lida do path, da query nem do body.
- Se o chamador referencia um `manuscritoId` ou `projetoId` de outra empresa, a resposta é `404`,
  para não revelar que o recurso existe.

## 3. Cabeçalhos

| Cabeçalho | Direção | Observação |
|---|---|---|
| `Authorization: Bearer <jwt>` | requisição | obrigatório em todos os endpoints |
| `X-Correlation-Id` | requisição (opcional) / resposta (sempre) | propagado para os logs; gerado quando ausente |
| `Content-Type: multipart/form-data` | requisição | só no upload |
| `Content-Type: application/problem+json` | resposta | respostas de erro |

---

## 4. Recursos

### 4.1 `POST /api/imp/manuscripts` — upload + parse síncrono

Recebe um arquivo DOCX ou Markdown, faz o parse, persiste um `Manuscrito` imutável, publica
`ManuscriptImported` e devolve o resultado **na mesma resposta**.

**Scope:** `imp:write` · **Requisição:** `multipart/form-data`

| Parte | Tipo | Obrigatória | Observação |
|---|---|---|---|
| `file` | binário | sim | `.docx` ou `.md`; até 50 MB (52428800 bytes) |
| `projetoId` | texto (UUID) | condicional | projeto existente (ver §0); exclusivo com `projetoTitulo` |
| `projetoTitulo` | texto | condicional | cria o projeto e sobe o manuscrito; exclusivo com `projetoId` |

**Sucesso — `201 Created`**, corpo = `ManuscritoDetail` (§6.1), `Location: /api/imp/manuscripts/{id}`.

Comportamento:

- Arquivo suportado, dentro do limite e com vínculo de projeto válido: o parse é feito, o manuscrito é
  persistido, `ManuscriptImported` é publicado e a resposta é `201` com o `ManuscritoDetail` completo,
  `estrutura` incluída e `status = "imported"`.
- Se a extensão ou o conteúdo do arquivo não for DOCX nem Markdown: `415`
  (`urn:cordele:imp:unsupported-format`) e nada é persistido. Detalhes em §11.
- Arquivo acima de 52428800 bytes: `413` (`urn:cordele:imp:file-too-large`), antes de gravar no storage.
- Regiões que o parser não consegue estruturar são preservadas tal como estão, como trechos não
  parseados; a resposta continua `201` e `trechosNaoParseados` vem maior que zero. Conteúdo nunca é
  descartado (ver §10).
- Falha irrecuperável de parse (arquivo corrompido ou ilegível): `422` (`urn:cordele:imp:parse-failed`),
  `ManuscriptImportRejected` é publicado e nenhum manuscrito é persistido.
- O binário original é gravado no storage, sob uma chave da empresa, antes de responder com sucesso.
- `totalCapitulos`, `totalImagens` e `trechosNaoParseados` batem com o que se conta na `estrutura`
  devolvida.

### 4.2 `GET /api/imp/manuscripts/{manuscritoId}` — lê um manuscrito

Leitura simples, usada para recarregar ou abrir a revisão de estrutura por link. Não é polling: no
fluxo atual sempre volta `status = "imported"`.

**Scope:** `imp:read` · **Sucesso — `200 OK`**, corpo = `ManuscritoDetail` (§6.1).

- Manuscrito existente na empresa ativa: devolve o `ManuscritoDetail` completo.
- Manuscrito inexistente na empresa ativa: `404`.

### 4.3 `GET /api/imp/manuscripts/{manuscritoId}/estrutura` — só a árvore de conteúdo

Devolve apenas a árvore (que pode ser grande), sem reenviar os contadores.

**Scope:** `imp:read` · **Sucesso — `200 OK`**, corpo = `ContentTree` (§6.2).

### 4.4 `GET /api/imp/projetos/{projetoId}/manuscritos` — histórico de importações

Lista os manuscritos importados num projeto, do mais novo para o mais antigo. Como manuscritos são
imutáveis, é um histórico só de inserção: um novo upload acrescenta uma linha, nada é alterado.

**Scope:** `imp:read` · **Sucesso — `200 OK`**, corpo = `ManuscritoSummary[]` (§6.4).

- Projeto existente na empresa ativa: lista ordenada por `criadoEm` decrescente (pode ser vazia).
- Projeto de outra empresa ou inexistente: `404`.

---

## 5. Erros (RFC 7807 ProblemDetail)

Todos os erros usam `application/problem+json`. O `type` é uma URN estável e o campo `traceId`
repete o valor de `X-Correlation-Id` da requisição, para que o suporte consiga achar o erro nos logs.

| `type` (URN) | HTTP | Quando |
|---|---|---|
| `urn:cordele:imp:unsupported-format` | 415 | arquivo não é DOCX nem Markdown |
| `urn:cordele:imp:file-too-large` | 413 | arquivo acima de 50 MB |
| `urn:cordele:imp:invalid-project-binding` | 400 | nenhum ou ambos de `projetoId` / `projetoTitulo` |
| `urn:cordele:imp:projeto-not-found` | 422 | `projetoId` não existe na empresa ativa |
| `urn:cordele:imp:parse-failed` | 422 | arquivo ilegível / erro de parse irrecuperável |
| `urn:cordele:imp:validation` | 400 | requisição malformada (falta a parte `file`, etc.) |
| `urn:cordele:imp:unauthorized` | 401 | token ausente ou inválido |
| `urn:cordele:imp:forbidden` | 403 | token válido sem o scope necessário |
| `urn:cordele:imp:not-found` | 404 | `manuscritoId` / `projetoId` fora da empresa ativa |

Exemplo:

```json
{
  "type": "urn:cordele:imp:file-too-large",
  "title": "Manuscript exceeds the maximum upload size",
  "status": 413,
  "detail": "The file is 71.2 MB; the maximum is 50 MB.",
  "instance": "/api/imp/manuscripts",
  "traceId": "8b1f...c2"
}
```

---

## 6. Schemas

### 6.1 `ManuscritoDetail`

```json
{
  "id": "uuid",
  "projetoId": "uuid",
  "nomeArquivo": "livro-de-cordel.docx",
  "formato": "docx",
  "status": "imported",
  "totalCapitulos": 12,
  "totalImagens": 5,
  "trechosNaoParseados": 2,
  "tamanhoBytes": 8421000,
  "estrutura": { "...": "ContentTree — ver §6.2" },
  "criadoEm": "2026-08-24T14:31:46Z"
}
```

- `formato ∈ {docx, markdown}`; `status ∈ {imported, parsing, import_failed}` (hoje sempre `imported`).
- A chave do binário no storage é interna e não aparece na API.

### 6.2 `ContentTree`

Forma JSON de `estrutura`. A árvore é uma lista ordenada de capítulos; todo nó tem um `id` estável
(único dentro da árvore) e um `order` inteiro que dá a ordem no documento entre os irmãos.

```json
{
  "schemaVersion": "1.0",
  "formato": "docx",
  "chapters": [
    {
      "id": "ch-1",
      "order": 0,
      "title": "Capítulo I — A partida",
      "blocks": [ /* blocos do capítulo que aparecem antes da primeira seção */ ],
      "sections": [
        {
          "id": "sec-1-1",
          "order": 0,
          "title": "A carta",
          "blocks": [ /* Block[] */ ]
        }
      ]
    }
  ]
}
```

Um **`Block`** é uma união discriminada pelo campo `type`:

```json
// Parágrafo — texto do autor, preservado exatamente como escrito
{ "type": "paragraph", "id": "p-14", "order": 3,
  "text": "Era uma vez, no sertão...",
  "runs": [ { "text": "Era uma vez, no sertão...", "marks": ["italic"] } ] }

// Imagem — extraída (DOCX) ou referenciada (Markdown), guardada por chave
{ "type": "image", "id": "img-2", "order": 4,
  "storageKey": "emp_aetos/manuscritos/<id>/img-2.png",
  "mime": "image/png", "alt": "Mapa do sertão", "originalName": "mapa.png" }

// Trecho não parseado — preservado tal como está, nunca descartado
{ "type": "unparsed", "id": "u-1", "order": 7,
  "rawContent": "<w:tbl>...</w:tbl>",
  "reason": "complex_table",
  "sourceLocation": { "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" } }
```

Regras da árvore:

- Todo nó tem `id` único na árvore e `order` contínuo, sem buracos, entre os irmãos, começando em 0.
- O texto do parágrafo é mantido exatamente como foi escrito. A formatação inline vai em `runs`, como
  `marks` sobre trechos do texto, sem alterar o texto (`marks ⊆ {bold, italic, underline,
  strikethrough, code, superscript, subscript}`).
- `runs` é opcional; sem ele, `text` é o conteúdo canônico. Com ele, a concatenação de `runs[].text`
  tem que ser igual a `text`.
- Toda região que o parser não consegue estruturar com confiança vira um trecho não parseado, na
  ordem do documento, de forma que parágrafos + imagens + trechos não parseados cubram o arquivo
  inteiro.

### 6.3 Motivos de trecho não parseado

`UnparsedSegment.reason` é um enum fechado; `sourceLocation.kind` acompanha o `formato`.

| `reason` | Significado |
|---|---|
| `complex_table` | tabela com estrutura além de uma grade simples |
| `math_equation` | equação OMML / LaTeX / MathML |
| `nested_footnote` | notas de rodapé aninhadas ou com referências cruzadas |
| `unknown_docx_style` | estilo de parágrafo/caractere do DOCX fora do mapa de estilos |
| `unsupported_markup` | construção Markdown/HTML fora do subconjunto suportado |
| `embedded_object` | objeto OLE, gráfico, SmartArt, arquivo embutido |
| `other` | qualquer outra coisa que o parser não soube classificar (mesmo assim leva `rawContent`) |

Formas de `sourceLocation`:

```json
{ "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" }   // DOCX
{ "kind": "markdown", "line": 88, "column": 1 }                        // Markdown
```

### 6.4 `ManuscritoSummary`

```json
{ "id": "uuid", "projetoId": "uuid", "nomeArquivo": "...", "formato": "docx",
  "status": "imported", "totalCapitulos": 12, "totalImagens": 5,
  "trechosNaoParseados": 2, "criadoEm": "2026-08-24T14:31:46Z" }
```

---

## 7. Notas para o frontend

1. O upload é um único `POST` que já devolve o manuscrito parseado. Enquanto ele está em andamento, a
   tela mostra um indicador indeterminado ("analisando estrutura…"); não há loop de polling.
2. Vínculo de projeto: `file` + `projetoTitulo` (projeto novo) **ou** `file` + `projetoId` (projeto
   existente). Nunca os dois, nunca nenhum.
3. Com o `201`, a revisão de estrutura é montada direto a partir da `estrutura` da resposta; não é
   preciso uma leitura extra (os `GET` existem para recarregar/retomar).

---

## 8. Ações editoriais da revisão de estrutura

A tela de revisão de estrutura tem duas ações do editor: "Ignorar fragmento" e "Confirmar estrutura".

- "Ignorar fragmento" precisa ficar gravado no servidor; se ficasse só no cliente, o trecho ignorado
  voltaria ao recarregar a página.
- "Confirmar estrutura" avança o `ProjetoEditorial` de `rascunho` para `em_composicao`, através da
  porta do PROJ.

### 8.1 Ignorar / restaurar um trecho não parseado

Grava uma anotação editorial (linha em `segmento_curadoria`) dizendo que o editor decidiu ignorar um
trecho não parseado. **Não** altera `manuscrito.estrutura` (o manuscrito é imutável). O `GET` do
manuscrito ou da estrutura continua devolvendo a árvore original completa; o conjunto de ignorados é
lido à parte pelo frontend.

**Scope:** `imp:write`

#### `POST /api/imp/manuscripts/{manuscritoId}/segmentos/{segmentoId}/ignore`

Marca um trecho como ignorado.

- `manuscritoId` — UUID de um manuscrito existente na empresa ativa.
- `segmentoId` — o `id` de um `UnparsedSegment` da `ContentTree` do manuscrito.
- **Sucesso — `201 Created`**, corpo = `SegmentoCuradoriaDto` (§8.3).
- Se o trecho já estava ignorado: `200 OK` (repetir é inofensivo).
- `segmentoId` que não existe em `manuscrito.estrutura`: `422` (`urn:cordele:imp:segmento-not-found`).
- `manuscritoId` inexistente na empresa ativa: `404`.

#### `DELETE /api/imp/manuscripts/{manuscritoId}/segmentos/{segmentoId}/ignore`

Restaura (deixa de ignorar) um trecho.

- **Sucesso — `204 No Content`**, removendo a anotação.
- Se o trecho não estava ignorado: `404` (não há o que remover).

#### `GET /api/imp/manuscripts/{manuscritoId}/segmentos/ignored`

Devolve os `segmentoId` atualmente ignorados no manuscrito. O frontend chama junto com
`GET /api/imp/manuscripts/{manuscritoId}/estrutura` ao abrir a revisão.

- **Scope:** `imp:read`
- **Sucesso — `200 OK`**, corpo = `{ "manuscritoId": "uuid", "ignoredSegmentoIds": ["u-1", "u-3"] }`
  (a lista pode ser vazia).

### 8.2 Confirmar estrutura → avançar o status do projeto

Confirmação explícita do editor de que a revisão terminou. O IMP valida o manuscrito e delega a mudança
de status ao PROJ; **o IMP nunca escreve em `projeto_editorial`**.

**Scope:** `imp:write`

#### `POST /api/imp/manuscripts/{manuscritoId}/confirm-estrutura`

Dispara a transição `rascunho → em_composicao` do `ProjetoEditorial` dono do manuscrito.

- **Corpo da requisição:** vazio (ou `{}`).
- **Sucesso — `200 OK`**, corpo = `ConfirmEstruturaResultDto` (§8.3).

Fluxo:
1. Resolver `manuscritoId` → `projetoId` (o manuscrito tem que ser da empresa ativa).
2. Chamar a porta do PROJ para avançar o projeto para `em_composicao`.
3. Devolver o resultado com o novo `projetoStatus`.

Regras:
- Se o projeto já está em `em_composicao` (ou num status posterior), a resposta é `200` sem erro
  (confirmar de novo é inofensivo).
- Se a porta do PROJ falha ou o projeto não pode avançar: `422` (`urn:cordele:imp:status-advance-failed`)
  e nada é persistido.
- `manuscritoId` inexistente na empresa ativa: `404`.
- O IMP chama a porta do PROJ **uma única vez** por requisição de confirmação. Do lado do PROJ, a
  transição `rascunho → em_composicao` é válida e status posteriores são aceitos sem regredir.

### 8.3 Schemas

#### `SegmentoCuradoriaDto`

```json
{
  "manuscritoId": "uuid",
  "segmentoId": "u-1",
  "acao": "ignorado",
  "criadoEm": "2026-08-24T14:31:46Z",
  "criadoPor": "principal-uuid"
}
```

#### `ConfirmEstruturaResultDto`

```json
{
  "manuscritoId": "uuid",
  "projetoId": "uuid",
  "projetoStatus": "em_composicao",
  "confirmedAt": "2026-08-24T14:31:46Z"
}
```

### 8.4 Erros adicionais

| `type` (URN) | HTTP | Quando |
|---|---|---|
| `urn:cordele:imp:segmento-not-found` | 422 | `segmentoId` ausente de `manuscrito.estrutura` |
| `urn:cordele:imp:status-advance-failed` | 422 | o PROJ recusou o avanço de status |

---

## 9. Endpoint interno em lote: resumo de manuscritos por projeto

`POST /api/imp/manuscripts/summaries` (URL completa: `POST /api/v1/imp/manuscripts/summaries`)

- **Autenticação:** Bearer JWT, scope `imp:read`.
- **Empresa:** vem do usuário autenticado, como nos demais endpoints.

Corpo da requisição:

```json
{ "projetoIds": ["uuid1", "uuid2", "..."] }
```

| Campo | Tipo | Restrições |
|---|---|---|
| `projetoIds` | `string[]` | UUIDs v4; no máximo **50** itens; obrigatório |

Com 51 ou mais ids a resposta é `400` com `type: urn:cordele:imp:validation`; quem chama deve fatiar
listas maiores em blocos de até 50.

Resposta `200 OK` — projetos sem manuscrito ficam **fora** da lista (ausência quer dizer "sem
manuscrito", o que é diferente de contadores zerados):

```json
[
  { "projetoId": "uuid", "totalCapitulos": 12, "totalImagens": 34 }
]
```

Quando um projeto tem vários manuscritos, valem os contadores do mais recente (maior `criadoEm`).
A consulta é feita de uma vez para todos os ids e o mais recente de cada projeto é escolhido em
memória, sem uma consulta por projeto.

O proj-service usa este endpoint para preencher `totalCapitulos` e `totalImagens` nos cards da
biblioteca de projetos.

---

## 10. Regras de parsing

Valem para os dois parsers (DOCX e Markdown).

- **Texto verbatim.** O texto do autor sai exatamente como foi escrito, sem entidades HTML escapadas
  nem espaços reescritos. Negrito, itálico etc. viram `runs` com `marks` (§6.2), sem mexer no texto.
- **Nada é descartado.** Todo conteúdo do arquivo aparece na árvore: como parágrafo, imagem, título ou,
  se o parser não conseguir estruturar, como trecho não parseado com `rawContent`, `reason` (§6.3) e
  `sourceLocation`.
- **Capítulo implícito.** Um documento sem nenhum capítulo explícito vira um único capítulo implícito
  (`order: 0`) contendo todos os blocos.
- **Ordem contínua.** Dentro de cada nó, `order` vai de 0 a n-1 sem buracos, contando juntos blocos e
  trechos não parseados, na ordem em que aparecem no documento.
- **Imagens.** Imagens embutidas (DOCX) ou referenciadas (Markdown) viram o mesmo formato
  `Image{storageKey, mime, alt}`: o binário vai para o storage e o bloco guarda só a chave, o tipo MIME
  e o texto alternativo (string vazia quando o original não tem). O bloco nunca carrega a imagem em si
  (por exemplo, uma data URI em base64).
- **Títulos de nível 3 ou mais.** Não abrem capítulo nem seção: viram um bloco do tipo `heading`, com o
  texto do título, dentro da seção atual.

---

## 11. Validação e segurança do upload

A validação acontece **antes** de qualquer efeito colateral (storage, banco, eventos) e antes de o
arquivo chegar ao parser.

- **Tamanho:** acima de 50 MB (52428800 bytes) → `413` (`urn:cordele:imp:file-too-large`).
- **Formato:** se a extensão **ou** o conteúdo do arquivo não for DOCX ou Markdown → `415`
  (`urn:cordele:imp:unsupported-format`). A extensão sozinha não basta: um PDF renomeado para `.docx`
  é recusado com `415`, não tratado como DOCX corrompido. Um DOCX é um pacote ZIP do Word com
  `word/document.xml`; um Markdown é texto UTF-8 válido. O formato antigo do Word (`.doc` binário)
  não é suportado.
- **Macros:** DOCX com macros (projeto VBA embutido ou tipo de conteúdo habilitado para macro) é
  recusado com `415`.
- **Zip bomb:** um DOCX cujo conteúdo descompactado declarado é desproporcional ao limite de upload é
  recusado sem ser descompactado pelo parser.
- Um arquivo recusado não gera manuscrito, não grava nada no storage e não publica evento.
