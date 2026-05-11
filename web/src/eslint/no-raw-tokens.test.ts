import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-raw-tokens";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("switchyard/no-raw-tokens", () => {
  it("fails on raw color, radius, and spacing utilities", () => {
    tester.run("no-raw-tokens", rule, {
      valid: [
        { code: '<div className="surface-panel control-compact" />' },
      ],
      invalid: [
        {
          code: '<div className="bg-red-500 rounded-lg p-4" />',
          errors: [
            { messageId: "rawToken" },
            { messageId: "rawToken" },
            { messageId: "rawToken" },
          ],
        },
      ],
    });
  });
});
