import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "public/**",
      "logs/**",
      "data/_generated/**",
      "assets/ponies/**",
      "assets/world/**",
      "assets/ui/**",
      "adventures/**/generated/**",
      "adventures/**/sprites/**"
    ]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off"
    }
  }
];
