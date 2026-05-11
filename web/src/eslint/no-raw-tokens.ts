import type { Rule } from "eslint";

const rawTokenPatterns = [
  /^(?:-?m[trblxy]?|-?p[trblxy]?|gap(?:-[xy])?|space-[xy])-/,
  /^rounded(?:-|$)/,
  /^(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|\[)/,
];

type TemplateQuasi = { value: { cooked?: string | null } };
type AttributeValue =
  | { type: "Literal"; value: unknown }
  | {
      type: "JSXExpressionContainer";
      expression: {
        type: "TemplateLiteral";
        expressions: unknown[];
        quasis: TemplateQuasi[];
      };
    };
type JSXAttributeNode = {
  name: { type: string; name?: string };
  value?: AttributeValue | null;
};

function rawTokens(value: string): string[] {
  return value.split(/\s+/).filter((token) => rawTokenPatterns.some((pattern) => pattern.test(token)));
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow raw color, radius, and spacing utility classes",
    },
    messages: {
      rawToken: "Use design tokens instead of raw utility class '{{ token }}'.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node: JSXAttributeNode) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className" || !node.value) {
          return;
        }
        if (node.value.type === "Literal" && typeof node.value.value === "string") {
          for (const token of rawTokens(node.value.value)) {
            context.report({ node: node.value, messageId: "rawToken", data: { token } });
          }
        }
        if (
          node.value.type === "JSXExpressionContainer" &&
          node.value.expression.type === "TemplateLiteral" &&
          node.value.expression.expressions.length === 0
        ) {
          const value = node.value.expression.quasis.map((quasi: TemplateQuasi) => quasi.value.cooked ?? "").join("");
          for (const token of rawTokens(value)) {
            context.report({ node: node.value, messageId: "rawToken", data: { token } });
          }
        }
      },
    };
  },
};

export default rule;
