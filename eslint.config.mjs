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
      "no-console": "off",
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
