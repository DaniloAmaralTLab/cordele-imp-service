<!-- OUTPUT-SCHEMA
- Status
- Contexto
- Decisão
- Consequências
-->

# ADR-002 — Manuscript immutability and lossless parse

## Status
accepted (2026-08-24) · Scope: the Import (IMP) context of Cordelê

## Contexto
Cordelê's central promise is that **the system never alters the author's content** (framing §2.1) and
is transparent about what it does and does not understand (framing §2.5, UX principle 1). Manuscripts
are often unpublished creative work (framing §2.7). Two failure modes must be designed out from the
start: (a) silently editing or normalizing author text to make a parse look clean, and (b) dropping
content the parser cannot structure (complex tables, equations, nested footnotes, unknown DOCX
styles) so it simply disappears. Both destroy trust and are hard to detect after the fact.

A related question is how to treat re-imports and corrections: mutating an existing manuscript in
place would make the "what did the system produce from my file" answer non-reproducible.

## Decisão
The Import context adopts two hard invariants:

1. **Immutability.** A `Manuscrito` is frozen once imported. Corrections and re-uploads create a
   **new** manuscript; existing ones are never mutated. This keeps import reproducible and auditable.
2. **Lossless by disclosure.** Parsing never edits or drops source content. Anything the parser
   cannot confidently structure is preserved verbatim as an **`UnparsedSegment`** (raw content +
   source location + reason) inside the content tree and counted in `trechosNaoParseados`. The union
   of parsed nodes and unparsed segments must account for the entire source. Unparsed segments are
   surfaced to the editor in Structure Review (T04), never suppressed to force a clean result.

Format parsing (mammoth for DOCX, remark for Markdown) sits behind `ManuscriptParserPort`; the port
contract requires the adapter to report unparsed regions rather than swallow them.

## Consequências
Positive: the platform's core trust promise is enforced structurally, not by convention; imports are
reproducible; editors always see the truth about coverage; downstream contexts can rely on the counts
being honest. The port contract makes "report, don't drop" a testable obligation of every parser.

Negative / trade-offs: storage grows with each re-upload (no in-place edit; mitigated by lifecycle
rules in doc 05 and an optional content-hash dedupe, left open in doc 06). A non-zero unparsed count
is visible to editors and may read as "the tool failed", so UX must frame it as "needs a human look"
rather than an error. Defining the unparsed-segment taxonomy precisely is deferred to the Specs phase
(gap in doc 06).
