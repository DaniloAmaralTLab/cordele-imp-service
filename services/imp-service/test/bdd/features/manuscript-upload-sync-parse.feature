# Covers SPEC-01 (API surface) and SPEC-02 (import orchestration).
# Authoritative decisions: D-A (synchronous parse, no polling), D-C (project binding).
Feature: Synchronous manuscript upload and parse

Background:
  Given an authenticated editor of empresa "aetos" with scope "imp:write"
  And an existing project "proj-100" in the active empresa

Scenario: Upload a clean DOCX into an existing project returns the parsed manuscript synchronously
  When the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"
  Then the response status is 201
  And the response body contains a manuscritoId
  And the response body field "status" is "imported"
  And the response body contains the content tree "estrutura"
  And the manuscript reports 3 chapters and 2 images and 0 unparsed segments
  And the response contains no field "parseJobId"

Scenario: Create-and-upload in one action creates the project through PROJ
  When the editor uploads "livro.md" with projetoTitulo "Meu Novo Livro"
  Then the response status is 201
  And a ProjetoEditorial titled "Meu Novo Livro" was created via the PROJ port
  And the manuscript is bound to that new project

Scenario: Ambiguous project binding is rejected
  When the editor uploads "livro.md" with both projetoId "proj-100" and projetoTitulo "X"
  Then the response status is 400
  And the problem type is "urn:cordele:imp:invalid-project-binding"

Scenario: Missing project binding is rejected
  When the editor uploads "livro.md" with no project binding
  Then the response status is 400
  And the problem type is "urn:cordele:imp:invalid-project-binding"

Scenario Outline: Unsupported and oversized files are rejected before any persistence
  When the editor uploads "<fixture>" with projetoId "proj-100"
  Then the response status is <status>
  And the problem type is "<type>"
  And no manuscript is persisted

  Examples:
    | fixture           | status | type                                |
    | livro.pdf         | 415    | urn:cordele:imp:unsupported-format  |
    | livro-51mb.docx   | 413    | urn:cordele:imp:file-too-large      |

Scenario: Referencing a project not in the active empresa is rejected
  # SPEC-10 / D-C: projetoId not resolved within the active empresa → 422 projeto-not-found.
  # Both "not found at all" and "belongs to another tenant" yield 422 (the active schema
  # is queried exclusively; cross-tenant existence is never disclosed on POST).
  Given a project "proj-999" belonging to empresa "outra"
  When the editor uploads "livro.md" with projetoId "proj-999"
  Then the response status is 422
  And the problem type is "urn:cordele:imp:projeto-not-found"

Scenario: Irrecoverable parse failure is rejected with no persistence
  # api-contract.md §4.1 EARS: IF parsing fails irrecoverably, THE SYSTEM SHALL respond 422,
  # emit ManuscriptImportRejected, and persist no manuscript.
  When the editor uploads "livro-corrompido.docx" with projetoId "proj-100"
  Then the response status is 422
  And the problem type is "urn:cordele:imp:parse-failed"
  And no manuscript is persisted
