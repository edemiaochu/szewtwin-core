/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it, Mock, vi } from "vitest";
import { IVaultConnection } from "../IVaultConnection";
import { BeEvent, IVaultStatus } from "@szewtwin/core-szewec";
import { Range3d, Range3dProps } from "@szewtwin/core-geometry";
import { ModelExtentsProps } from "@szewtwin/core-common";

/* eslint-disable @typescript-eslint/dot-notation */

describe("IVaultConnection.Models", () => {
  describe("queryExtents", () => {
    const bbox = Object.fromEntries(
      new Array(48).fill(0).map((value, index) => [index, value])
    );

    const extents = Range3d.fromArrayBuffer((new Uint8Array(Object.values(bbox))).buffer);

    it("should get an extent from the cache", async () => {
      const modelId = "0x1";
      const fakeValue = {
        /* eslint-disable @typescript-eslint/naming-convention */
        DMInstanceId: modelId,
        bbox,
        /* eslint-enable @typescript-eslint/naming-convention */
      }

      const nextSpy = vi.fn()
        .mockResolvedValueOnce({ done: false, value: fakeValue })
        .mockResolvedValueOnce({ done: true });

      const ecsqlReaderFake = createEcsqlFake(nextSpy);

      const createQueryReaderMock = vi.fn()
        .mockReturnValueOnce(ecsqlReaderFake);

      const iVaultConnectionFake = createIVaultConnectionFake(createQueryReaderMock);

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      expect(models["_loadedExtents"]).to.be.empty;

      const firstResult = await models.queryExtents(modelId);
      expect(firstResult).to.not.be.empty;
      expectExtent(firstResult[0], modelId, extents);
      expect(models["_loadedExtents"].size).to.be.equal(1);
      expect(nextSpy).toHaveBeenCalledTimes(2);

      const secondResult = await models.queryExtents(modelId);
      expect(secondResult).to.not.be.empty;
      expectExtent(secondResult[0], modelId, extents);
      expect(nextSpy).toHaveBeenCalledTimes(2);
    });

    it("should remove extents from cache that have been modified", async () => {
      const modelIds = ["0x1", "0x2", "0x3"]
      const fakeValues = [{
        /* eslint-disable @typescript-eslint/naming-convention */
        DMInstanceId: modelIds[0],
        bbox,
      }, {
        DMInstanceId: modelIds[1],
        bbox,
      }, {
        DMInstanceId: modelIds[2],
        bbox,
        /* eslint-enable @typescript-eslint/naming-convention */
      }];

      let callCount = 0;
      const nextSpy = vi.fn(async () => {
        if (callCount < fakeValues.length) {
          return { done: false, value: fakeValues[callCount++] };
        }
        return { done: true };
      });

      const ecsqlReaderFake = createEcsqlFake(nextSpy);

      const createQueryReaderMock = vi.fn()
        .mockReturnValueOnce(ecsqlReaderFake);

      const onModelGeometryChanged = new BeEvent<(changes: { id: string }[]) => void>();

      const iVaultConnectionFake = {
        isBriefcaseConnection: () => true,
        createQueryReader: createQueryReaderMock,
        isOpen: true,
        txns: {
          onModelGeometryChanged,
        },
      } as unknown as IVaultConnection;

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      IVaultConnection.onOpen.raiseEvent(iVaultConnectionFake);
      expect(models["_geometryChangedListener"]).to.not.be.undefined;

      expect(models["_loadedExtents"]).to.be.empty;

      const firstResult = await models.queryExtents(modelIds);
      expect(firstResult).to.not.be.empty;
      expectExtent(firstResult[0], modelIds[0], extents);
      expectExtent(firstResult[1], modelIds[1], extents);
      expectExtent(firstResult[2], modelIds[2], extents);
      expect(models["_loadedExtents"].size).to.be.equal(modelIds.length);
      expect(nextSpy).toHaveBeenCalledTimes(modelIds.length + 1);

      const secondResult = await models.queryExtents(modelIds);
      expect(secondResult).to.not.be.empty;
      expectExtent(secondResult[0], modelIds[0], extents);
      expectExtent(secondResult[1], modelIds[1], extents);
      expectExtent(secondResult[2], modelIds[2], extents);
      expect(nextSpy).toHaveBeenCalledTimes(modelIds.length + 1);

      onModelGeometryChanged.raiseEvent([{ id: modelIds[0] }, { id: modelIds[1] }]);
      expect(models["_loadedExtents"].size).to.be.equal(1);
      expect(models["_loadedExtents"].get(modelIds[2])).to.not.be.undefined;

      IVaultConnection.onClose.raiseEvent(iVaultConnectionFake);
      expect(models["_geometryChangedListener"]).to.be.undefined;
    });

    it("should not cache extents with invalid Id64", async () => {
      const modelIds = "ivalidId64";

      const iVaultConnectionFake = createIVaultConnectionFake()

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      expect(models["_loadedExtents"]).to.be.empty;

      const result = await models.queryExtents(modelIds);
      expect(result).to.not.be.empty;
      expectExtent(result[0], "0", Range3d.createNull(), IVaultStatus.InvalidId);
      expect(models["_loadedExtents"]).to.be.empty;
    });

    it("should cache extents of geometric models without elements", async () => {
      const modelId = "0x1";

      const extentsQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: true });

      const extentsEcsqlReaderFake = createEcsqlFake(extentsQueryNextSpy);

      const fakeValue = {
        /* eslint-disable @typescript-eslint/naming-convention */
        DMInstanceId: modelId,
        isGeometricModel: true,
        /* eslint-enable @typescript-eslint/naming-convention */
      }

      const modelExistenceQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: false, value: fakeValue })
        .mockResolvedValueOnce({ done: true });

      const modelExistenceEcsqlReaderFake = createEcsqlFake(modelExistenceQueryNextSpy);

      const createQueryReaderMock = vi.fn()
        .mockReturnValueOnce(extentsEcsqlReaderFake)
        .mockReturnValueOnce(modelExistenceEcsqlReaderFake);

      const iVaultConnectionFake = createIVaultConnectionFake(createQueryReaderMock);

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      expect(models["_loadedExtents"]).to.be.empty;

      const firstResult = await models.queryExtents(modelId);
      expect(firstResult).to.not.be.empty;
      expectExtent(firstResult[0], modelId, Range3d.createNull(), IVaultStatus.Success);
      expect(models["_loadedExtents"].size).to.be.equal(1);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(2);

      const secondResult = await models.queryExtents(modelId);
      expect(secondResult).to.not.be.empty;
      expectExtent(secondResult[0], modelId, Range3d.createNull(), IVaultStatus.Success);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(2);
    });

    it("should cache extents of non geometric models", async () => {
      const modelId = "0x1";

      const extentsQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: true });

      const extentsEcsqlReaderFake = createEcsqlFake(extentsQueryNextSpy);

      const fakeValue = {
        /* eslint-disable @typescript-eslint/naming-convention */
        DMInstanceId: modelId,
        isGeometricModel: false,
        /* eslint-enable @typescript-eslint/naming-convention */
      }

      const modelExistenceQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: false, value: fakeValue })
        .mockResolvedValueOnce({ done: true });

      const modelExistenceEcsqlReaderFake = createEcsqlFake(modelExistenceQueryNextSpy);

      const createQueryReaderMock = vi.fn()
        .mockReturnValueOnce(extentsEcsqlReaderFake)
        .mockReturnValueOnce(modelExistenceEcsqlReaderFake);

      const iVaultConnectionFake = createIVaultConnectionFake(createQueryReaderMock);

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      expect(models["_loadedExtents"]).to.be.empty;

      const firstResult = await models.queryExtents(modelId);
      expect(firstResult).to.not.be.empty;
      expectExtent(firstResult[0], modelId, Range3d.createNull(), IVaultStatus.WrongModel);
      expect(models["_loadedExtents"].size).to.be.equal(1);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(2);

      const secondResult = await models.queryExtents(modelId);
      expect(secondResult).to.not.be.empty;
      expectExtent(secondResult[0], modelId, Range3d.createNull(), IVaultStatus.WrongModel);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(2);
    });

    it("should cache extents of not found geometric models", async () => {
      const modelId = "0x1";

      const extentsQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: true });

      const extentsQueryEcsqlReaderFake = createEcsqlFake(extentsQueryNextSpy);

      const modelExistenceQueryNextSpy = vi.fn()
        .mockResolvedValueOnce({ done: true });

      const modelExistenceEcsqlReaderFake = createEcsqlFake(modelExistenceQueryNextSpy);

      const createQueryReaderMock = vi.fn()
        .mockReturnValueOnce(extentsQueryEcsqlReaderFake)
        .mockReturnValueOnce(modelExistenceEcsqlReaderFake);

      const iVaultConnectionFake = createIVaultConnectionFake(createQueryReaderMock);

      const models = new IVaultConnection.Models(iVaultConnectionFake);

      expect(models["_loadedExtents"]).to.be.empty;

      const firstResult = await models.queryExtents(modelId);
      expect(firstResult).to.not.be.empty;
      expectExtent(firstResult[0], modelId, Range3d.createNull(), IVaultStatus.NotFound);
      expect(models["_loadedExtents"].size).to.be.equal(1);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(1);

      const secondResult = await models.queryExtents(modelId);
      expect(secondResult).to.not.be.empty;
      expectExtent(secondResult[0], modelId, Range3d.createNull(), IVaultStatus.NotFound);
      expect(extentsQueryNextSpy).toHaveBeenCalledTimes(1);
      expect(modelExistenceQueryNextSpy).toHaveBeenCalledTimes(1);
    });

    function createEcsqlFake(nextFake: Mock) {
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        next: nextFake,
      };
    }

    function createIVaultConnectionFake(createQueryReaderMock?: Mock, isBriefcaseConnection = false): IVaultConnection {
      return {
        isBriefcaseConnection: () => isBriefcaseConnection,
        createQueryReader: createQueryReaderMock,
        isOpen: true,
      } as unknown as IVaultConnection;
    }

    function expectExtent(extent: ModelExtentsProps, expectedId: string, expectedExtents: Range3dProps, expectedStatus = IVaultStatus.Success) {
      expect(extent.id).to.be.equal(expectedId);
      expect(extent.status).to.be.equal(expectedStatus);
      expect(extent.extents).to.be.deep.equal(expectedExtents);
    }
  });
});