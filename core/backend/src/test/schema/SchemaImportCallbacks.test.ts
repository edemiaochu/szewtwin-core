/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import * as path from "path";
import { Guid, Id64String } from "@szewtwin/core-szewec";
import { Code, ElementProps, IVault } from "@szewtwin/core-common";
import { EditTxn, withEditTxn } from "../../EditTxn";
import { BriefcaseDb, ChannelControl, ChannelUpgradeContext, DataTransformationStrategy, IVaultDb, IVaultJsFs, PostImportContext, StandaloneDb } from "../../core-backend";
import { HubWrappers, IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubMock } from "../../internal/HubMock";

describe("Schema Import Callbacks", () => {
  let ivault: StandaloneDb;

  // Test schema with version changes
  const testSchemaV100 = () => `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
      <DMEntityClass typeName="TestElement">
        <BaseClass>bis:DefinitionElement</BaseClass>
        <DMProperty propertyName="StringProp" typeName="string" />
        <DMProperty propertyName="IntProp" typeName="int" />
        <DMProperty propertyName="ModelName" typeName="string" />
      </DMEntityClass>
    </DMSchema>`;

  const testSchemaV101 = () => `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestSchema" alias="ts" version="1.0.1" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
      <DMEntityClass typeName="TestElement">
        <BaseClass>bis:DefinitionElement</BaseClass>
        <DMProperty propertyName="StringProp" typeName="string" />
        <DMProperty propertyName="IntProp" typeName="int" />
        <DMProperty propertyName="NewProp" typeName="string" />
        <DMProperty propertyName="ModelName" typeName="string" />
      </DMEntityClass>
    </DMSchema>`;

  interface TestInitialElementProps extends ElementProps {
    stringProp: string;
    intProp: number;
    modelName?: string;
  }

  interface TestUpdatedElementProps extends TestInitialElementProps {
    newProp?: string;
  }

  beforeEach(() => {
    const testFileName = IVaultTestUtils.prepareOutputFile("SchemaImportCallbacks", `SchemaCallbackTest_${Guid.createValue()}.bim`);
    ivault = StandaloneDb.createEmpty(testFileName, { rootSubject: { name: "TestSubject" }, allowEdit: JSON.stringify({ txns: true }) });
    assert.exists(ivault);
  });

  afterEach(() => {
    if (ivault?.isOpen)
      ivault.close();
  });

  describe("Basic Callback Execution", () => {
    it("should work without callbacks", async () => {
      // This should not throw and should work as before
      await ivault.importSchemaStrings([testSchemaV100()]);
      assert.isTrue(ivault.containsClass(`TestSchema:TestElement`));
    });

    it("should call both callbacks in correct order", async () => {
      const callOrder: string[] = [];

      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async () => {
            callOrder.push("before");
            return { transformStrategy: DataTransformationStrategy.None };
          },
          postSchemaImportCallback: async () => {
            callOrder.push("after");
          },
        },
      });

      assert.deepEqual(callOrder, ["before", "after"]);
    });
  });

  describe("DataTransformationStrategy.None", () => {
    it("should not create snapshot or cache data with None strategy", async () => {
      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          postSchemaImportCallback: async (context) => {
            assert.isUndefined(context.resources.snapshot);
            assert.isUndefined(context.resources.cachedData);
          },
        },
      });
    });
  });

  describe("DataTransformationStrategy.InMemory", () => {
    it("should pass cached data from preImport to postImport", async () => {
      interface CachedData {
        elements: ElementProps[];
        cachedNumber: number;
      }

      let receivedCachedData: CachedData | undefined;
      const expectedCachedData: CachedData = {
        elements: [
          { id: "0x1", classFullName: "BisCore:DefinitionElement" } as ElementProps,
          { id: "0x2", classFullName: "BisCore:DefinitionElement" } as ElementProps,
        ],
        cachedNumber: 1234,
      };

      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async () => ({
            transformStrategy: DataTransformationStrategy.InMemory,
            cachedData: {
              elements: [
                { id: "0x1", classFullName: "BisCore:DefinitionElement" } as ElementProps,
                { id: "0x2", classFullName: "BisCore:DefinitionElement" } as ElementProps,
              ],
              cachedNumber: 1234,
            },
          }),
          postSchemaImportCallback: async (context: PostImportContext) => {
            receivedCachedData = context.resources.cachedData as CachedData;
            assert.isDefined(context.resources.cachedData);
            assert.equal(context.resources.cachedData!.elements.length, 2);
            assert.deepEqual(receivedCachedData.elements, expectedCachedData.elements);
            assert.equal(receivedCachedData.cachedNumber, expectedCachedData.cachedNumber);
            assert.isUndefined(context.resources.snapshot);
          },
        },
      });
    });

    it("should cache element properties and use them after import", async () => {
      // First import the schema
      await ivault.importSchemaStrings([testSchemaV100()]);

      // Create a test element
      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "original value of first element",
        intProp: 42,
      };

      const elementId1 = withEditTxn(ivault, (txn) => txn.insertElement(elementProps));

      // Now import updated schema and transform the element
      interface CachedElements {
        ids: Id64String[];
      }

      const elementIds: Id64String[] = [elementId1];

      await withEditTxn(ivault, "cache callback writes", async (txn) => {
        await ivault.importSchemaStrings([testSchemaV101()], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async (context) => {
              // Create another element before the schema import
              assert.equal(elementIds.length, 1);
              const element = context.iVault.elements.getElementProps<TestInitialElementProps>(elementIds[0]);
              assert.isDefined(element.stringProp);
              assert.isDefined(element.intProp);

              elementProps.stringProp = "original value of second element";
              elementProps.intProp = 84;
              elementIds.push(txn.insertElement(elementProps));

              const cached: CachedElements = { ids: elementIds };

              return {
                transformStrategy: DataTransformationStrategy.InMemory,
                cachedData: cached,
              };
            },
            postSchemaImportCallback: async (context: PostImportContext) => {
              // Use cached data to update element with new property
              assert.isDefined(context.resources.cachedData?.ids);
              const updatedElementProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(context.resources.cachedData!.ids[1]);
              assert.isDefined(updatedElementProps.stringProp);
              assert.isDefined(updatedElementProps.intProp);
              assert.isUndefined(updatedElementProps.newProp);
              updatedElementProps.stringProp = "modified in postImport";
              updatedElementProps.newProp = `New Prop Added`;
              txn.updateElement<TestUpdatedElementProps>(updatedElementProps);
            },
          },
        });
      });

      // Verify the transformation
      let finalElementProps = ivault.elements.getElementProps<TestUpdatedElementProps>(elementIds[0]);
      assert.equal(finalElementProps.stringProp, "original value of first element");
      assert.isUndefined(finalElementProps.newProp);

      finalElementProps = ivault.elements.getElementProps<TestUpdatedElementProps>(elementIds[1]);
      assert.equal(finalElementProps.stringProp, "modified in postImport");
      assert.isDefined(finalElementProps.newProp);
      assert.equal(finalElementProps.newProp, "New Prop Added");
    });
  });

  describe("DataTransformationStrategy.Snapshot", () => {
    it("should provide snapshot in postImport callback", async () => {
      let snapshotProvided = false;

      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.Snapshot }),
          postSchemaImportCallback: async (context) => {
            assert.isDefined(context.resources.snapshot);
            assert.notEqual(context.resources.snapshot, context.iVault);
            assert.isTrue(context.resources.snapshot!.isSnapshot);
            snapshotProvided = true;
          },
        },
      });

      assert.isTrue(snapshotProvided);
    });

    it("should allow reading pre-import state from snapshot", async () => {
      // First import initial schema
      await ivault.importSchemaStrings([testSchemaV100()]);

      // Create element with original schema
      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "snapshot test",
        intProp: 123,
      };

      const elementId = withEditTxn(ivault, "Insert element before schema upgrade", (txn) => txn.insertElement(elementProps));

      // Import updated schema with snapshot strategy
      let originalStringValue: string | undefined;

      await withEditTxn(ivault, "snapshot callback writes", async (txn) => {
        await ivault.importSchemaStrings([testSchemaV101()], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.Snapshot }),
            postSchemaImportCallback: async (context) => {
              assert.isDefined(context.resources.snapshot);
              assert.equal(context.resources.snapshot?.getSchemaProps("TestSchema").version, "01.00.00");
              assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.01");

              // Read original value from snapshot
              const snapshotElementProps = context.resources.snapshot!.elements.getElementProps<TestInitialElementProps>(elementId);
              originalStringValue = snapshotElementProps.stringProp;

              // Update element in main iVault with new property based on snapshot data
              const updatedElementProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
              updatedElementProps.newProp = `Original was: ${originalStringValue}`;
              txn.updateElement(updatedElementProps);
            },
          },
        });
      });

      assert.equal(originalStringValue, "snapshot test");
      const finalElement = ivault.elements.getElement(elementId);
      assert.equal((finalElement as any).newProp, "Original was: snapshot test");
    });

    it("should clean up snapshot after successful import", async () => {
      let snapshotPath: string | undefined;

      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.Snapshot }),
          postSchemaImportCallback: async (context) => {
            assert.isDefined(context.resources.snapshot);
            snapshotPath = context.resources.snapshot!.pathName;
            assert.isTrue(IVaultJsFs.existsSync(snapshotPath));
          },
        },
      });

      if (snapshotPath) {
        assert.isFalse(IVaultJsFs.existsSync(snapshotPath), "Snapshot file should be cleaned up");
      }
    });
  });

  describe("Error Handling", () => {
    it("In memory strategy selected without caching any data pre import", async () => {
      try {
        await ivault.importSchemaStrings([testSchemaV100()], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.InMemory }),
            postSchemaImportCallback: async (context) => {
              assert.isUndefined(context.resources.snapshot);
            },
          },
        });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).to.equal("Failed to execute preSchemaImportCallback: InMemory transform strategy requires cachedData to be provided.");
      }
    });

    it("should abandon changes if postImport callback throws", async () => {
      // First import initial schema
      await ivault.importSchemaStrings([testSchemaV100()]);

      // Create element
      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "test",
        intProp: 1,
      };

      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");

      const elementId = withEditTxn(ivault, "Insert test element", (txn) => txn.insertElement(elementProps));

      // Try to import with failing callback
      try {
        await withEditTxn(ivault, "failing callback writes", async (txn) => {
          await ivault.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              postSchemaImportCallback: async (context) => {
                // Make a change
                const updatedElementProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
                updatedElementProps.intProp += 1;
                updatedElementProps.stringProp = "should be reverted";
                updatedElementProps.newProp = "should be reverted";
                txn.updateElement(updatedElementProps);

                // Then throw error
                throw new Error("Intentional callback failure");
              },
            },
          });
        });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.equal(err.message, "Failed to execute postSchemaImportCallback: Intentional callback failure");
      }

      // Schema import should have been successful
      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.01");

      // Changes should be abandoned - element should not have newProp
      const finalElementProps = ivault.elements.getElementProps<TestUpdatedElementProps>(elementId);
      assert.equal(finalElementProps.intProp, 1);
      assert.equal(finalElementProps.stringProp, "test");
      assert.isUndefined(finalElementProps.newProp);
    });

    it("should clean up snapshot when postImport throws error", async () => {
      let snapshotPath: string | undefined;

      try {
        await ivault.importSchemaStrings([testSchemaV100()], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.Snapshot }),
            postSchemaImportCallback: async (context) => {
              snapshotPath = context.resources.snapshot!.pathName;
              throw new Error("Error after snapshot created");
            },
          },
        });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.equal(err.message, "Failed to execute postSchemaImportCallback: Error after snapshot created");
      }

      if (snapshotPath) {
        assert.isFalse(IVaultJsFs.existsSync(snapshotPath), "Snapshot should be cleaned up even after error");
      }
    });

    it("should handle error in preImport callback", async () => {
      await ivault.importSchemaStrings([testSchemaV100()]);
      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");

      try {
        await ivault.importSchemaStrings([testSchemaV101()], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async () => {
              throw new Error("Error in preImport");
            },
          },
        });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.equal(err.message, "Failed to execute preSchemaImportCallback: Error in preImport");
      }

      // Schema should not have been imported
      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");
    });
  });

  describe("File-based Schema Import", () => {
    it("should work with importSchemas() using file paths", async () => {
      const schemaPath = path.join(KnownTestLocations.outputDir, `TestSchema.01.00.00.dmschema.xml`);
      IVaultJsFs.writeFileSync(schemaPath, testSchemaV100());

      let callbackExecuted = false;

      try {
        await ivault.importSchemas([schemaPath], {
          schemaImportCallbacks: {
            preSchemaImportCallback: async (context) => {
              assert.isDefined(context.schemaData);
              assert.equal(context.schemaData.length, 1);
              assert.equal(context.schemaData[0], schemaPath);
              callbackExecuted = true;
              return { transformStrategy: DataTransformationStrategy.None };
            },
          },
        });

        assert.isTrue(callbackExecuted);
        assert.isTrue(ivault.containsClass(`TestSchema:TestElement`));
      } finally {
        if (IVaultJsFs.existsSync(schemaPath)) {
          IVaultJsFs.removeSync(schemaPath);
        }
      }
    });

    it("should have consistent behavior between importSchemas and importSchemaStrings", async () => {
      const schemaPath = path.join(KnownTestLocations.outputDir, `TestSchema.01.00.00.dmschema.xml`);
      IVaultJsFs.writeFileSync(schemaPath, testSchemaV100());

      const executionLogFile: string[] = [];
      const executionLogString: string[] = [];

      try {
        // Test with file-based import
        await ivault.importSchemas([schemaPath], {
          data: { testId: "file-based" },
          channelUpgrade: {
            channelKey: "shared",
            fromVersion: "1.0.0",
            toVersion: "2.0.0",
            callback: async (context) => {
              executionLogFile.push(`channel: ${context.data.testId}`);
            },
          },
          schemaImportCallbacks: {
            preSchemaImportCallback: async (context) => {
              executionLogFile.push(`pre: ${context.data.testId}`);
              return { transformStrategy: DataTransformationStrategy.None };
            },
            postSchemaImportCallback: async (context) => {
              executionLogFile.push(`post: ${context.data.testId}`);
            },
          },
        });

        // Clean iVault for next test
        ivault.close();
        const testFileName2 = IVaultTestUtils.prepareOutputFile("SchemaImportCallbacks", `SchemaCallbackTest_${Guid.createValue()}.bim`);
        ivault = StandaloneDb.createEmpty(testFileName2, { rootSubject: { name: "TestSubject" }, allowEdit: JSON.stringify({ txns: true }) });

        // Test with string-based import
        await ivault.importSchemaStrings([testSchemaV100()], {
          data: { testId: "string-based" },
          channelUpgrade: {
            channelKey: "shared",
            fromVersion: "1.0.0",
            toVersion: "2.0.0",
            callback: async (context) => {
              executionLogString.push(`channel: ${context.data.testId}`);
            },
          },
          schemaImportCallbacks: {
            preSchemaImportCallback: async (context) => {
              executionLogString.push(`pre: ${context.data.testId}`);
              return { transformStrategy: DataTransformationStrategy.None };
            },
            postSchemaImportCallback: async (context) => {
              executionLogString.push(`post: ${context.data.testId}`);
            },
          },
        });

        // Both should have identical execution patterns
        assert.equal(executionLogFile.length, executionLogString.length);
        assert.deepEqual(
          executionLogFile.map(s => s.split(":")[0]),
          executionLogString.map(s => s.split(":")[0])
        );
      } finally {
        if (IVaultJsFs.existsSync(schemaPath))
          IVaultJsFs.removeSync(schemaPath);
      }
    });
  });

  describe("Channel Access Validation", () => {
    beforeEach(async () => {
      // Import schema first
      await ivault.importSchemaStrings([testSchemaV100()]);
      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");

      ivault.channels.addAllowedChannel("shared");
    });

    it("should throw ChannelConstraintViolation when modifying element from disabled channel pre import", async () => {
      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "test element",
        intProp: 100,
      };

      const elementId = withEditTxn(ivault, "Create test element", (txn) => txn.insertElement(elementProps));

      // Now REMOVE the shared channel permission
      ivault.channels.removeAllowedChannel("shared");

      // Try to import schema and modify element - should fail
      try {
        await withEditTxn(ivault, "channel validation pre import", async (txn) => {
          await ivault.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              preSchemaImportCallback: async (context) => {
                // This should throw because shared channel is not allowed
                const updatedProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
                updatedProps.newProp = "This should fail";
                txn.updateElement(updatedProps); // Should throw here

                return { transformStrategy: DataTransformationStrategy.None };
              }
            },
          });
        });
        assert.fail("Should have thrown ChannelConstraintViolation");
      } catch (err: any) {
        // Verify it's a channel constraint error
        assert.include(err.message.toLowerCase(), "error updating element [channel shared is not allowed]", "Error should mention channel constraint");
      }

      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");
    });

    it("should throw ChannelConstraintViolation when modifying element from disabled channel post import", async () => {
      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "test element",
        intProp: 100,
      };

      const elementId = withEditTxn(ivault, "Create test element", (txn) => txn.insertElement(elementProps));

      // Now REMOVE the shared channel permission
      ivault.channels.removeAllowedChannel("shared");

      // Try to import schema and modify element - should fail
      try {
        await withEditTxn(ivault, "channel validation post import", async (txn) => {
          await ivault.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.None }),
              postSchemaImportCallback: async (context) => {
                // This should throw because shared channel is not allowed
                const updatedProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
                updatedProps.newProp = "This should fail";
                txn.updateElement(updatedProps); // Should throw here
              },
            },
          });
        });
        assert.fail("Should have thrown ChannelConstraintViolation");
      } catch (err: any) {
        // Verify it's a channel constraint error
        assert.include(err.message.toLowerCase(), "error updating element [channel shared is not allowed]", "Error should mention channel constraint");
      }

      // Verify element was NOT modified (changes were abandoned)
      ivault.channels.addAllowedChannel("shared"); // Re-enable to read
      const finalProps = ivault.elements.getElementProps<TestUpdatedElementProps>(elementId);
      assert.isUndefined(finalProps.newProp, "Element should not have been modified");
    });

    it("should handle channel permission check in snapshot strategy", async () => {
      // Enable channel and create element
      ivault.channels.addAllowedChannel("shared");
      await ivault.importSchemaStrings([testSchemaV100()]);

      const model = ivault.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "snapshot test",
        intProp: 123,
      };

      const elementId = withEditTxn(ivault, "Create test element", (txn) => txn.insertElement(elementProps));

      // Disable channel before schema import with snapshot
      ivault.channels.removeAllowedChannel("shared");

      try {
        await withEditTxn(ivault, "channel validation snapshot import", async (txn) => {
          await ivault.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              preSchemaImportCallback: async () => ({ transformStrategy: DataTransformationStrategy.Snapshot }),
              postSchemaImportCallback: async (context) => {
                // Can read from snapshot (it's read-only, no channel check)
                const snapshotProps = context.resources.snapshot!.elements.getElementProps<TestInitialElementProps>(elementId);
                assert.equal(snapshotProps.stringProp, "snapshot test");

                // But can't modify in main iVault without channel permission
                const updatedProps = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
                updatedProps.newProp = "This should fail";
                txn.updateElement(updatedProps); // Should throw
              },
            },
          });
        });
        assert.fail("Should have thrown ChannelConstraintViolation");
      } catch (err: any) {
        assert.include(err.message.toLowerCase(), "channel", "Error should mention channel constraint");
      }
    });
  });

  describe("User Data Propagation", () => {
    it("should pass user data to all callbacks", async () => {
      interface UserData {
        processId: string;
        cachedNumber: number;
        metadata: { version: string };
      }

      const userData: UserData = {
        processId: "test-process-123",
        cachedNumber: 1234,
        metadata: { version: "1.0.0" },
      };

      const receivedData: { channel?: UserData; pre?: UserData; post?: UserData } = {};

      await ivault.importSchemaStrings([testSchemaV100()], {
        data: userData,
        channelUpgrade: {
          channelKey: "shared",
          fromVersion: "1.0.0",
          toVersion: "1.1.0",
          callback: async (context) => {
            receivedData.channel = context.data;
          },
        },
        schemaImportCallbacks: {
          preSchemaImportCallback: async (context) => {
            receivedData.pre = context.data;
            return { transformStrategy: DataTransformationStrategy.None };
          },
          postSchemaImportCallback: async (context) => {
            receivedData.post = context.data;
          },
        },
      });

      // Verify all callbacks received the user data passed
      assert.deepEqual(receivedData.channel, userData);
      assert.deepEqual(receivedData.pre, userData);
      assert.deepEqual(receivedData.post, userData);
    });

    it("should handle more complicated user data structures", async () => {
      interface ComplexUserData {
        elementMap: Map<Id64String, string>;
        counters: { inserted: number; updated: number };
        handlers: Array<{ name: string; enabled: boolean }>;
      }

      const userData: ComplexUserData = {
        elementMap: new Map([["0x1", "Element1"], ["0x2", "Element2"]]),
        counters: { inserted: 0, updated: 0 },
        handlers: [
          { name: "Handler1", enabled: true },
          { name: "Handler2", enabled: false },
        ],
      };

      let receivedData: ComplexUserData | undefined;

      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async () => ({
            transformStrategy: DataTransformationStrategy.None,
          }),
          postSchemaImportCallback: async (context) => {
            receivedData = context.data;
          },
        },
        data: userData,
      });

      assert.isDefined(receivedData);
      assert.equal(receivedData!.elementMap.size, 2);
      assert.equal(receivedData!.elementMap.get("0x1"), "Element1");
      assert.deepEqual(receivedData!.counters, { inserted: 0, updated: 0 });
      assert.equal(receivedData!.handlers.length, 2);
    });

    it("should work with undefined user data", async () => {
      await ivault.importSchemaStrings([testSchemaV100()], {
        schemaImportCallbacks: {
          preSchemaImportCallback: async (context) => {
            assert.isUndefined(context.data);
            return { transformStrategy: DataTransformationStrategy.None };
          },
          postSchemaImportCallback: async (context) => {
            assert.isUndefined(context.data);
          },
        },
      });
    });

    it("should allow user data mutation across callbacks", async () => {
      interface UserData {
        step: number;
        log: string[];
      }

      let userData: UserData = {
        step: 0,
        log: [],
      };

      // All 3 callbacks called
      await ivault.importSchemaStrings([testSchemaV100()], {
        data: userData,
        channelUpgrade: {
          channelKey: "shared",
          fromVersion: "1.0.0",
          toVersion: "1.1.0",
          callback: async (context) => {
            context.data!.step += 1;
            context.data!.log.push("channel-upgrade");
          },
        },
        schemaImportCallbacks: {
          preSchemaImportCallback: async (context) => {
            assert.equal(context.data!.step, 1);
            assert.deepEqual(context.data!.log, ["channel-upgrade"]);
            context.data!.step += 1;
            context.data!.log.push("pre-import");
            return { transformStrategy: DataTransformationStrategy.None };
          },
          postSchemaImportCallback: async (context) => {
            assert.equal(context.data!.step, 2);
            assert.deepEqual(context.data!.log, ["channel-upgrade", "pre-import"]);
            context.data!.step += 1;
            context.data!.log.push("post-import");
          },
        },
      });

      // Verify final state
      assert.equal(userData.step, 3); // All three callbacks executed
      assert.deepEqual(userData.log, ["channel-upgrade", "pre-import", "post-import"]);

      userData = {
        step: 0,
        log: [],
      };

      await ivault.importSchemaStrings([testSchemaV100()], {
        data: userData,
        schemaImportCallbacks: {
          postSchemaImportCallback: async (context) => {
            context.data!.step += 1;
            context.data!.log.push("post-import");
          },
        },
      });

      // Verify final state
      assert.equal(userData.step, 1); // Only post-import was called
      assert.deepEqual(userData.log, ["post-import"]);
    });
  });

  describe("Channel Reorganization Before Schema Import", () => {
    let channelRootId: Id64String;

    /**
     * Helper functions to get and set the version from a ChannelRootAspect
     */
    function getChannelVersion(iVault: IVaultDb): string | undefined {
      const aspects = iVault.elements.getAspects(channelRootId, "BisCore:ChannelRootAspect");
      if (aspects.length === 0)
        return undefined;
      return aspects[0].asAny.version;
    }

    function setChannelVersion(txn: EditTxn, version: string): void {
      const iVault = txn.iVault;
      const aspects = iVault.elements.getAspects(channelRootId, "BisCore:ChannelRootAspect");
      assert.equal(aspects.length, 1, "Should have exactly one ChannelRootAspect");

      const aspect = aspects[0];
      aspect.asAny.version = version;
      txn.updateAspect(aspect.toJSON());
    }

    // Code that simulates a channel upgrade.
    // This simulates elements being moved to different models as per the new channel organization.
    const channelUpgradeCallback = (txn: EditTxn) => async (context: ChannelUpgradeContext) => {
      (context.data.elementIds as Id64String[]).forEach((id) => {
        const elementProps = context.iVault.elements.getElementProps<TestInitialElementProps>(id);
        if (elementProps.stringProp === "Material1") {
          elementProps.modelName = "MaterialModel";
        } else if (elementProps.stringProp === "LineStyle1") {
          elementProps.modelName = "StyleModel";
        } else if (elementProps.stringProp === "Category1") {
          elementProps.modelName = "StyleModel";
        }
        txn.updateElement(elementProps);
      });
      setChannelVersion(txn, "1.0.1");
      assert.equal(getChannelVersion(context.iVault), "1.0.1");
    };

    it("need for channel reorganization before schema import", async () => {
      // Initial setup: Import v1.0.0 schema
      await ivault.importSchemaStrings([testSchemaV100()]);
      assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.00");

      const channelKey = "TestChannel";
      ivault.channels.addAllowedChannel(channelKey);

      // Create a channel
      channelRootId = withEditTxn(ivault, (txn) => ivault.channels.insertChannelSubject({
        subjectName: "Test Channel",
        channelKey,
        txn,
      }));

      assert.isUndefined(getChannelVersion(ivault), "Version should be undefined initially");

      // Set version to 1.0.0
      withEditTxn(ivault, (txn) => setChannelVersion(txn, "1.0.0"));

      // Enable shared channel and create elements
      ivault.channels.addAllowedChannel("shared");
      const rootModel = ivault.models.getModel(IVault.dictionaryId);
      assert.equal(getChannelVersion(ivault), "1.0.0");

      // Create test elements in the "old" channel structure (all in root)
      const elementIds: Id64String[] = [];
      for (const [index, name] of ["Material1", "LineStyle1", "Category1"].entries()) {
        const elementProps: TestInitialElementProps = {
          classFullName: `TestSchema:TestElement`,
          model: rootModel.id,
          code: Code.createEmpty(),
          stringProp: name,
          intProp: 100 + index * 100,
          modelName: "DefinitionModel"
        };
        elementIds.push(withEditTxn(ivault, (txn) => txn.insertElement(elementProps)));
      }

      // Scenario: Let's assume schema has evolved and v1.0.1 expects elements to be in their dedicated models (i.e. it relies on channel v1.0.1)
      // The post schema upgrade code will look for elements in their own models.
      // If the channel is still in version 1.0.0, the callback will obviously fail.
      await withEditTxn(ivault, "channel reorganization callback writes", async (txn) => {
        await ivault.importSchemaStrings([testSchemaV101()], {
          data: { elementIds },
          channelUpgrade: {
            channelKey,
            fromVersion: "1.0.0",
            toVersion: "1.0.1",
            callback: channelUpgradeCallback(txn),
          },
          schemaImportCallbacks: {
            preSchemaImportCallback: async () => {
              return {
                transformStrategy: DataTransformationStrategy.InMemory,
                cachedData: {
                  elementIds,
                },
              };
            },
            postSchemaImportCallback: async (context) => {
              // Now schema v1.0.1 expects elements to be in their dedicated models.
              const elementIdList = context.resources.cachedData!.elementIds as Id64String[];
              assert.equal(ivault.getSchemaProps("TestSchema").version, "01.00.01");
              assert.equal(getChannelVersion(context.iVault), "1.0.1");

              elementIdList.forEach((elementId: Id64String) => {
                const elementProps = context.iVault.elements.getElementProps<TestInitialElementProps>(elementId);
                assert.notEqual(elementProps.modelName, "DefinitionModel", "Element should have been moved to new model as part of the channel upgrade");
              });
            },
          },
        });
      });
    });
  });

  describe("Locking behavior", () => {
    let iVaultId: Id64String;
    const channelKey = "TestChannel";

    before(async () => {
      HubMock.startup("SchemaImportCallbackLockingTest", KnownTestLocations.outputDir);
      iVaultId = await HubMock.createNewIVault({ accessToken: "User1", szewTwinId: HubMock.szewTwinId, iVaultName: "Test", description: "TestSubject" });
    });

    after(async () => {
      HubMock.shutdown();
    });

    async function setupBriefcase(): Promise<[BriefcaseDb, Id64String]> {
      const briefcaseDb = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "User1", szewTwinId: HubMock.szewTwinId, iVaultId });
      briefcaseDb.channels.addAllowedChannel(ChannelControl.sharedChannelName);

      await briefcaseDb.importSchemaStrings([testSchemaV100()]);

      briefcaseDb.channels.addAllowedChannel(channelKey);

      if (briefcaseDb.channels.queryChannelRoot(channelKey) === undefined) {
        withEditTxn(briefcaseDb, (txn) => briefcaseDb.channels.insertChannelSubject({
          subjectName: "Test Channel",
          channelKey,
          txn,
        }));
      }

      const model = briefcaseDb.models.getModel(IVault.dictionaryId);
      const elementProps: TestInitialElementProps = {
        classFullName: `TestSchema:TestElement`,
        model: model.id,
        code: Code.createEmpty(),
        stringProp: "test",
        intProp: 100,
      };

      const elementId = withEditTxn(briefcaseDb, "Create test element", (txn) => txn.insertElement(elementProps));
      await briefcaseDb.pushChanges({ description: "Create test element" });

      return [briefcaseDb, elementId];
    }

    it("channel upgrade callback fails without locks", async () => {
      const [briefcaseDb, elementId] = await setupBriefcase();

      // Try to modify without acquiring locks in the callback
      try {
        await withEditTxn(briefcaseDb, "channel upgrade without locks", async (txn) => {
          await briefcaseDb.importSchemaStrings([testSchemaV101()], {
            channelUpgrade: {
              channelKey,
              fromVersion: "1.0.0",
              toVersion: "1.0.1",
              callback: async (context) => {
                // Intentionally NOT acquiring locks
                const props = context.iVault.elements.getElementProps<TestInitialElementProps>(elementId);
                props.stringProp = "should fail";
                txn.updateElement(props);
              },
            },
          });
        });
        assert.fail("Should have thrown error about missing locks");
      } catch (err: any) {
        assert.equal(err.szewTwinErrorId.key.name, "Lock Not Held");
      }

      // Try again with locks
      try {
        await withEditTxn(briefcaseDb, "channel upgrade with locks", async (txn) => {
          await briefcaseDb.importSchemaStrings([testSchemaV101()], {
            channelUpgrade: {
              channelKey,
              fromVersion: "1.0.0",
              toVersion: "1.0.1",
              callback: async (context) => {
                await context.iVault.locks.acquireLocks({ exclusive: elementId });
                const props = context.iVault.elements.getElementProps<TestInitialElementProps>(elementId);
                props.stringProp = "updated with locks";
                txn.updateElement(props);
              },
            },
          });
        });
      } catch (err: any) {
        assert.fail(`Should not have thrown error when locks are acquired: ${err.message}`);
      }
      await HubWrappers.closeAndDeleteBriefcaseDb("User1", briefcaseDb);
    });

    it("preSchemaImportCallback fails without locks", async () => {
      const [briefcaseDb, elementId] = await setupBriefcase();

      // Try to modify without acquiring locks in the callback
      try {
        await withEditTxn(briefcaseDb, "pre import without locks", async (txn) => {
          await briefcaseDb.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              preSchemaImportCallback: async (context) => {
                // Intentionally NOT acquiring locks
                const props = context.iVault.elements.getElementProps<TestInitialElementProps>(elementId);
                props.stringProp = "should fail";
                txn.updateElement(props);

                return { transformStrategy: DataTransformationStrategy.None };
              },
            },
          });
        });
        assert.fail("Should have thrown error about missing locks");
      } catch (err: any) {
        assert.equal(err.name, "Lock Not Held");
      }

      // Try again with locks
      try {
        await withEditTxn(briefcaseDb, "pre import with locks", async (txn) => {
          await briefcaseDb.importSchemaStrings([testSchemaV101()], {
            schemaImportCallbacks: {
              preSchemaImportCallback: async (context) => {
                await context.iVault.locks.acquireLocks({ exclusive: elementId });
                const props = context.iVault.elements.getElementProps<TestInitialElementProps>(elementId);
                props.stringProp = "should fail";
                txn.updateElement(props);

                return { transformStrategy: DataTransformationStrategy.None };
              },
            },
          });
        });
      } catch (err: any) {
        assert.fail(`Should not have thrown error when locks are acquired: ${err.message}`);
      }
      await HubWrappers.closeAndDeleteBriefcaseDb("User1", briefcaseDb);
    });

    it("lock acquisition is not required during postSchemaImportCallback", async () => {
      const [briefcaseDb, elementId] = await setupBriefcase();

      let postImportCalled = false;

      await withEditTxn(briefcaseDb, "post import with schema lock", async (txn) => {
        await briefcaseDb.importSchemaStrings([testSchemaV101()], {
          schemaImportCallbacks: {
            postSchemaImportCallback: async (context) => {
              postImportCalled = true;

              // Schema lock is already held at this point
              const props = context.iVault.elements.getElementProps<TestUpdatedElementProps>(elementId);
              props.newProp = "added in postImport with schema lock held";
              txn.updateElement(props);
            },
          },
        });
      });

      assert.isTrue(postImportCalled, "Post-import callback should have been called");
      const finalProps = briefcaseDb.elements.getElementProps<TestUpdatedElementProps>(elementId);
      assert.equal(finalProps.newProp, "added in postImport with schema lock held");
      await HubWrappers.closeAndDeleteBriefcaseDb("User1", briefcaseDb);
    });
  });
});

