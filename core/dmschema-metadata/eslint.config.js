const szewTwinPlugin = require("@szewtwin/eslint-plugin");
const eslintBaseConfig = require("../../common/config/eslint/eslint.config.base");

module.exports = [
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.szewTwinjsRecommendedConfig,
  },
  {
    files: ["**/*.ts"],
    rules: {
      "radix": "warn",
      "@typescript-eslint/explicit-member-accessibility": "warn",
      "@szewtwin/no-internal-barrel-imports": [
        "error",
        {
          "ignored-barrel-modules": [
            "./src/DMObjects.ts"
          ]
        }
      ]
    }
  },
  ...eslintBaseConfig,
];