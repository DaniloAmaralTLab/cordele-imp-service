// @ts-check
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

/**
 * ESLint (flat config) for .
 *
 * Hexagonal boundaries (RULE-01..09 equivalent):
 *   domain/          pure — no Nest, no Prisma, no infrastructure, no modules
 *   modules/         may use Nest; reaches persistence only through the ports
 *   infrastructure/  the only layer allowed to import Prisma
 */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'coverage-e2e/**',
      'prisma/migrations/**',
      'src/infrastructure/prisma-client/**',
      'eslint.config.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...prettier.rules,
      // The scaffold ships intentional stubs; an argument prefixed with _ is a
      // declaration of intent, not an oversight.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      /**
       * SILENT-DEGRADATION GATES — catch structural patterns that allow the
       * system to substitute degraded behaviour for real behaviour while still
       * reporting success.  Violations must be fixed or explicitly annotated:
       *
       *   // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>
       *
       * Two classes of defect are covered:
       *
       * RULE-SD-01  Forbidden silent config defaults
       *   Pattern: configService.get('KEY') ?? 'literal'  or  || 'literal'
       *   Fix:     configService.getOrThrow('KEY')
       *   Rationale: a missing security-sensitive env var (_URL, _URI,
       *   _AUDIENCE, _SECRET, _KEY, _PASSWORD, _TOKEN, _HOST, _PORT) silently
       *   uses a wrong default, the service starts, health checks pass, and
       *   the defect only surfaces at runtime on the first real request.
       *   The selector fires on ALL config.get + literal fallback pairs;
       *   annotate cosmetic-only keys (APP_NAME, LOG_LEVEL) that are
       *   genuinely safe with a justification comment.
       *
       * RULE-SD-02  Empty or comment-only catch blocks
       *   Pattern: catch { } or catch (e) { }  (no statements in the body)
       *   Fix:     rethrow, log, or update a degraded-flag signal
       *   Rationale: a swallowed error keeps the happy-path code running with
       *   a null/stub result; the `degraded` flag is never set; health checks
       *   pass; the defect only surfaces as silent wrong output.
       *
       * NOT COVERED BY LINT (document, not automate):
       *   • Stub fallback without signalling: a read-port resolves to a stub
       *     when env config is missing but never sets degraded=true.  This is
       *     a semantic/runtime pattern — no AST rule catches it reliably.
       *   • URL path mismatch: adapter points to the wrong path — runtime
       *     fact, not expressable in lint.
       */
      'no-restricted-syntax': [
        'error',
        // ── RULE-SD-01: config.get('…') ?? 'literal' ────────────────────────
        {
          selector:
            "LogicalExpression[operator='??'][left.callee.object.name='config'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] config.get('KEY') ?? 'literal' silently falls back when the env var is absent. " +
            "Use config.getOrThrow('KEY') for security-sensitive keys (_URL _URI _AUDIENCE _SECRET _KEY _PASSWORD _TOKEN _HOST _PORT). " +
            "If this key is genuinely cosmetic (APP_NAME, LOG_LEVEL), annotate: " +
            "// eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        {
          selector:
            "LogicalExpression[operator='??'][left.callee.object.name='configService'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] configService.get('KEY') ?? 'literal' silently falls back when the env var is absent. " +
            "Use configService.getOrThrow('KEY') for security-sensitive keys. " +
            "Annotate cosmetic keys: // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        {
          selector:
            "LogicalExpression[operator='??'][left.callee.object.property.name='configService'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] this.configService.get('KEY') ?? 'literal' silently falls back when the env var is absent. " +
            "Use this.configService.getOrThrow('KEY') for security-sensitive keys. " +
            "Annotate cosmetic keys: // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        {
          selector:
            "LogicalExpression[operator='||'][left.callee.object.name='config'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] config.get('KEY') || 'literal' silently falls back when the env var is absent. " +
            "Use config.getOrThrow('KEY') for security-sensitive keys. " +
            "Annotate cosmetic keys: // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        {
          selector:
            "LogicalExpression[operator='||'][left.callee.object.name='configService'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] configService.get('KEY') || 'literal' silently falls back when the env var is absent. " +
            "Use configService.getOrThrow('KEY') for security-sensitive keys. " +
            "Annotate cosmetic keys: // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        {
          selector:
            "LogicalExpression[operator='||'][left.callee.object.property.name='configService'][left.callee.property.name='get'][right.type='Literal']",
          message:
            "[SD-01] this.configService.get('KEY') || 'literal' silently falls back when the env var is absent. " +
            "Use this.configService.getOrThrow('KEY') for security-sensitive keys. " +
            "Annotate cosmetic keys: // eslint-disable-next-line no-restricted-syntax -- safe default: <reason>",
        },
        // ── RULE-SD-02: empty / comment-only catch block ─────────────────────
        {
          selector: "CatchClause[body.body.length=0]",
          message:
            "[SD-02] Empty or comment-only catch block swallows all errors silently. " +
            "Either rethrow, log the error via the Nest logger, or update a degraded-flag signal. " +
            "If silence is intentional (e.g. SSR compatibility, best-effort cleanup), annotate: " +
            "// eslint-disable-next-line no-restricted-syntax -- <explicit reason>",
        },
      ],
    },
  },
  {
    // RULE — the domain stays pure. It must not know Nest, Prisma, HTTP or any
    // outer layer; this is what ArchUnit enforces on the JVM side.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                '@prisma/client',
                'prisma',
                '**/infrastructure/**',
                '**/modules/**',
              ],
              message:
                'The domain layer must stay pure: no Nest, no Prisma, no ' +
                'infrastructure and no module imports. Invert the dependency ' +
                'through a port declared in the domain instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // RULE — feature modules reach persistence through the domain ports, never
    // through Prisma directly.
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', 'prisma'],
              message:
                'Feature modules must not import Prisma directly. Depend on ' +
                'the repository port from the domain; the Prisma adapter lives ' +
                'in infrastructure/persistence.',
            },
          ],
        },
      ],
    },
  },
  {
    // Specs may reach wherever they need to in order to assert.
    // SD gates are disabled for test files: ConfigService is mocked (SD-01 not
    // applicable) and test helpers may legitimately use empty catches to verify
    // that a function does NOT throw.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
