# OpenAPI Specs

Pasta para os arquivos OpenAPI (`*-openapi.yaml`) **gerados** por cada microserviço.

> ⚠️ **Esses arquivos não são escritos à mão.** São gerados pelo `springdoc-openapi` em cada serviço e copiados para cá pelo CI (ou pelo `/be-architect-specs`).

## Como gerar/atualizar

### Local (1 serviço)

```bash
# Sobe o serviço
./gradlew :<service>:bootRun

# Em outro terminal, baixa o spec
curl http://localhost:8082/v3/api-docs.yaml > docs/architecture/shared/contratos/openapi/cadastros-openapi.yaml

# Para todos os serviços de uma vez (script utilitário):
python scripts/gh_pipeline.py openapi-dump --all
```

### CI

O job `openapi-sync` (`.github/workflows/openapi.yml`) sobe cada serviço, baixa o spec, e abre PR se houve mudança.

## Quando atualizar

- Adicionou endpoint REST novo no controller → regerar o spec do serviço afetado.
- Mudou shape de DTO (record record-class) → regerar.
- Adicionou/removeu/renomeou `error.code` → atualizar mas verificar `error-model.md` também.

## Consumo pelo Frontend

O frontend gera SDKs TS a partir desses YAMLs:

```bash
# Em frontend/
npm run gen:sdk:cadastros
# → libs/shared/contracts/src/lib/cadastros/ (interfaces + ApiServices tipados)
```

Componentes Angular consomem:

```typescript
import { CadastrosApi, ClienteResponse } from '@cordele/shared/contracts/cadastros';
```

## Arquivos esperados (1 por serviço)

```
openapi/
├── README.md                    (este)
├── iam-openapi.yaml             (gerado por <service>)
├── cadastros-openapi.yaml       (gerado por <service>)
├── comercial-openapi.yaml
├── fiscal-openapi.yaml
├── rtc-openapi.yaml
├── financeiro-openapi.yaml
├── estoque-openapi.yaml
├── crm-openapi.yaml
├── logistica-openapi.yaml
├── auditoria-openapi.yaml
└── gateway-openapi.yaml         (consolidado pelo gateway, opcional)
```

## Convenções no spec

Configuradas via `springdoc.application.yml` em cada serviço:

- `info.title` = `<Modulo> Service API` (ex: `Cadastros Service API`)
- `info.version` = versão do build (ex: `1.4.2`)
- `info.contact.email` = `arquitetura@cordele.local`
- `servers[0].url` = `/api/<modulo>` (sob o gateway)
- `tags` = grupos por recurso (`Clientes`, `Produtos`, `Fornecedores`)
- `components.schemas.ProblemDetail` = sempre incluso (referência no error-model)
- `security` = `bearerAuth` em todos os endpoints (exceto `/health`, `/info`)

## Anti-patterns

- ❌ Editar o YAML à mão (mudanças se perdem na próxima geração).
- ❌ Versionar diff cosmético (formatação) — usar `npm run format:openapi` antes do commit.
- ❌ Misturar specs de versões diferentes (sempre o spec atual do `main`).
