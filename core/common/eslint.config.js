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
      "@szewtwin/public-extension-exports": [
        "error",
        {
          "releaseTags": [
            "public"
          ],
          "outputApiFile": false
        }
      ]
    }
  },
  ...eslintBaseConfig,
];