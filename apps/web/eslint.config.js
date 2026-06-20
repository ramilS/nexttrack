import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // Local, git-ignored scratch dir of the remember plugin — never lint it.
  { ignores: [".remember/**"] },
];
