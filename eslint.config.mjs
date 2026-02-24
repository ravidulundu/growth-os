import js from "@eslint/js";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/**",
      ".turbo/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "pnpm-lock.yaml",
      "*.pdf"
    ]
  },
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error"
    }
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      complexity: ["error", 15],
      "max-params": ["error", 4],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../../apps/*",
                "../../../apps/*",
                "../../../../apps/*",
                "apps/*",
                "apps/*/src/**",
                "../dist/**",
                "../../dist/**",
                "../../../dist/**"
              ],
              message:
                "Import boundaries: cross-app or dist imports are forbidden. Use packages/* or API contracts."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["packages/shared/src/**/*.{ts,tsx,js,jsx}", "packages/ui/src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../../apps/*",
                "../../../apps/*",
                "../../../../apps/*",
                "apps/*",
                "apps/*/src/**"
              ],
              message: "Shared/UI packages must stay framework-agnostic. Do not import from apps/*."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];
