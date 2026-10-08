/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EmptyLocalization } from "@szewtwin/core-common";
import { IVaultApp } from "../IVaultApp";
import { IVaultConnection } from "../IVaultConnection";
import { createBlankConnection } from "./createBlankConnection";

describe("BlankConnection", async () => {
  beforeAll(async () => IVaultApp.startup({ localization: new EmptyLocalization() }));
  afterAll(async () => IVaultApp.shutdown());

  it("preserves name", async () => {
    const name = "my-blank-connection";
    const ivault = createBlankConnection(name);
    try {
      expect(ivault.name).toEqual(name);
    } finally {
      await ivault.close();
    }
  });

  it("raises `onOpen` event when a new `BlankConnection` is created", async () => {
    const spy = vi.fn();
    IVaultConnection.onOpen.addListener(spy);
    const connection = createBlankConnection();
    try {
      expect(spy).toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
});
