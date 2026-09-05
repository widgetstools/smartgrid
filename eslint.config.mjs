// Root ESLint flat config. Lints package and app source; generated output and
// node_modules are ignored. Architecture boundaries are enforced with
// no-restricted-imports per layer:
//
//   foundation (design-system, ui, schema)  -> may import only each other
//   expressions, store                      -> foundation + schema
//   editors                                 -> foundation + schema + expressions
//   engine                                  -> schema + expressions + store (never React packages)
//   forms                                   -> editors + everything editors may use
//   assistant, react                        -> anything below them
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const restrict = (...patterns) => ['error', { patterns }];

const FOUNDATION = [
  'packages/design-system/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
  'packages/schema/**/*.{ts,tsx}',
];
const MID = ['packages/expressions/**/*.{ts,tsx}', 'packages/store/**/*.{ts,tsx}'];
const EDITORS = ['packages/editors/**/*.{ts,tsx}'];
const ENGINE = ['packages/engine/**/*.{ts,tsx}'];
const FORMS = ['packages/forms/**/*.{ts,tsx}'];
const ASSISTANT = ['packages/assistant/**/*.{ts,tsx}'];
const REACT = ['packages/react/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**', 'apps/**/public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{mjs,cjs,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: FOUNDATION,
    rules: {
      'no-restricted-imports': restrict({
        group: ['@smartgrid/!(design-system|ui|schema)', '@smartgrid/!(design-system|ui|schema)/**'],
        message: 'Foundation packages (design-system, ui, schema) may only import each other.',
      }),
    },
  },
  {
    files: MID,
    rules: {
      'no-restricted-imports': restrict(
        {
          group: ['@smartgrid/!(schema|design-system)', '@smartgrid/!(schema|design-system)/**'],
          message: 'expressions and store may only import schema and design-system.',
        },
        {
          group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
          message: 'expressions and store are framework-agnostic.',
        },
      ),
    },
  },
  {
    files: EDITORS,
    rules: {
      'no-restricted-imports': restrict({
        group: [
          '@smartgrid/!(schema|expressions|engine|design-system|ui)',
          '@smartgrid/!(schema|expressions|engine|design-system|ui)/**',
          'ag-grid-community',
          'ag-grid-enterprise',
          'ag-grid-react',
        ],
        message:
          'editors may import schema, expressions, engine (pure helpers), design-system and ui only; never assistant, store or AG Grid.',
      }),
    },
  },
  {
    files: FORMS,
    rules: {
      'no-restricted-imports': restrict({
        group: [
          '@smartgrid/!(schema|expressions|engine|editors|design-system|ui)',
          '@smartgrid/!(schema|expressions|engine|editors|design-system|ui)/**',
          'ag-grid-community',
          'ag-grid-enterprise',
          'ag-grid-react',
        ],
        message:
          'forms may import schema, expressions, engine, editors, design-system and ui only; never store, assistant or AG Grid.',
      }),
    },
  },
  {
    files: ASSISTANT,
    rules: {
      'no-restricted-imports': restrict(
        {
          group: [
            '@smartgrid/!(schema|expressions|engine|store)',
            '@smartgrid/!(schema|expressions|engine|store)/**',
            'ag-grid-community',
            'ag-grid-enterprise',
            'ag-grid-react',
          ],
          message:
            'assistant may import schema, expressions, engine and store only; the UI lives in packages/react.',
        },
        {
          group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
          message: 'assistant is framework-agnostic.',
        },
      ),
    },
  },
  {
    files: REACT,
    rules: {
      'no-restricted-imports': restrict({
        group: ['ag-grid-community', 'ag-grid-enterprise', 'ag-grid-react'],
        message: 'react composes the layers below it; the AG Grid binding lives in the host.',
      }),
    },
  },
  {
    files: ENGINE,
    rules: {
      'no-restricted-imports': restrict(
        {
          group: [
            '@smartgrid/!(schema|expressions|store|design-system)',
            '@smartgrid/!(schema|expressions|store|design-system)/**',
          ],
          message: 'engine may import schema, expressions, store and design-system only.',
        },
        {
          group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
          message: 'engine is framework-agnostic.',
        },
      ),
    },
  },
);
