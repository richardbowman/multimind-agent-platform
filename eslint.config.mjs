// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
  {
    ignores: ["dist/**/*"]
  },
  {
    files: ['src/**/*.ts'],
    plugins: {
      "unused-imports": unusedImports
    },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      
      '@typescript-eslint/return-await': 'error',
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn"
    },
  },
  {
    // disable type-aware linting on JS files
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked]
  }
);