module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react"],
  rules: {},
  settings: { react: { version: "detect" } },
};
