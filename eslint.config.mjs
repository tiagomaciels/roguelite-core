import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Golden rule: the engine is pure TypeScript — no browser APIs, no UI deps.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "sessionStorage",
        "navigator",
        "fetch",
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "zustand*"], message: "the engine cannot depend on UI." },
          ],
        },
      ],
    },
  },
);
