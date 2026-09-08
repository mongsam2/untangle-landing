import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * 레이어 의존 방향을 린트로 막는다. 규약은 docs/conventions/architecture.md에 있고,
 * 여기서는 역방향 import만 기계적으로 잡는다.
 */
function forbidUpward(dir, forbidden) {
  return {
    files: [`${dir}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: forbidden.map((target) => ({
            group: [`@/${target}/*`, `@/${target}`],
            message: `${dir}는 ${target}를 참조하지 않는다. 의존 방향은 app → sections → components → lib이다.`,
          })),
        },
      ],
    },
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettier와 겹치는 포매팅 규칙을 끈다. 반드시 마지막에 둔다.
  prettier,
  forbidUpward("lib", ["app", "sections", "components"]),
  forbidUpward("components", ["app", "sections"]),
  forbidUpward("sections", ["app"]),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
