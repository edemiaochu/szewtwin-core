const szewTwinPlugin = require("@szewtwin/eslint-plugin");
const eslintBaseConfig = require("../../common/config/eslint/eslint.config.base");

module.exports = [
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.szewTwinjsRecommendedConfig,
  },
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.jsdocConfig,
  },
  {
    files: ["**/*.ts"],
    rules: {
      "max-statements-per-line": "off"
    }
  },
  {
    files: ["src/test/**/*"],
    rules: {
      "@typescript-eslint/no-deprecated": "off"
    }
  },
  ...eslintBaseConfig,
];