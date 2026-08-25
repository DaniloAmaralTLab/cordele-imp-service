# IMP-INT-005 -- FileStoragePort S3-compatible adapter (production path)

**Status:** in-review -- implementado 2026-08-25 (P8)
**Maturidade:** 0 -- Inicial

## Contexto

Production complement to the local-disk adapter (IMP-016). The S3 adapter implements
`FileStoragePort` using AWS SDK v3 (or MinIO-compatible endpoint). Same key scheme.
Selected when `IMP_STORAGE_DRIVER=s3`. Local-disk remains the POC default.

## Spec de referencia
- SPEC-10 (integration-contracts.md §1)

## Escopo

Files to create:

- `src/infrastructure/storage/imp/s3.adapter.ts` — implements `FileStoragePort` using `@aws-sdk/client-s3` (streaming put/get/delete)
- `src/infrastructure/storage/imp/s3.adapter.spec.ts` — unit tests with mocked S3Client

## Resultado esperado

`IMP_STORAGE_DRIVER=s3` selects S3 adapter at application startup. `pnpm test` on S3 adapter spec passes.

## Criterios de aceite

- [x] S3 adapter implements `FileStoragePort` interface (same 3 methods)
- [x] Key scheme matches local-disk: `emp_<slug>/manuscritos/<id>/...`
- [x] `put()` uses streaming upload (no full buffer in memory for 50MB files)
- [x] `delete()` no-ops silently on key not found (S3 SDK 404 swallowed)
- [x] `pnpm test` exits 0

## Dependencias

- IMP-016 (precede — FileStoragePort interface defined)

## Estimativa
M

## Prioridade
P9
