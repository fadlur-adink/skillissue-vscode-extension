// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ESLint flat config for SkillIssue.
 *
 * Only TypeScript sources are linted. Compiled output (`out`), downloaded test
 * instances (`.vscode-test`) and dependencies are ignored.
 */
export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', '.vscode-test/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // TypeScript already reports undefined identifiers; `no-undef` produces
      // false positives for Node/VS Code globals and ambient types.
      'no-undef': 'off',
      // The extension should log through its Logger, not the console.
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
