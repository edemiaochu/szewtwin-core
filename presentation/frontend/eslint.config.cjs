const szewTwinPlugin = require("@szewtwin/eslint-plugin");
const eslintBaseConfig = require("../../common/config/eslint/eslint.config.base");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.szewTwinjsRecommendedConfig,
  },
  ...eslintBaseConfig,
  {
    files: ["**/*.ts"],
    rules: {
      ...prettierConfig.rules,
      curly: ["error", "all"],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
