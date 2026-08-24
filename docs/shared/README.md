# Arquitetura -- Shared (Backend + Frontend)

Documentos que atravessam BE e FE, ou que descrevem contratos/dados/regras que ambos consomem.

## Estrutura

```
docs/architecture/shared/
├── modelo-dados/              # Modelagem Postgres (DDL canônico)
│   ├── README.md              # Índice
│   ├── cordele-global.md      # Schema global (usuários, RBAC, catálogos)
│   ├── empresa.md             # Template do schema emp_*
│   └── relacionamentos.md     # Mapa de FKs entre módulos
├── contratos/                 # Contratos de API (OpenAPI gerado por serviço)
│   ├── README.md
│   ├── iam-openapi.yaml
│   ├── cadastros-openapi.yaml
│   └── ...
├── rbac/                      # Modelo de papéis e permissões
│   ├── README.md
│   ├── papeis.md              # Lista de papéis canônicos
│   ├── permissoes.md          # Lista de permissões por módulo
│   └── matriz-papel-permissao.md
├── multi-empresa.md           # ADR: schema-per-empresa, EmpresaContextHolder, propagação
└── etl-legado/                # Mapeamento legado → novo (substitui MAPEAMENTO_DADOS_LEGADO.md raiz a longo prazo)
    ├── README.md              # Por enquanto, apenas índice para os .md raiz
    └── status-por-entidade.md # tabela: clientes ✅, produtos ✅, vendas ✅ 99%, compras ⚠️
```

## Documentos críticos a ler primeiro

1. **`multi-empresa.md`** — define como o sistema isola as empresas do grupo. Tudo depende disto.
2. **`modelo-dados/README.md`** — aponta para `sql/01_schema_novo.sql` (DDL canônico).
3. **`rbac/README.md`** — Cordelê sem RBAC funcional é o erro #1 do protótipo (ver memória `prototipo-madeiraerp`).
4. **`etl-legado/status-por-entidade.md`** — o que está pronto para migrar, o que precisa retrabalho.

## Documentos raiz que ainda são fonte de verdade

Estes ficam onde estão até serem consolidados aqui:

- `MODELO_DADOS.md` — modelo conceitual narrativo
- `MAPEAMENTO_DADOS_LEGADO.md` — depara legado → novo
- `PLANO_MIGRACAO.md` — fases da migração
- `PROVA_CONCEITO_CLIENTES.md`, `PROVA_CONCEITO_VENDAS.md` — provas executadas
- `ANALISE_RECUPERACAO_CHAVES.md` — achado crítico sobre PKs do dump legado
- `ANALISE_COMPLETA.md` — diagnóstico geral
- `TELAS_FALTANTES.md` — telas do legado ausentes no MadeiraERP
- `INVESTIGACAO_COMPRAS.md` — caso específico (itens de compra ausentes do dump)
