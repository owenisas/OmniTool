import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Downgrade strict rules to warnings for existing code patterns
// (PowerSync conditional hooks, setState in sync effects, Date.now() in render)
const ruleOverrides = {
  "react-hooks/rules-of-hooks": "warn",
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/purity": "warn",
  "react/no-unescaped-entities": "off",
};

const eslintConfig = defineConfig([
  // Inject rule overrides into the config object that owns the react-hooks plugin
  ...nextVitals.map((cfg) => {
    if (cfg.plugins?.["react-hooks"]) {
      return {
        ...cfg,
        rules: { ...cfg.rules, ...ruleOverrides },
      };
    }
    return cfg;
  }),
  globalIgnores([
    ".next/**",
    ".next-tauri/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/@powersync/**",
  ]),
]);

export default eslintConfig;
