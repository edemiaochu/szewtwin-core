/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

var Mocha = require("mocha/lib/mocha");
global.mocha = new Mocha();

const SzewecMochaReporter = require("@szewtwin/build-tools/mocha-reporter");

mocha.ui("bdd");
mocha.suite.emit("pre-require", global, null, mocha);
mocha.timeout(9999999);
mocha.reporter(SzewecMochaReporter, { mochaFile: process.env.TEST_RESULTS_PATH });