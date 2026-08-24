# Covers SPEC-03 (deterministic parsing & unparsed-segment detection).
# Enforces local ADR-002: content is sacrosanct; lossless by disclosure.
Feature: Lossless parsing with unparsed-segment disclosure

Background:
  Given an authenticated editor of empresa "aetos" with scope "imp:write"
  And an existing project "proj-100" in the active empresa

Scenario: A complex table is preserved as an unparsed segment, not dropped
  When the editor uploads "livro-com-tabela-complexa.docx" with projetoId "proj-100"
  Then the response status is 201
  And the manuscript reports at least 1 unparsed segment
  And the content tree contains an unparsed node with reason "complex_table"
  And that unparsed node carries the original raw content verbatim
  And that unparsed node carries a sourceLocation of kind "docx"

Scenario: Author paragraph text is never altered
  When the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"
  Then every paragraph node's text equals the source text verbatim
  And for each paragraph with runs the concatenation of runs equals the paragraph text

Scenario: The whole source is accounted for
  When the editor uploads "livro-com-tabela-complexa.docx" with projetoId "proj-100"
  Then the union of paragraph, image and unparsed nodes accounts for the entire source

Scenario: Parsing is deterministic
  When the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"
  And the editor uploads "livro-3-capitulos.docx" again with projetoId "proj-100"
  Then both content trees are structurally identical

Scenario Outline: Unstructurable regions are classified by a closed reason enum
  When a source region cannot be confidently structured because of "<region>"
  Then it is emitted as an unparsed node with reason "<reason>"

  Examples:
    | region              | reason              |
    | complex table       | complex_table       |
    | math equation       | math_equation       |
    | nested footnote     | nested_footnote     |
    | unknown docx style  | unknown_docx_style  |
    | unsupported markup  | unsupported_markup  |
    | embedded object     | embedded_object     |
    | unclassifiable node | other               |
