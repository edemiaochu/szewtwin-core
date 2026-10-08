/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { firstValueFrom, toArray } from "rxjs";
import * as sinon from "sinon";
import { IVaultDb } from "@szewtwin/core-backend";
import { PresentationError } from "@szewtwin/presentation-common";
import { createIdBatches, getBatchedClassElementIds, getElementsCount } from "../presentation-backend/ElementPropertiesHelper.js";
import { stubDMSqlReader } from "./Helpers.js";

describe("getElementsCount", () => {
  let ivaultMock: ReturnType<typeof stubIVault>;
  let ivault: IVaultDb;

  beforeEach(() => {
    ivaultMock = stubIVault();
    ivault = ivaultMock as unknown as IVaultDb;
  });

  function stubIVault() {
    return {
      createQueryReader: sinon.stub(),
    };
  }

  it("returns 0 when statement has no rows", async () => {
    ivaultMock.createQueryReader.withArgs(sinon.match.string).returns(stubDMSqlReader([]));
    expect(await getElementsCount(ivault, [])).to.be.eq(0);
  });

  it("returns count when statement has row", async () => {
    const elementCount = 3;
    ivaultMock.createQueryReader.withArgs(sinon.match.string).returns(stubDMSqlReader([{ elementCount }]));
    expect(await getElementsCount(ivault, [])).to.be.eq(elementCount);
  });

  it("adds WHERE clause when class list is defined and not empty", async () => {
    ivaultMock.createQueryReader.withArgs(sinon.match((query: string) => query.includes("WHERE"))).returns(stubDMSqlReader([]));
    await getElementsCount(ivault, ["TestSchema:TestClass"]);
    expect(ivaultMock.createQueryReader).to.be.calledOnce;
  });

  it("throws if class list contains invalid class name", async () => {
    await expect(getElementsCount(ivault, ["'TestSchema:TestClass'"])).to.eventually.be.rejectedWith(PresentationError);
    await expect(getElementsCount(ivault, ["%TestSchema:TestClass%"])).to.eventually.be.rejectedWith(PresentationError);
    await expect(getElementsCount(ivault, ["TestSchema:TestClass  "])).to.eventually.be.rejectedWith(PresentationError);
  });
});

describe("createIdBatches", () => {
  it("returns empty list when given no ids", async () => {
    expect(await firstValueFrom(createIdBatches([], 2).pipe(toArray()))).to.be.deep.eq([]);
  });

  it("creates a batch from one element id", async () => {
    expect(await firstValueFrom(createIdBatches(["0x3"], 10).pipe(toArray()))).to.be.deep.eq([[{ from: "0x3", to: "0x3" }]]);
  });

  it("creates a batch from sequential element ids, when `batchSize` is larger than the number of ids", async () => {
    expect(await firstValueFrom(createIdBatches(["0x1", "0x2", "0x3", "0x4", "0x5"], 10).pipe(toArray()))).to.be.deep.eq([[{ from: "0x1", to: "0x5" }]]);
  });

  it("creates a batch of non-sequential element ids, when `batchSize` is larger than the number of ids", async () => {
    expect(await firstValueFrom(createIdBatches(["0x1", "0x3", "0x5", "0x7", "0x9"], 10).pipe(toArray()))).to.be.deep.eq([
      [
        { from: "0x1", to: "0x1" },
        { from: "0x3", to: "0x3" },
        { from: "0x5", to: "0x5" },
        { from: "0x7", to: "0x7" },
        { from: "0x9", to: "0x9" },
      ],
    ]);
  });

  it("creates a batch with last sequence consisting of more than 1 element", async () => {
    expect(await firstValueFrom(createIdBatches(["0x1", "0x2", "0x3", "0x5", "0x6"], 10).pipe(toArray()))).to.be.deep.eq([
      [
        { from: "0x1", to: "0x3" },
        { from: "0x5", to: "0x6" },
      ],
    ]);
  });

  it("creates a batch with last sequence consisting of 1 element", async () => {
    expect(await firstValueFrom(createIdBatches(["0x1", "0x2", "0x9"], 10).pipe(toArray()))).to.be.deep.eq([
      [
        { from: "0x1", to: "0x2" },
        { from: "0x9", to: "0x9" },
      ],
    ]);
  });

  it("creates multiple batches", async () => {
    expect(await firstValueFrom(createIdBatches(["0x1", "0x2", "0x3", "0x4", "0x5"], 2).pipe(toArray()))).to.be.deep.eq([
      [{ from: "0x1", to: "0x2" }],
      [{ from: "0x3", to: "0x4" }],
      [{ from: "0x5", to: "0x5" }],
    ]);
  });
});

describe("getBatchedClassElementIds", () => {
  let ivaultMock: ReturnType<typeof stubIVault>;
  let ivault: IVaultDb;

  beforeEach(() => {
    ivaultMock = stubIVault();
    ivault = ivaultMock as unknown as IVaultDb;
  });

  function stubIVault() {
    return {
      createQueryReader: sinon.stub(),
    };
  }

  it("returns empty list when statement has no rows", async () => {
    ivaultMock.createQueryReader.withArgs(sinon.match.string).returns(stubDMSqlReader([]));
    expect(await firstValueFrom(getBatchedClassElementIds(ivault, "x.y", 2).pipe(toArray()))).to.be.deep.eq([]);
  });

  it("returns batches", async () => {
    const elements = [{ id: "0x1" }, { id: "0x2" }, { id: "0x3" }, { id: "0x4" }, { id: "0x5" }];
    ivaultMock.createQueryReader.withArgs(sinon.match.string).returns(stubDMSqlReader(elements));
    expect(await firstValueFrom(getBatchedClassElementIds(ivault, "x.y", 2).pipe(toArray()))).to.be.deep.eq([
      [{ from: "0x1", to: "0x2" }],
      [{ from: "0x3", to: "0x4" }],
      [{ from: "0x5", to: "0x5" }],
    ]);
  });
});
