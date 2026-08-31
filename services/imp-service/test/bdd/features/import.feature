# Acceptance criteria for the IMP manuscript-import API.
# Runs against a NestJS test application with in-memory fakes (no PostgreSQL required).
# Covers SPEC-01 (API surface) and the parse-failure path (SPEC-02).
Feature: Manuscript import API

  Background:
    Given an authenticated editor with empresa "aetos" and scope "imp:write"

  Scenario: Upload a DOCX manuscript into an existing project returns 201
    When the editor posts a manuscript upload with filename "livro-3-capitulos.docx" and a valid projetoId
    Then the response status is 201
    And the response body contains a manuscript id
    And the response body field "status" equals "PENDING_REVIEW"

  Scenario: Upload request without projetoId is rejected with 400
    When the editor posts a manuscript upload without a projetoId
    Then the response status is 400

  Scenario: Upload request with a non-UUID projetoId is rejected with 400
    When the editor posts a manuscript upload with projetoId "not-a-uuid"
    Then the response status is 400

  Scenario: Reading a manuscript that does not exist returns 404
    When the editor reads the manuscript with id "00000000-0000-0000-0000-000000000000"
    Then the response status is 404

  Scenario: Uploading a corrupt DOCX causes parse failure and returns 422
    Given the parser will fail for the next request
    When the editor posts a manuscript upload with filename "livro-corrompido.docx" and a valid projetoId
    Then the response status is 422
