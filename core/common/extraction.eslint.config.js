const szewTwinPlugin = require("@szewtwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.extensionExportsConfig,
  }
];