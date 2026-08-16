module.exports = {
  root: true,
  env: { node: true, es2021: true },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint"],
  rules: {
    "no-unused-vars": "off",
    // argsIgnorePattern lets an intentionally-unused parameter be named
    // with a leading underscore (e.g. implementing a fixed interface
    // where one implementation doesn't need every argument) without
    // disabling the rule outright.
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      // First Jest spec files land in this PR (Sprint 1 / B1 — auth
      // foundation infra). describe/it/expect/jest are Jest globals, not
      // undefined references.
      files: ["**/*.spec.ts"],
      env: { jest: true },
    },
  ],
};
