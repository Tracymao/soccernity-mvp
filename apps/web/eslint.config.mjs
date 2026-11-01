import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";

// Flat config (ESLint 9). Behaviour matches the former .eslintrc.cjs:
// eslint:recommended, the typescript-eslint parser (JSX on), the react plugin
// loaded with settings.react.version "detect" but no react rules enabled, base
// no-unused-vars off, @typescript-eslint/no-unused-vars as an error. The `lint`
// script passes the file glob; node_modules is ignored by default and there was
// no .eslintignore.
export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { "@typescript-eslint": tsPlugin, react: reactPlugin },
    linterOptions: {
      // ESLint 9 defaults this to "warn"; ESLint 8 (previous setup) did not
      // report unused disable directives. Kept off so lint output is unchanged.
      reportUnusedDisableDirectives: "off",
    },
    settings: { react: { version: "detect" } },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
