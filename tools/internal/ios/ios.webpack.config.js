/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

const path = require("path");
const { globSync } = require("glob");

// const ignoredTests = [
//   "**/node_modules/DMSqlTestRunner.test.ts",
// ];

module.exports = {
  mode: "development",
  entry: [
    path.resolve(__dirname, "scripts/configureMocha.js"),
    ...globSync(path.resolve(__dirname, path.relative(__dirname, process.env.TESTS_GLOB))/*, { ignore: ignoredTests }*/),
    path.resolve(__dirname, "scripts/runMocha.js")
  ],
  output: {
    path: path.resolve(__dirname, "../lib/ios/assets"),
    filename: "main.js",
    devtoolModuleFilenameTemplate: "file:///[absolute-resource-path]",
    globalObject: "this",
  },
  target: "node",
  devtool: "source-map",
  resolve: {
    mainFields: ["main"],
    aliasFields: ["browser"],
    alias: { mocha$: "mocha/lib/mocha" }
  },
  module: {
    // don't parse @szewec/ivaultjs-native/NativeLibrary.js,
    // we don't need to pull in the Native here as it gets loaded by the runtime
    // via (process as any)._linkedBinding("iVaultJsNative")
    noParse: [/NativeLibrary.js$/],
    rules: [
      {
        test: /\.js$/,
        use: "source-map-loader",
        enforce: "pre"
      },
      {
        test: [
          // The DMSqlTestParser uses marked, which includes hard-coded regular expressions that
          // are not compatible with the mobile version of Node that lacks internationalization
          // support. The mere presence of these regular expressions in the source code causes the
          // JS parsing to crash. DMSqlTestRunner.test relies on DMSqlTestParser, so it must also
          // be disabled.
          /DMSqlTestParser.js$/,
          /DMSqlTestRunner.test.js$/,
          /growl\.js$/,
          /xunit\.js$/,
          /bunyan/,
        ],
        use: 'null-loader'  
      }
    ]
  },
  node: {
    __filename: false,
    __dirname: false
  }
}