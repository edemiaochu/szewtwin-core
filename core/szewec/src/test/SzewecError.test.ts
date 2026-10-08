/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { SzewecError, SzewecStatus, SZEWTwinError } from "../SzewecError";

describe("SzewecError.getErrorMessage", () => {
  it("test szewTwinError", () => {
    expect(SZEWTwinError.isError(null, "a", "b")).false;
    expect(SZEWTwinError.isError(undefined, "a", "b")).false;
    expect(SZEWTwinError.isError(1, "a", "b")).false;
    expect(SZEWTwinError.isError("test", "a", "b")).false;
    expect(SZEWTwinError.isError({ a: 34 }, "a", "b")).false;
    expect(SZEWTwinError.isError({ szewTwinErrorId: 34 }, "a", "b")).false;
    expect(SZEWTwinError.isError({ szewTwinErrorId: null }, "a", "b")).false;
    expect(SZEWTwinError.isError({ szewTwinErrorId: undefined }, "a", "b")).false;
    expect(SZEWTwinError.isError({ szewTwinErrorId: {} }, "a", "b")).false;
    expect(SZEWTwinError.isError({ szewTwinErrorId: { a: null } }, "a", "b")).false;

    const err: SZEWTwinError = {
      szewTwinErrorId: {
        key: "key1",
        scope: "scope1",
      },
      name: "testErr",
      message: "test message",
    };
    expect(SZEWTwinError.isError(err, "a", "b")).false;
    expect(SZEWTwinError.isError(err, "scope1", "b")).false;
    expect(SZEWTwinError.isError(err, "scope1", "key1")).true;
    expect(SZEWTwinError.isError(SZEWTwinError.create(err), "scope1", "key1")).true;
  });
  it("returns string values", () => {
    expect(SzewecError.getErrorMessage("foo")).to.equal("foo");
    expect(SzewecError.getErrorMessage("")).to.equal("");
  });

  it("prefers Error.toString() to message property", () => {
    class CustomError extends Error {
      public override toString() { return "CustomToString"; }
    }
    expect(SzewecError.getErrorMessage(new Error("foo"))).to.equal("Error: foo");
    expect(SzewecError.getErrorMessage(new CustomError("foo"))).to.equal("CustomToString");
  });

  it("prefers message property to msg property", () => {
    const err = { message: "foo", msg: "bar", toString: () => "baz" };
    expect(SzewecError.getErrorMessage(err)).to.equal("foo");
  });

  it("prefers msg property to toString (on non-error object)", () => {
    const err = { msg: "foo", toString: () => "bar" };
    expect(SzewecError.getErrorMessage(err)).to.equal("foo");
  });

  it("returns useful toString output", () => {
    expect(SzewecError.getErrorMessage({ toString: () => "abc" })).to.equal("abc");
  });

  it("returns empty string for object with useless toString", () => {
    expect(SzewecError.getErrorMessage({})).to.equal("");
  });

  it("returns empty string for unsupported value types", () => {
    expect(SzewecError.getErrorMessage(null)).to.equal("");
    expect(SzewecError.getErrorMessage(undefined)).to.equal("");
    expect(SzewecError.getErrorMessage(5)).to.equal("");
    expect(SzewecError.getErrorMessage(BigInt(42))).to.equal("");
    expect(SzewecError.getErrorMessage(Symbol())).to.equal("");
    expect(SzewecError.getErrorMessage(true)).to.equal("");
    expect(SzewecError.getErrorMessage(false)).to.equal("");
    expect(SzewecError.getErrorMessage(() => "bad")).to.equal("");
  });
});

describe("SzewecError.getErrorStack", () => {
  it("returns stack from Error objects", () => {
    const err = new Error("foo");
    expect(err.stack).to.not.be.undefined;
    expect(SzewecError.getErrorStack(err)).to.equal(err.stack);
  });

  it("returns stack from non-Error objects", () => {
    expect(SzewecError.getErrorStack({ stack: "xyz" })).to.equal("xyz");
  });

  it("returns undefined for unsupported value types", () => {
    expect(SzewecError.getErrorStack("foo")).to.be.undefined;
    expect(SzewecError.getErrorStack(null)).to.be.undefined;
    expect(SzewecError.getErrorStack(undefined)).to.be.undefined;
    expect(SzewecError.getErrorStack(5)).to.be.undefined;
    expect(SzewecError.getErrorStack(BigInt(42))).to.be.undefined;
    expect(SzewecError.getErrorStack(Symbol())).to.be.undefined;
    expect(SzewecError.getErrorStack(true)).to.be.undefined;
    expect(SzewecError.getErrorStack(false)).to.be.undefined;
    expect(SzewecError.getErrorStack(() => "bad")).to.be.undefined;
  });

  it("returns undefined for unsupported stack property types", () => {
    expect(SzewecError.getErrorStack({ stack: {} })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: null })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: undefined })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: 5 })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: BigInt(42) })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: Symbol() })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: true })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: false })).be.undefined;
    expect(SzewecError.getErrorStack({ stack: () => "bad" })).be.undefined;
  });
});

describe("SzewecError.getErrorMetadata", () => {
  it("returns metadata from SzewecError objects", () => {
    const metadata = { foo: "bar" };
    const err = new SzewecError(0, "message", () => metadata);
    expect(SzewecError.getErrorMetadata(err)).to.equal(metadata);
  });

  it("returns metadata from non-SzewecError objects", () => {
    const metadata = { prop: "value" };
    const err = { getMetaData: () => metadata };
    expect(SzewecError.getErrorMetadata(err)).to.equal(metadata);
  });

  it("returns undefined for unsupported value types", () => {
    expect(SzewecError.getErrorMetadata("foo")).to.be.undefined;
    expect(SzewecError.getErrorMetadata(null)).to.be.undefined;
    expect(SzewecError.getErrorMetadata(undefined)).to.be.undefined;
    expect(SzewecError.getErrorMetadata(5)).to.be.undefined;
    expect(SzewecError.getErrorMetadata(BigInt(42))).to.be.undefined;
    expect(SzewecError.getErrorMetadata(Symbol())).to.be.undefined;
    expect(SzewecError.getErrorMetadata(true)).to.be.undefined;
    expect(SzewecError.getErrorMetadata(false)).to.be.undefined;
    expect(SzewecError.getErrorMetadata(() => "bad")).to.be.undefined;
  });

  it("returns undefined for unsupported getMetaData property types", () => {
    expect(SzewecError.getErrorMetadata({ getMetaData: "foo" })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: null })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: undefined })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: 5 })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: BigInt(42) })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: Symbol() })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: true })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: false })).to.be.undefined;
  });

  it("returns undefined for unsupported getMetaData return types", () => {
    expect(SzewecError.getErrorMetadata({ getMetaData: () => "foo" })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => null })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => undefined })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => 5 })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => BigInt(42) })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => Symbol() })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => true })).to.be.undefined;
    expect(SzewecError.getErrorMetadata({ getMetaData: () => false })).to.be.undefined;
  });
});

describe("SzewecError.getErrorProps", () => {
  it("properly converts SzewecError objects", () => {
    const err = new SzewecError(SzewecStatus.SUCCESS, "message");
    const serialized = SzewecError.getErrorProps(err);
    expect(serialized).to.be.an("object");
    expect(serialized).to.eql({ message: err.toString(), stack: err.stack });  // eslint-disable-line @typescript-eslint/no-base-to-string
    expect(serialized).to.not.have.property("metadata");
  });

  it("properly converts SzewecErrors with metadata", () => {
    const metadata = { prop: "value" };
    const err = new SzewecError(SzewecStatus.ERROR, "fail", () => metadata);
    const serialized = SzewecError.getErrorProps(err);
    expect(serialized).to.be.an("object");
    expect(serialized).to.eql({ message: err.toString(), stack: err.stack, metadata });  // eslint-disable-line @typescript-eslint/no-base-to-string
  });

  it("returns values that can safely be JSON round-tripped", () => {
    const err = new SzewecError(SzewecStatus.ERROR, "fail", () => ({ prop: "value" }));
    // Regular Error objects can NOT be JSON round-tripped
    expect(JSON.parse(JSON.stringify(err))).to.not.eql(err);
    const serialized = SzewecError.getErrorProps(err);
    expect(JSON.parse(JSON.stringify(serialized))).to.eql(serialized);
  });

  it("safely handles unsupported value types", () => {
    expect(SzewecError.getErrorProps("foo")).to.eql({ message: "foo" });
    expect(SzewecError.getErrorProps(null)).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(undefined)).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(5)).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(BigInt(42))).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(Symbol())).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(true)).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(false)).to.eql({ message: "" });
    expect(SzewecError.getErrorProps(() => "bad")).to.eql({ message: "" });
  });
});
