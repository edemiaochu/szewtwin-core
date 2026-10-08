/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { Point3d, Range3d } from "@szewtwin/core-geometry";
import { EcefLocation, EcefLocationProps, IVault, IVaultProps, RootSubjectProps } from "../IVault";
import { GeographicCRS } from "../geometry/CoordinateReferenceSystem";

interface TestIVaultProps extends IVaultProps {
  key: string;
}

class TestIVault extends IVault {
  public get isOpen() { return true; }
  public get isSnapshot() { return true; }
  public get isBriefcase() { return false; }

  public constructor(props: TestIVaultProps) {
    super(props);
    this.initFromProps(props);
  }

  public initFromProps(props: IVaultProps): void {
    this.initialize(props.name ?? props.rootSubject.name, props);
  }

  public getProps(): IVaultProps {
    return {
      name: this.name,
      rootSubject: { ...this.rootSubject },
      projectExtents: this.projectExtents.toJSON(),
      globalOrigin: this.globalOrigin.toJSON(),
      ecefLocation: this.ecefLocation,
      geographicCoordinateSystem: this.geographicCoordinateSystem,
    };
  }
}

describe("IVault", () => {
  describe("changed events", () => {
    interface ChangedProp<T> {
      prev: T;
      curr: T;
    }

    interface IVaultChangedProps {
      name?: ChangedProp<string>;
      subject?: ChangedProp<RootSubjectProps>;
      extents?: ChangedProp<Range3d>;
      globalOrigin?: ChangedProp<Point3d>;
      ecef?: ChangedProp<EcefLocation | undefined>;
      gcs?: ChangedProp<GeographicCRS | undefined>;
    }

    function expectChange(ivault: IVault, func: () => void, expected: IVaultChangedProps): void {
      const actual: IVaultChangedProps = {};

      ivault.onNameChanged.addOnce((prev) => {
        expect(actual.name).to.be.undefined;
        actual.name = { prev, curr: ivault.name };
      });

      ivault.onRootSubjectChanged.addOnce((prev) => {
        expect(actual.subject).to.be.undefined;
        actual.subject = { prev, curr: ivault.rootSubject };
      });

      ivault.onProjectExtentsChanged.addOnce((prev) => {
        expect(actual.extents).to.be.undefined;
        actual.extents = { prev, curr: ivault.projectExtents };
      });

      ivault.onGlobalOriginChanged.addOnce((prev) => {
        expect(actual.globalOrigin).to.be.undefined;
        actual.globalOrigin = { prev, curr: ivault.globalOrigin };
      });

      ivault.onEcefLocationChanged.addOnce((prev) => {
        expect(actual.ecef).to.be.undefined;
        actual.ecef = { prev, curr: ivault.ecefLocation };
      });

      ivault.onGeographicCoordinateSystemChanged.addOnce((prev) => {
        expect(actual.gcs).to.be.undefined;
        actual.gcs = { prev, curr: ivault.geographicCoordinateSystem };
      });

      func();

      expect(actual).to.deep.equal(expected);
    }

    function expectNoChange(ivault: IVault, func: () => void): void {
      expectChange(ivault, func, {});
    }

    it("are dispatched when properties change", () => {
      const props: TestIVaultProps = {
        key: "",
        name: "ivault",
        rootSubject: { name: "subject", description: "SUBJECT" },
        projectExtents: { low: [0, 1, 2], high: [3, 4, 5] },
        globalOrigin: [-1, -2, -3],
      };

      const ivault = new TestIVault(props);

      expectChange(ivault, () => ivault.name = "new name", { name: { prev: "ivault", curr: "new name" } });

      expectChange(ivault, () => ivault.rootSubject = { name: "subj" }, {
        subject: {
          prev: props.rootSubject,
          curr: { name: "subj" },
        },
      });

      const newRange = Range3d.fromJSON({ low: [0, 0, 0], high: [100, 100, 100] });
      expectChange(ivault, () => ivault.projectExtents = newRange, { extents: { prev: ivault.projectExtents, curr: newRange } });

      const newOrigin = new Point3d(101, 202, 303);
      expectChange(ivault, () => ivault.globalOrigin = newOrigin, { globalOrigin: { prev: ivault.globalOrigin, curr: newOrigin } });

      const ecef = new EcefLocation({
        origin: [42, 21, 0],
        orientation: { yaw: 1, pitch: 1, roll: -1 },
      });
      expectChange(ivault, () => ivault.setEcefLocation(ecef), { ecef: { prev: undefined, curr: ecef } });
      const newEcef = new EcefLocation({
        origin: [0, 10, 20],
        orientation: { yaw: 5, pitch: 90, roll: -45 },
      });
      expectChange(ivault, () => ivault.setEcefLocation(newEcef), { ecef: { prev: ecef, curr: newEcef } });
      expectChange(ivault, () => ivault.initFromProps({ ...ivault.getProps(), ecefLocation: undefined }), { ecef: { prev: newEcef, curr: undefined } });

      const newProps: TestIVaultProps = {
        key: "",
        name: "abc",
        rootSubject: { name: "new subject" },
        projectExtents: { low: [-100, 0, -50], high: [100, 20, 50] },
        globalOrigin: [123, 456, 789],
      };
      expectChange(ivault, () => ivault.initFromProps(newProps), {
        name: { prev: ivault.name, curr: "abc" },
        subject: { prev: ivault.rootSubject, curr: { name: "new subject" } },
        extents: { prev: ivault.projectExtents, curr: Range3d.fromJSON(newProps.projectExtents) },
        globalOrigin: { prev: ivault.globalOrigin, curr: Point3d.fromJSON(newProps.globalOrigin) },
      });
    });

    it("are not dispatched when no net property change", () => {
      const ecefLocation: EcefLocationProps = {
        origin: [0, 1, 2],
        orientation: { yaw: 0, pitch: 45, roll: 90 },
      };

      const props: TestIVaultProps = {
        key: "",
        name: "ivault",
        rootSubject: { name: "subject", description: "SUBJECT" },
        projectExtents: { low: [0, 1, 2], high: [3, 4, 5] },
        globalOrigin: [-1, -2, -3],
        ecefLocation,
      };

      const ivault = new TestIVault(props);

      expectNoChange(ivault, () => ivault.name = ivault.name);
      expectNoChange(ivault, () => ivault.rootSubject = { ...ivault.rootSubject });
      expectNoChange(ivault, () => ivault.projectExtents = ivault.projectExtents.clone());
      expectNoChange(ivault, () => ivault.globalOrigin = ivault.globalOrigin.clone());
      expectNoChange(ivault, () => ivault.geographicCoordinateSystem = undefined);
      expectNoChange(ivault, () => ivault.setEcefLocation({ ...ecefLocation }));

      expectNoChange(ivault, () => ivault.initFromProps({ ...props }));
      expectNoChange(ivault, () => ivault.initFromProps(ivault.getProps()));
    });
  });

  it("is geolocated IFF it has a valid EcefLocation", () => {
    const props: TestIVaultProps = {
      rootSubject: { name: "subject", description: "SUBJECT" },
      projectExtents: { low: [0, 1, 2], high: [3, 4, 5] },
      globalOrigin: [-1, -2, -3],
      key: "",
    };

    expect(new TestIVault(props).isGeoLocated).to.be.false;
    expect(new TestIVault({
      ...props,
      ecefLocation: { origin: [0, 0, 0], orientation: { yaw: 0, pitch: 0, roll: 0 } },
    }).isGeoLocated).to.be.false;
    expect(new TestIVault({
      ...props,
      ecefLocation: { origin: [1, 0, 0], orientation: { yaw: 0, pitch: 0, roll: 0 } },
    }).isGeoLocated).to.be.true;
  });
});
