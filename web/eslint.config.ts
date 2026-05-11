import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import noRawTokens from "./src/eslint/no-raw-tokens";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022 },
    plugins: {
      "react-hooks": reactHooks as any,
      "react-refresh": reactRefresh,
      switchyard: {
        rules: {
          "no-raw-tokens": noRawTokens,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "switchyard/no-raw-tokens": "error",
    },
  },
);
