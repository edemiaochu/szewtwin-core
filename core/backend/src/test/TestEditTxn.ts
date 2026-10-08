/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { SaveChangesArgs } from "@szewtwin/core-common";
import { EditTxn } from "../EditTxn";
import type { IVaultDb } from "../IVaultDb";

export function withEditTxn<T>(iVault: IVaultDb, fn: (txn: EditTxn) => T): T;
export function withEditTxn<T>(iVault: IVaultDb, saveArgs: string | SaveChangesArgs, fn: (txn: EditTxn) => T): T;
export function withEditTxn<T>(iVault: IVaultDb, fn: (txn: EditTxn) => Promise<T>): Promise<T>;
export function withEditTxn<T>(iVault: IVaultDb, saveArgs: string | SaveChangesArgs, fn: (txn: EditTxn) => Promise<T>): Promise<T>;
export function withEditTxn<T>(iVault: IVaultDb, saveArgsOrFn: string | SaveChangesArgs | ((txn: EditTxn) => T | Promise<T>), maybeFn?: (txn: EditTxn) => T | Promise<T>): T | Promise<T> {
  const saveArgs = "function" === typeof saveArgsOrFn ? undefined : saveArgsOrFn;
  const fn = "function" === typeof saveArgsOrFn ? saveArgsOrFn : maybeFn;

  if (undefined === fn)
    throw new Error("withEditTxn requires a callback");

  const txn = new EditTxn(iVault, "test");
  txn.start();

  try {
    const result = fn(txn);
    if (result instanceof Promise) {
      return result.then((value) => {
        txn.end("save", saveArgs);
        return value;
      }, (err) => {
        if (txn.isActive)
          txn.end("abandon");

        throw err;
      });
    }

    txn.end("save", saveArgs);
    return result;
  } catch (err) {
    if (txn.isActive)
      txn.end("abandon");

    throw err;
  }
}

