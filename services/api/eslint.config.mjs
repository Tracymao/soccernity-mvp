import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// Flat config (ESLint 9). Behaviour matches the former .eslintrc.cjs:
// eslint:recommended, the typescript-eslint parser, base no-unused-vars off,
// @typescript-eslint/no-unused-vars as an error. The `lint` script passes the
// file glob, so no `files` / `ignores` entries beyond ESLint's defaults are
// needed (node_modules is ignored by default; there was no .eslintignore).
export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2021 },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    linterOptions: {
      // ESLint 9 defaults this to "warn"; ESLint 8 (previous setup) did not
      // report unused disable directives. Kept off so lint output is unchanged.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "no-unused-vars": "off",
      // argsIgnorePattern lets an intentionally-unused parameter be named
      // with a leading underscore (e.g. implementing a fixed interface
      // where one implementation doesn't need every argument) without
      // disabling the rule outright.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // describe/it/expect/jest are Jest globals, not undefined references.
    // test-username-policy.ts is a test helper (not *.spec.ts) that declared
    // `/* eslint-env jest */`; flat config ignores that comment, so its Jest
    // globals are declared here instead of editing application code.
    files: ["**/*.spec.ts", "**/users/test-username-policy.ts"],
    languageOptions: { globals: globals.jest },
  },
];
