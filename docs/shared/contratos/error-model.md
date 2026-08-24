# Error Model — `ProblemDetail` RFC 7807

> Modelo único de erro HTTP para todo o Cordelê. Aplica a BE (`@RestControllerAdvice`) e FE (interceptor que normaliza para `ApiError`).
>
> **Fonte de verdade:** `templates/architecture/decisions/error-model.arch.json` (D-064).
> Este markdown é gerado deterministicamente. Não editar à mão — o próximo render sobrescreve.

## Princípio

- **Todos os endpoints REST retornam `application/problem+json`** em casos de erro (RFC 7807).
- **Status code reflete o tipo do erro**, mas o `error.code` (campo do payload) é a fonte de verdade para o FE decidir UI.
- **Mensagem amigável vai em `title`**, técnica em `detail`. O FE mostra `title` por padrão.
- **`error.code` é namespace-prefixado** por módulo (`<modulo>.<recurso>.<situacao>`) — facilita i18n e branching no FE.

## Schema canônico

```jsonc
// HTTP 422 Unprocessable Entity
// Content-Type: application/problem+json
{
  "type": "https://cordele.com/errors/cad.cliente.duplicado",
  "title": "Cliente já cadastrado",
  "status": 422,
  "detail": "Já existe cliente ativo com CNPJ 12.345.678/0001-90 (id=550e8400-e29b-41d4-a716-446655440000)",
  "instance": "/api/cadastros/v1/clientes",
  "error": {
    "code": <string>,
    "category": <enum-of-categories>,
    "correlationId": <uuid>,
    "timestamp": <ISO-8601>,
    "fields": <array<field-error>> // opcional,
    "context": <object> // opcional
  }
}
```

### Extension fields sob `error`

- **`code`** (string, required) — Stable identifier for the error, namespace-prefixed by module (e.g. 'cad.cliente.duplicado'). Source for i18n keys and FE branching.
- **`category`** (enum-of-categories, required) — One of categories[*].id. Drives default FE behaviour.
- **`correlationId`** (uuid, required) — Request correlation id from MDC; pairs the error with backend logs.
- **`timestamp`** (ISO-8601, required) — Server time when the error was emitted (with timezone).
- **`fields`** (array<field-error>, optional) — Field-level errors (used by 'validation' category). Each entry: {field, message, rejectedValue?}.
- **`context`** (object, optional) — Free-form metadata for debug or FE display logic (e.g. clienteIdExistente, valorTomathe, codigoSefaz).

## Categorias canônicas (campo `error.category`)

| Category | HTTP padrão | Valid statuses | FE hint | Quando usar |
|---|---|---|---|---|
| `validation` | 422 | 400, 422 | `show_field_marks` | Input is syntactically or semantically invalid (CNPJ malformed, required field empty, date out of format). Detectable BEFORE touching the database. |
| `auth` | 401 | 401 | `redirect_login` | Not authenticated, token expired or session invalid. |
| `forbidden` | 403 | 403 | `show_forbidden_alert` | Authenticated but lacking permission for the requested resource or action. |
| `not_found` | 404 | 404 | `redirect_or_message` | Resource doesn't exist (or is not visible to the current data-scope). |
| `conflict` | 409 | 409 | `show_dialog_with_resolution` | State conflict — duplicate key, concurrency violation, version mismatch. |
| `rate_limit` | 429 | 429 | `retry_with_backoff` | Exceeded the rate limit configured at the gateway. |
| `upstream_error` | 502 | 502, 503, 504 | `show_retry_hint` | Failure in a downstream dependency (Feign call, SEFAZ, Calculadora Oficial, external service). |
| `internal_error` | 500 | 500 | `log_and_show_generic_alert` | Genuine server bug — unhandled exception path. Falls through to GlobalExceptionHandler's generic handler. |
| `business_rule` | 422 | 422 | `show_dialog_with_context` | Input is valid but violates a domain rule that depends on state (cliente já existe, estoque insuficiente, caixa já aberto). Detectable only after consulting the database or another service. |
| `session_stale` | 401 | 401 | `force_refresh_and_relogin` | JWT carries an outdated access-model version (modelo_acesso_versao). FE must refresh the access decision and retry. |

## Catálogo de `error.code` por módulo

> 0 módulos com erros catalogados (cresce conforme novas features são adicionadas via service-specs).

## Total

**0 códigos canônicos** distribuídos em 0 módulos. Crescimento esperado: ~5-10 por módulo conforme features novas pousam.

## Implementação BE — `@RestControllerAdvice`

Cada serviço tem `infrastructure/exception/<Module>ExceptionHandler.java` que estende handler base de `shared/error-model`. O `GlobalExceptionHandler` (gerado via `be-module-generator`) captura exceções não tratadas e devolve `internal_error` por padrão.

```java
@RestControllerAdvice
public class <Module>ExceptionHandler extends CordelêExceptionHandler {

    @ExceptionHandler(ClienteDuplicadoException.class)
    public ProblemDetail handleClienteDuplicado(ClienteDuplicadoException ex, HttpServletRequest req) {
        return problem(HttpStatus.CONFLICT, "cad.cliente.duplicado", ex)
            .title("Cliente já cadastrado")
            .detail(String.format("Já existe cliente ativo com CNPJ %s (id=%s)", ex.cnpj(), ex.clienteIdExistente()))
            .context(Map.of("clienteIdExistente", ex.clienteIdExistente()));
    }
}
```

Erros não tratados explicitamente caem em `handleGeneric(Throwable)` → status 500, `error.code = internal_error.unhandled`.

## Implementação FE — Interceptor

`libs/shared/error-model/src/lib/error.interceptor.ts`:

```typescript
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        const apiError = this.normalize(err);
        this.errorBus.publish(apiError);
        return throwError(() => apiError);
      })
    );
  }
}
```

Components usam:

```typescript
const error = signal<ApiError | null>(null);

salvar() {
  this.api.criarCliente(req).subscribe({
    next: c => this.router.navigate(['/cad/clientes', c.id]),
    error: (err: ApiError) => {
      error.set(err);
      // UI mostra err.title; se err.error.fields, marca campos
    }
  });
}
```

O FE pode usar `error.category` + `fe_action_hint` da tabela acima para decidir affordance — por exemplo, `show_field_marks` para `validation`, `show_dialog_with_context` para `business_rule`.

## Categoria `business_rule` vs `validation`

- **`validation`** — input *sintaticamente ou semanticamente* inválido (CNPJ malformado, data fora do formato, campo obrigatório vazio). Sempre detectável **antes** de tocar BD.
- **`business_rule`** — input válido mas viola regra do domínio que depende de estado (`cliente já existe`, `estoque insuficiente`, `caixa já aberto`). Detectável **só após** consultar BD/outro serviço.

Distinguir importa porque:
- `validation` → FE marca campos via `error.fields[]` (hint `show_field_marks`).
- `business_rule` → FE mostra dialog explicando o porquê via `error.context` (hint `show_dialog_with_context`).

## Internacionalização

- Frontend carrega `i18n/pt-BR/errors.json` com chaves = `error.code`:
  ```json
  {
    "cad.cliente.duplicado": "Cliente já cadastrado",
    "rtc.calculadora-oficial.offline": "Calculadora Oficial RFB indisponível — tente novamente"
  }
  ```
- Se chave não existe, usa `title` do backend como fallback.
- Os `title` declarados no JSON são valores **default** em pt-BR; i18n é responsabilidade do FE.

## Como adicionar erro novo

1. Editar `templates/architecture/decisions/error-model.arch.json` — adicionar entrada em `modules[prefix=<modulo>].errors`.
2. Validar: `python scripts/arch_decisions.py validate --aspect error-model`.
3. Bumpar `version` e `last_changed`.
4. Re-renderizar este documento (`new-project` P2 ou comando equivalente).
5. No BE: lançar exceção específica + handler no `<Module>ExceptionHandler` retornando o code recém-declarado.
6. No FE: adicionar tradução em `i18n/pt-BR/errors.json` keyed pelo code.

## Anti-patterns

- ❌ Editar este markdown direto — ele é gerado. Próximo render sobrescreve.
- ❌ Retornar `400 Bad Request` com body custom (sem `ProblemDetail`) — quebra interceptor FE.
- ❌ Usar `500` para erros de regra de negócio (deveria ser `422` com `business_rule`).
- ❌ Misturar campos de validation no nível raiz (deve ir em `error.fields[]`).
- ❌ Vazar stack trace no `detail` em produção (só em ambiente dev).
- ❌ Esquecer `correlationId` no `error` (impossível rastrear no log).
- ❌ Inventar code ad-hoc em código sem registrar no JSON — quebra i18n + branching FE.

## Referências

- RFC 7807 ProblemDetail: https://datatracker.ietf.org/doc/html/rfc7807
- BE exception handling: [[../../backend/standards/hexagonal-patterns]] §exception
- FE Access Layer: [[../../frontend/standards/access-layer-contracts]]
- libs/shared/error-model (Nx lib FE): documentado em `frontend/libs/shared/error-model/README.md`
