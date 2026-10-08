import szewTwinPlugin from "@szewtwin/eslint-plugin";

export default [
  {
    files: ["**/*.ts"],
    ...szewTwinPlugin.configs.szewTwinjsRecommendedConfig,
  },
];