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
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
