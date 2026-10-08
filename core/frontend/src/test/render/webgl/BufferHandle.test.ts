/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IVaultApp } from "../../../IVaultApp";
import { GL } from "../../../internal/render/webgl/GL";
import { BufferHandle } from "../../../internal/render/webgl/AttributeBuffers";
import { EmptyLocalization } from "@szewtwin/core-common";

describe("BufferHandle", () => {
  beforeAll(async () => IVaultApp.startup({ localization: new EmptyLocalization() }));
  afterAll(async () => IVaultApp.shutdown());

  it("disposes", () => {
    const buf = new BufferHandle(GL.Buffer.Target.ArrayBuffer);
    expect(buf.isDisposed).toBe(false);
    buf[Symbol.dispose]();
    expect(buf.isDisposed).toBe(true);
  });

  it("bind", () => {
    const buf = new BufferHandle(GL.Buffer.Target.ArrayBuffer);
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).toBe(false);
    expect(buf.isBound(GL.Buffer.Binding.ElementArrayBuffer)).toBe(false);

    buf.bind();
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).toBe(true);
    expect(buf.isBound(GL.Buffer.Binding.ElementArrayBuffer)).toBe(false);

    buf.unbind();
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).toBe(false);
  });
});
