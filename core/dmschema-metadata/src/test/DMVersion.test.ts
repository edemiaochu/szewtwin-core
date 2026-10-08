/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, describe, expect, it } from "vitest";
import { DMSchemaError } from "../Exception";
import { DMVersion } from "../SchemaKey";

describe("DMVersion", () => {
  describe("fromString", () => {
    it("should succeed with properly formed version string", () => {
      const testVersion = DMVersion.fromString("1.2.3");
      expect(testVersion.read).equals(1);
      expect(testVersion.write).equals(2);
      expect(testVersion.minor).equals(3);
    });

    it("should fail with a non-number as the read version in the string", () => {
      const testVersion = DMVersion.fromString("NotNumber.2.44");
      expect(testVersion).does.not.haveOwnProperty("read");
      expect(testVersion.write).equals(2);
      expect(testVersion.minor).equals(44);
    });

    it("should fail with a non-number as the write version in the string", () => {
      const testVersion = DMVersion.fromString("10.NotNumber.44");
      expect(testVersion).does.not.haveOwnProperty("write");
      expect(testVersion.read).equals(10);
      expect(testVersion.minor).equals(44);
    });

    it("should fail with a non-number as the minor version in the string", () => {
      const testVersion = DMVersion.fromString("10.2.NotNumber");
      expect(testVersion).does.not.haveOwnProperty("minor");
      expect(testVersion.read).equals(10);
      expect(testVersion.write).equals(2);
    });

    it("should throw for an incomplete version string", () => {
      expect(() => DMVersion.fromString("")).to.throw(DMSchemaError, "The read version is missing from version string, ");
      expect(() => DMVersion.fromString("10")).to.throw(DMSchemaError, "The write version is missing from version string, 10");
      expect(() => DMVersion.fromString("10.0")).to.throw(DMSchemaError, "The minor version is missing from version string, 10.0");
    });
  });

  describe("toString", () => {
    it("fully defined version string", () => {
      const testVersion = new DMVersion(1, 0, 14);
      assert.strictEqual("01.00.14", testVersion.toString());
    });
    it("fully defined version string without leading zero", () => {
      const testVersion = new DMVersion(1, 0, 14);
      assert.strictEqual("1.0.14", testVersion.toString(false));
    });
  });

  describe("compareByVersion", () => {
    it("right-hand read version is less, returns positive", async () => {
      const leftVersion = new DMVersion(2, 2, 3);
      const rightVersion = new DMVersion(1, 2, 3);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result > 0);
    });

    it("right-hand write version is less, returns positive", async () => {
      const leftVersion = new DMVersion(1, 2, 3);
      const rightVersion = new DMVersion(1, 1, 3);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result > 0);
    });

    it("right-hand minor version is less, returns positive", async () => {
      const leftVersion = new DMVersion(1, 2, 3);
      const rightVersion = new DMVersion(1, 2, 2);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result > 0);
    });

    it("right-hand read version is greater, returns negative", async () => {
      const leftVersion = new DMVersion(1, 2, 3);
      const rightVersion = new DMVersion(2, 2, 3);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result < 0);
    });

    it("right-hand write version is greater, returns negative", async () => {
      const leftVersion = new DMVersion(1, 1, 3);
      const rightVersion = new DMVersion(1, 2, 3);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result < 0);
    });

    it("right-hand minor version is greater, returns negative", async () => {
      const leftVersion = new DMVersion(1, 2, 2);
      const rightVersion = new DMVersion(1, 2, 3);
      const result = leftVersion.compare(rightVersion);
      assert.isTrue(result < 0);
    });

    it("exact match, returns zero", async () => {
      const leftVersion = new DMVersion(1, 2, 3);
      const rightVersion = new DMVersion(1, 2, 3);
      const result = leftVersion.compare(rightVersion);
      assert.strictEqual(result, 0);
    });
  });
});
