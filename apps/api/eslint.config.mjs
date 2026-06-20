import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        sourceType: "module",
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
