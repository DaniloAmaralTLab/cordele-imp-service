# Covers SPEC-04 (data model), SPEC-05 (idempotency/immutability) and SPEC-06 (tenancy/security).
Feature: Manuscript immutability, history and tenant isolation

Background:
  Given an authenticated editor of empresa "aetos"

Scenario: Re-uploading the same file creates a new manuscript, never mutating the old one
  Given an existing project "proj-100" in the active empresa
  And a manuscript "man-1" already imported into "proj-100"
  When the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"
  Then the response status is 201
  And a new manuscritoId different from "man-1" is returned
  And manuscript "man-1" is unchanged

Scenario: A project's import history is append-only and newest-first
  Given an existing project "proj-100" with 2 imported manuscripts
  When the editor lists manuscripts of project "proj-100"
  Then the response status is 200
  And 2 manuscripts are returned ordered by criadoEm descending

Scenario: Reading a manuscript of another empresa is not found
  Given a manuscript "man-x" belonging to empresa "outra"
  When the editor reads manuscript "man-x"
  Then the response status is 404

Scenario: A read without the required scope is forbidden
  Given the editor's token lacks scope "imp:read"
  When the editor reads manuscript "man-1"
  Then the response status is 403

Scenario: Deleting the owning project cascades to its manuscripts
  Given an existing project "proj-200" with 1 imported manuscript
  When the project "proj-200" is deleted by the PROJ context
  Then the manuscripts of "proj-200" are removed
  And their stored binaries and images are purged
