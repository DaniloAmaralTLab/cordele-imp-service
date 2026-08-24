# Enforcement de Data Scope — Como o BE/FE filtra os dados

> Estratégia técnica para aplicar [[data-scope]] de forma **automática e à prova de esquecimento**, sem depender do desenvolvedor lembrar de filtrar em cada query.

## Decisão arquitetural

**O Cordelê usa Hibernate Filter como mecanismo primário.** Alternativas avaliadas e rejeitadas estão no fim deste doc.

| Camada | Mecanismo | Quando aplica |
|---|---|---|
| **BE — query padrão** | `@Filter` Hibernate ativado por `EmpresaContextHolder` | Sempre — repositories JPA |
| **BE — query customizada** | Validação explícita na entrada do `application.service` | Quando usa `EntityManager` direto / native query |
| **BE — controller** | `@PostFilter` ou `@PostAuthorize` Spring Security | Lista derivada de fontes mistas |
| **FE — listagens** | Backend devolve já filtrado; FE só renderiza | Sempre — FE não tenta filtrar |
| **FE — UI condicional** | `*hideWhen="!can('com.venda.editar', venda)"` (diretiva custom) | Esconder ações em items que o usuário vê mas não pode editar |

## Por que Hibernate Filter (e não Row-Level Security do Postgres)

- ✅ **Aplicação-agnóstica**: funciona com qualquer banco; troca de Postgres não quebra.
- ✅ **Visível em código**: o filtro está num `@Filter` na entidade — review pega facilmente.
- ✅ **Performance**: filtro vira `WHERE` na SQL; índices funcionam normalmente.
- ✅ **Testável**: integra com Testcontainers sem privilégios especiais.
- ❌ Não protege se alguém usa `EntityManager.createNativeQuery()` direto — para esses casos, validação manual.

RLS Postgres seria mais à prova de balas, mas exige configurar `SET LOCAL app.current_user`, complica migrations e tem custo de testes (Testcontainers como `postgres` em vez de `app`).

## Estrutura no Backend

### 1. Definição do filter na entidade

```java
// emp.<modulo>.infrastructure.persistence.entity.VendaEntity
package @cordele.comercial.infrastructure.persistence.entity;

@Entity
@Table(name = "venda")
@FilterDef(
    name = "vendaPorVendedor",
    parameters = @ParamDef(name = "vendedorId", type = UUID.class)
)
@Filter(
    name = "vendaPorVendedor",
    condition = "vendedor_id = :vendedorId"
)
public class VendaEntity {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID vendedorId;
    // ... outros campos
}
```

### 2. Aspecto que ativa o filter por request

```java
// shared/empresa-context/src/main/java/com/cordele/shared/security/DataScopeFilterAspect.java
@Component
@RequiredArgsConstructor
public class DataScopeFilterAspect {

    private final EntityManager em;
    private final AccessContextHolder accessCtx;
    @Around("execution(* @cordele..application.service..*(..))")
    public Object aroundService(ProceedingJoinPoint pjp) throws Throwable {
        Session session = em.unwrap(Session.class);
        DataScope scope = accessCtx.requireDataScope();   // lê do contexto da request
        try {
            // Ativa o filter correspondente ao tipo de scope
            if ("VENDEDOR".equals(scope.tipo())) {
                session.enableFilter("vendaPorVendedor")
                       .setParameter("vendedorId", UUID.fromString(scope.valores().get(0)));
            } else if ("LOCAL_ESTOQUE".equals(scope.tipo())) {
                session.enableFilter("movimentoPorLocal")
                       .setParameter("localId", UUID.fromString(scope.valores().get(0)));
            } else if ("LOCAIS".equals(scope.tipo())) {
                session.enableFilter("movimentoPorLocais")
                       .setParameterList("localIds", scope.valoresUuid());
            }
            // tipo null = sem restrição = não ativa filtro
            return pjp.proceed();
        } finally {
            session.disableAllFilters();   // limpa ao sair (para não vazar entre requests no pool)
        }
    }
}
```

### 3. Application service (sem precisar lembrar do filtro)

```java
@Service
@Transactional
@RequiredArgsConstructor
public class ListarVendasService {

    private final VendaRepository repo;
    private final EmpresaContextHolder empresaCtx;
    public List<Venda> executar(ListarVendasQuery q) {
        empresaCtx.require();           // RULE-07 enforcement
        // O filtro Hibernate já está ativo via DataScopeFilterAspect.
        // Esta query devolve só vendas no escopo do usuário automaticamente.
        return repo.findByDataEmissaoBetween(q.inicio(), q.fim())
                   .stream().map(toDomain()).toList();
    }
}
```

### 4. Query customizada (sem filter automático)

Se você usa `@Query("SELECT v FROM VendaEntity v WHERE ...")` ou native query, o filter **continua aplicando** (Hibernate aplica em queries HQL/JPQL).

Mas se usa `EntityManager.createNativeQuery("SELECT * FROM venda ...")`, **não aplica** — você deve adicionar manualmente:

```java
// query nativa — aplicar filter à mão
public List<RelatorioVenda> relatorio() {
    DataScope scope = accessCtx.requireDataScope();
    StringBuilder sql = new StringBuilder("SELECT ... FROM venda WHERE 1=1 ");
    if ("VENDEDOR".equals(scope.tipo())) {
        sql.append("AND vendedor_id = :vendedorId ");
    }
    Query q = em.createNativeQuery(sql.toString(), RelatorioVenda.class);
    if ("VENDEDOR".equals(scope.tipo())) {
        q.setParameter("vendedorId", scope.valores().get(0));
    }
    return q.getResultList();
}
```

Há um teste ArchUnit que detecta queries nativas sem chamada a `requireDataScope()`:

```java
@ArchTest
static final ArchRule nativeQueryDeveValidarDataScope =
    methods().that().areAnnotatedWith(Query.class)
             .and().areMetaAnnotatedWith(NativeQuery.class)
             .should().beAnnotatedWith(DataScopeValidated.class);
```

## Validação por item (read único)

`GET /api/v1/comercial/vendas/{id}` precisa validar que o item retornado está no escopo:

```java
public Venda obter(UUID vendaId) {
    Venda venda = repo.findById(vendaId)
        .orElseThrow(() -> new NotFoundException("com.venda.nao-encontrada"));
    if (!accessCtx.scopeIncludes(venda.getVendedorId(), "VENDEDOR")) {
        throw new ForbiddenException("com.venda.fora-de-escopo");
    }
    return venda;
}
```

`accessCtx.scopeIncludes(<id>, <tipo>)` retorna `true` se:
- `dataScope.tipo == null` (sem restrição), OU
- `dataScope.tipo == <tipo>` e `<id> ∈ dataScope.valores`.

## Frontend

O FE **nunca filtra dados sensíveis** — backend já devolve filtrado. Mas o FE pode **ocultar ações** em items que o usuário vê mas não pode editar (raro com data_scope, mas pode acontecer com permissões).

```typescript
// Em template Angular
@if (access.can('com.venda.cancelar', venda)) {
  <button (click)="cancelar(venda)">Cancelar</button>
}
```

O método `access.can(permissao, item?)` usa o `AccessDecision` em memória + (se `item` é dado) compara com `dataScope`.

## Configuração de filters por módulo

Cada módulo declara seus filters em `domain/persistence-filters.md`:

| Módulo | Filter name | Entidades afetadas | Tipo data_scope |
|---|---|---|---|
| comercial | `vendaPorVendedor` | VendaEntity, OrcamentoEntity, PedidoVendaEntity, ComissaoEntity | VENDEDOR |
| crm | `oportunidadePorVendedor` | OportunidadeEntity, LeadEntity, TarefaEntity | VENDEDOR |
| estoque | `movimentoPorLocal` | MovimentoEstoqueEntity, SaldoEstoqueEntity | LOCAL_ESTOQUE |
| estoque | `movimentoPorLocais` | MovimentoEstoqueEntity, SaldoEstoqueEntity | LOCAIS |
| estoque | `transferenciaPorLocal` | TransferenciaEstoqueEntity | LOCAL_ESTOQUE / LOCAIS |
| financeiro | `tituloReceberPorVendedor` | TituloReceberEntity (join com venda) | VENDEDOR |
| logistica | `entregaPorVendedor` | EntregaEntity (join com venda) | VENDEDOR |

## Alternativas rejeitadas

### Row-Level Security (RLS) Postgres
- ✅ À prova de balas (banco enforça)
- ❌ Requer `SET LOCAL app.current_user = ...` em cada transação (overhead)
- ❌ Testcontainers precisa user diferente para criar tabela vs ler
- ❌ Erro no SET vaza dados — sem aviso
- ❌ Migrations complicadas (precisa `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)

### `@PostFilter` Spring Security
```java
@PostFilter("filterObject.vendedorId == authentication.dataScope")
public List<Venda> listar() { return repo.findAll(); }
```
- ✅ Declarativo
- ❌ **Carrega todas as linhas do BD** e filtra em memória — desastre de performance em listagens com milhares de registros
- ❌ Paginação fica errada (page de 20 vira 3 após filtro)

### Filtragem manual no service
- ✅ Explícito
- ❌ Esquece — não tem como garantir que ninguém pulou
- ❌ Duplica código

### MultiTenantConnectionProvider (Hibernate)
- ✅ Próximo do RLS (1 schema por tenant)
- ❌ Não escala para data_scope por usuário dentro do mesmo schema (já usamos para empresa, não para vendedor)

## Anti-patterns

- ❌ Esquecer `session.disableAllFilters()` no `finally` — vaza filter entre requests no connection pool.
- ❌ Ativar filter ANTES de `empresaCtx.require()` — pode pegar contexto errado.
- ❌ Filtros com `OR null` (`WHERE vendedor_id = :id OR :id IS NULL`) — confunde otimizador, perde índice.
- ❌ Aplicar data_scope no FE como única defesa — sempre BE primeiro.
- ❌ Hardcoded `where vendedor_id = '...'` em código — quebra o automatismo.

## Referências

- Conceito de data_scope + cenários: [[data-scope]]
- Modelo RBAC: [[modelo]]
- Hibernate Filters: https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#pc-filter
- Spring Security `@PostFilter`: https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html#postfilter-annotation
