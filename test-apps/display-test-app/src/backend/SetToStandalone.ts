/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as path from "path";
import { Guid, OpenMode } from "@szewtwin/core-szewec";
import { IVaultHost, IVaultNative } from "@szewtwin/core-backend";
import { BriefcaseIdValue } from "@szewtwin/core-common";

let prefix = "";

function indent() {
  prefix = `${prefix}  `;
}

function outdent() {
  prefix = prefix.substring(2);
}

function log(msg: string) {
  /* eslint-disable-next-line no-console */
  console.log(`${prefix}${msg}`);
}

/**
 * This utility will change an existing iVault file to be a standalone iVault. It does so by
 * clearing the szewTwinId, and resetting the briefcaseId to 0.
 *
 * This should only be done for testing, with the szewTwin owner's permission.
 *
 * To run:
```
  cd test-apps\display-test-app
  npm run build:backend
  node lib\backend\SetToStandalone.js [iVault-filename]
```
   or, to change all .bim files in a directory and all its subdirectories. recursively:
```
  node lib\backend\SetToStandalone.js [directory-name]
```
*/
function setToStandalone(iVaultName: string) {
  log(`Setting ${iVaultName} to standalone...`);
  indent();

  try {
    const nativeDb = new IVaultNative.platform.BldDb();
    nativeDb.openIVault(iVaultName, OpenMode.ReadWrite);
    nativeDb.enableWalMode();
    nativeDb.setSZEWTwinId(Guid.empty); // empty szewTwinId means "standalone"
    nativeDb.saveChanges(); // save change to szewTwinId
    nativeDb.deleteAllTxns(); // necessary before resetting briefcaseId
    nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned); // standalone iVaults should always have BriefcaseId unassigned
    nativeDb.saveChanges(); // save change to briefcaseId
    nativeDb.closeFile();
  } catch (err: any) {
    log(err.message);
  }

  outdent();
}

async function processDirectory(dir: string) {
  log(`Converting iVaults in directory ${dir}`);
  indent();

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    let isDirectory;
    try {
      isDirectory = fs.statSync(fullPath).isDirectory();
    } catch (err: any) {
      log(err);
      continue;
    }

    if (isDirectory) {
      await processDirectory(fullPath);
    } else {
      if (file.endsWith(".bim") || file.endsWith(".ibim"))
        setToStandalone(fullPath);
    }
  }

  outdent();
}

async function run() {
  if (process.argv.length !== 3) {
    log("Expected 1 argument - the path to an iVault or directory.");
    return;
  }

  await IVaultHost.startup({ profileName: "display-test-app" });

  const rootPath = process.argv[2];
  if (fs.statSync(rootPath).isDirectory())
    await processDirectory(rootPath);
  else
    setToStandalone(rootPath);

  await IVaultHost.shutdown();

  log("Finished.");
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
