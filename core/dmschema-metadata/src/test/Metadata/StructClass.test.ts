/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, describe, expect, it } from "vitest";
import { SchemaContext } from "../../Context";
import { StructClass } from "../../Metadata/Class";
import { Schema } from "../../Metadata/Schema";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";

/* eslint-disable @typescript-eslint/naming-convention */

describe("StructClass", () => {
	it("should get fullName", async () => {
		const schemaJson = createSchemaJsonWithItems({
			testStruct: {
				schemaItemType: "StructClass",
			},
		});

		const dmSchema = await Schema.fromJson(schemaJson, new SchemaContext());
		expect(dmSchema).toBeDefined();
		const structClass = await dmSchema.getItem("testStruct", StructClass);
		expect(structClass).toBeDefined();
		expect(structClass!.fullName).toBe("TestSchema.testStruct");
	});

	describe("struct class type safety checks", () => {
		const typeCheckJson = createSchemaJsonWithItems({
			TestStructClass: {
				schemaItemType: "StructClass",
				label: "Test Struct Class",
				description: "Used for testing",
				modifier: "Sealed",
			},
			TestPhenomenon: {
				schemaItemType: "Phenomenon",
				definition: "LENGTH(1)",
			},
		});

		let dmSchema: Schema;

		beforeAll(async () => {
			dmSchema = await Schema.fromJson(typeCheckJson, new SchemaContext());
			expect(dmSchema).toBeDefined();
		});

		it("typeguard and type assertion should work on StructClass", async () => {
			const testStructClass = await dmSchema.getItem("TestStructClass");
			expect(testStructClass).toBeDefined();
			expect(StructClass.isStructClass(testStructClass)).toBe(true);
			expect(() => StructClass.assertIsStructClass(testStructClass)).not.toThrow();
			// verify against other schema item type
			const testPhenomenon = await dmSchema.getItem("TestPhenomenon");
			expect(testPhenomenon).toBeDefined();
			expect(StructClass.isStructClass(testPhenomenon)).toBe(false);
			expect(() => StructClass.assertIsStructClass(testPhenomenon)).toThrow();
		});

		it("StructClass type should work with getItem/Sync", async () => {
			expect(await dmSchema.getItem("TestStructClass", StructClass)).toBeInstanceOf(StructClass);
			expect(dmSchema.getItemSync("TestStructClass", StructClass)).toBeInstanceOf(StructClass);
		});

		it("StructClass type should reject for other item types on getItem/Sync", async () => {
			expect(await dmSchema.getItem("TestPhenomenon", StructClass)).toBeUndefined();
			expect(dmSchema.getItemSync("TestPhenomenon", StructClass)).toBeUndefined();
		});
	});
});
