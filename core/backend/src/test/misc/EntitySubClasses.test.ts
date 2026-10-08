import { expect } from "chai";
import { AuxCoordSystemProps, Code, GeometricModel2dProps, ModelProps } from "@szewtwin/core-common";
import { SnapshotDb } from "../../IVaultDb";
import { GeometricModel2d } from "../../Model";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { AuxCoordSystem2d, AuxCoordSystem3d } from "../../ViewDefinition";

describe("EntitySubClasses", () => {
  let iVaultDb: SnapshotDb;

  before(() => {
    const testFileName = IVaultTestUtils.prepareOutputFile("EntitySubClasses", "Empty.dtw");
    iVaultDb = SnapshotDb.createEmpty(testFileName, { rootSubject: { name: "Subject" } });
  });

  after(() => {
    iVaultDb.close();
  })

  it("should correctly set globalOrigin for GeometricModel2d", async () => {
    const modelProps: ModelProps = {
      modeledElement: { id: "" },
      classFullName: GeometricModel2d.classFullName,
    }

    let model = iVaultDb.constructEntity<GeometricModel2d, GeometricModel2dProps>({
      ...modelProps,
      globalOrigin: undefined,
    });
    expect(model.globalOrigin).to.be.undefined;

    model = iVaultDb.constructEntity<GeometricModel2d, GeometricModel2dProps>({
      ...modelProps,
      globalOrigin: { x: 1, y: 2 },
    });
    expect(model.globalOrigin?.x).to.equal(1);
    expect(model.globalOrigin?.y).to.equal(2);

    model = iVaultDb.constructEntity<GeometricModel2d, GeometricModel2dProps>({
      ...modelProps,
      globalOrigin: [3, 4],
    });
    expect(model.globalOrigin?.x).to.equal(3);
    expect(model.globalOrigin?.y).to.equal(4);
  });

  it("should correctly set origin, angle for AuxCoordSystem2d", async () => {
    const props: AuxCoordSystemProps = {
      classFullName: AuxCoordSystem2d.classFullName,
      model: "",
      code: Code.createEmpty(),
    }

    let coordSystem = new AuxCoordSystem2d({
      ...props,
    }, iVaultDb);
    expect(coordSystem.origin).to.be.undefined;
    expect(coordSystem.angle).to.be.undefined;

    coordSystem = new AuxCoordSystem2d({
      ...props,
      origin: { x: 1, y: 2 },
      angle: 45,
    }, iVaultDb);
    expect(coordSystem.origin?.x).to.equal(1);
    expect(coordSystem.origin?.y).to.equal(2);
    expect(coordSystem.angle).to.be.equal(45);

    coordSystem = new AuxCoordSystem2d({
      ...props,
      origin: [3, 4],
      angle: { radians: Math.PI / 2 },
    }, iVaultDb);
    expect(coordSystem.origin?.x).to.equal(3);
    expect(coordSystem.origin?.y).to.equal(4);
    expect(coordSystem.angle).to.be.equal(90);
  });

  it("should correctly set origin, yaw, pitch, roll for AuxCoordSystem3d", async () => {
    const props: AuxCoordSystemProps = {
      classFullName: AuxCoordSystem3d.classFullName,
      model: "",
      code: Code.createEmpty(),
    }

    let coordSystem = new AuxCoordSystem3d(props, iVaultDb)
    expect(coordSystem.origin).to.be.undefined;
    expect(coordSystem.yaw).to.be.undefined;
    expect(coordSystem.pitch).to.be.undefined;
    expect(coordSystem.roll).to.be.undefined;

    coordSystem = new AuxCoordSystem3d({
      ...props,
      origin: { x: 1, y: 2, z: 3 },
      yaw: 10,
      pitch: 20,
      roll: 30,
    }, iVaultDb)
    expect(coordSystem.origin?.x).to.equal(1);
    expect(coordSystem.origin?.y).to.equal(2);
    expect(coordSystem.origin?.z).to.equal(3);
    expect(coordSystem.yaw).to.be.equal(10);
    expect(coordSystem.pitch).to.be.equal(20);
    expect(coordSystem.roll).to.be.equal(30);

    coordSystem = new AuxCoordSystem3d({
      ...props,
      origin: [4, 5, 6],
      yaw: { radians: Math.PI / 4 },
      pitch: { radians: Math.PI / 2 },
      roll: { radians: Math.PI },
    }, iVaultDb)
    expect(coordSystem.origin?.x).to.equal(4);
    expect(coordSystem.origin?.y).to.equal(5);
    expect(coordSystem.origin?.z).to.equal(6);
    expect(coordSystem.yaw).to.be.equal(45);
    expect(coordSystem.pitch).to.be.equal(90);
    expect(coordSystem.roll).to.be.equal(180);
  });
});
