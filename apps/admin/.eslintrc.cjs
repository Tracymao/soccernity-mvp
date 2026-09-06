module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react"],
  rules: {
    // Matches apps/web/.eslintrc.cjs: base no-unused-vars mis-flags TS
    // type-only constructs (interface method param names, etc.); the
    // typescript-eslint version understands them.
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  settings: { react: { version: "detect" } },
};
