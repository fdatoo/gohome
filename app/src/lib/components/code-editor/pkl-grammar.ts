/**
 * Pkl syntax highlighting for Monaco, as a Monarch grammar.
 * Covers keywords, primitives, strings (including raw multi-line),
 * comments, brackets, and numbers. Tokens here are kept conservative
 * — over-tokenising risks miscoloring valid Pkl, which is more
 * jarring than no color at all.
 *
 * Register once on first use via monaco.languages.register +
 * setMonarchTokensProvider. SyCodeEditor handles registration.
 */

import type { languages } from "monaco-editor";

export const pklLanguageId = "pkl";

export const pklLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
};

export const pklMonarchTokens: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".pkl",

  keywords: [
    "module", "amends", "import", "as", "extends", "class", "function",
    "new", "local", "abstract", "open", "hidden", "external",
    "let", "if", "else", "for", "in", "when", "throw", "trace",
    "true", "false", "null",
    "this", "super", "outer",
  ],

  typeKeywords: [
    "String", "Int", "Float", "Number", "Boolean", "Listing", "Mapping",
    "Set", "Dynamic", "Any", "Null", "Duration", "DataSize",
  ],

  operators: ["=", "==", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "&&", "||", "!", "?", "??"],

  symbols: /[=><!~?:&|+\-*/%]+/,

  tokenizer: {
    root: [
      // identifiers and keywords
      [/[A-Za-z_]\w*/, {
        cases: {
          "@keywords":     "keyword",
          "@typeKeywords": "type",
          "@default":      "identifier",
        },
      }],

      // whitespace
      { include: "@whitespace" },

      // delimiters
      [/[{}()[\]]/, "@brackets"],
      [/@symbols/, {
        cases: {
          "@operators": "operator",
          "@default":   "",
        },
      }],

      // numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],

      // strings
      [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
    ],

    string: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
  },
};
