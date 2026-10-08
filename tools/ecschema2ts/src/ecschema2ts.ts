/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  DMClass, DMClassModifier, EntityClass, Enumeration, EnumerationProperty, Mixin, PrimitiveType, Schema, SchemaItem, SchemaItemType, StructClass,
} from "@szewtwin/dmschema-metadata";

interface TsSzewecModule {
  moduleName: string;
  resolvedConflictName: string;
}

const customHandledPropertyCA: string = "BisCore.CustomHandledProperty";
const elementDMClassName: string = "BisCore.Element";
const tsSzewecModules: { [index: string]: TsSzewecModule } = {
  tsIVaultJsCommon: {
    moduleName: "@szewtwin/core-common",
    resolvedConflictName: "BeIVaultJsCommon",
  },
  tsIVaultJsBackend: {
    moduleName: "@szewtwin/core-backend",
    resolvedConflictName: "BeIVaultJsBackend",
  },
  tsGeometryCore: {
    moduleName: "@szewtwin/core-geometry",
    resolvedConflictName: "BeGeometryCore",
  },
  tsSzewecJsCore: {
    moduleName: "@szewtwin/core-szewec",
    resolvedConflictName: "BeSzewecJsCore",
  },
};

/**
 * @beta
 */
export class DMSchemaToTs {
  private _tsSzewecModuleNames: Set<string>;
  private _tsSzewecModuleResolvedConflictNames: Map<string, string>;
  private _schema?: Schema;
  private _schemaItemList: SchemaItem[];

  public constructor() {
    this._schema = undefined;
    this._schemaItemList = [];

    this._tsSzewecModuleNames = new Set<string>();
    this._tsSzewecModuleResolvedConflictNames = new Map<string, string>();
    for (const key in tsSzewecModules) {
      if (tsSzewecModules.hasOwnProperty(key)) {
        const moduleName: string = tsSzewecModules[key].moduleName;
        const resolvedPrefix: string = tsSzewecModules[key].resolvedConflictName;
        this._tsSzewecModuleNames.add(moduleName);
        this._tsSzewecModuleResolvedConflictNames.set(moduleName, resolvedPrefix);
      }
    }
  }

  private requireSchema(): Schema {
    if (undefined === this._schema)
      throw new Error("Schema must be set before conversion.");

    return this._schema;
  }

  /**
   * Given the schema, the function will converted it to typescript strings
   * @param schema The schema to be converted to typescript strings
   */
  public convertSchemaToTs(schema: Schema): { schemaTsString: string, elemTsString: string, propsTsString: string } {
    // convert schema to typescript String
    this._schema = schema;
    this.dependencyToFront();
    const schemaTsString = this.convertSchemaToTsClass();
    const elemTsString = this.convertElemToTsClasses();
    const propsTsString = this.convertPropsToTsInterfaces();

    return { schemaTsString, elemTsString, propsTsString };
  }

  /**
   * The function will push all the base classes to be the first ones in the schema item list.
   * For example, if class A extends base class B and base class C, B and C will be on the first of the list and then A at the end.
   * If B extends C, then B will be first and C will be next in the list and then A at the end.
   * If B and C does not depend on each other, the order of B and C will not be important.
   * The arrangement is to make sure that base class will be converted first and then, derived classes and so on
   */
  private dependencyToFront(): void {
    const uniqueItemName: Set<string> = new Set<string>();
    const schemaItemsList: SchemaItem[] = [];
    const schema = this.requireSchema();
    for (const schemaItem of schema.getItems()) {
      // base class to the item list first;
      switch (schemaItem.schemaItemType) {
        case SchemaItemType.StructClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.EntityClass:
          const dmClass = schemaItem as DMClass;
          const baseList = this.getAllBaseClasses(dmClass);
          for (let i = baseList.length - 1; i >= 0; --i) {
            const base = baseList[i];
            if (base.schema.schemaKey.compareByName(schema.schemaKey) && !uniqueItemName.has(base.name)) {
              schemaItemsList.push(baseList[i]);
              uniqueItemName.add(base.name);
            }
          }
          break;
        default:
          break;
      }

      if (!uniqueItemName.has(schemaItem.name)) {
        uniqueItemName.add(schemaItem.name);
        schemaItemsList.push(schemaItem);
      }
    }

    this._schemaItemList = schemaItemsList;
  }

  /**
   * The function converts the schema meta data to typescript Schema class
   */
  private convertSchemaToTsClass(): string {
    const schemaName = this.requireSchema().schemaKey.name;
    let outputString: string = "";

    // import modules
    outputString += "import { ClassRegistry, Schema, Schemas } from \"@szewtwin/core-backend\";\n";
    outputString += `import * as elementsModule from "./${schemaName}Elements";\n\n`;

    // create new schema class
    outputString += `export class ${schemaName} extends Schema {\n`;

    // schemaName() method
    outputString += `  public static get schemaName(): string { return "${schemaName}"; }\n\n`;

    // registerSchema method
    outputString += "  public static registerSchema() {\n";
    outputString += `    if (!Schemas.getRegisteredSchema(${schemaName}.name))\n`;
    outputString += `      Schemas.registerSchema(${schemaName});\n`;
    outputString += "  }\n\n";

    // constructor
    outputString += "  protected constructor() {\n";
    outputString += "    super();\n";
    outputString += `    ClassRegistry.registerModule(elementsModule, ${schemaName});\n`;
    outputString += "  }\n";

    outputString += "}\n\n";

    return outputString;
  }

  /**
   * The function converts the schema item to respective typescript classes
   */
  private convertElemToTsClasses(): string {
    const classNameToModule: Map<string, string> = new Map<string, string>();
    let classTs: string = "";
    for (const schemaItem of this._schemaItemList) {
      switch (schemaItem.schemaItemType) {
        case SchemaItemType.EntityClass:
          classTs += this.convertEntityToTs(schemaItem as EntityClass, classNameToModule);
          break;
        case SchemaItemType.Enumeration:
          classTs += this.convertEnumToTs(schemaItem as Enumeration);
          break;
        default:
          continue;
      }
    }

    let outputString: string = this.convertImportToTsImport(classNameToModule);
    outputString += `\n${classTs}`;
    return outputString;
  }

  /**
   * The function converts the schema item properties to respective typescript props interfaces
   */
  private convertPropsToTsInterfaces(): string {
    const classNameToModule: Map<string, string> = new Map<string, string>();
    let interfacesTs: string = "";
    for (const schemaItem of this._schemaItemList) {
      switch (schemaItem.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
          interfacesTs += this.convertDMClassPropsToTsInterface(schemaItem as (Mixin | StructClass | EntityClass), classNameToModule);
          break;
        default:
          continue;
      }
    }

    let outputString: string = this.convertImportToTsImport(classNameToModule);
    outputString += `\n${interfacesTs}`;
    return outputString;
  }

  /**
   * Convert mixin or struct class or entity class to respective typescript interface
   * @param dmClass Schema mixin or struct or entity to be converted typescript interface
   * @param classNameToModule Typescrip modules to be updated after the conversion
   */
  private convertDMClassPropsToTsInterface(dmClass: Mixin | StructClass | EntityClass, classNameToModule: Map<string, string>): string {
    let interfacesTs: string = "";

    // no interface props for BisCore Element
    if (dmClass.fullName === elementDMClassName)
      return interfacesTs;

    // only generate props interface for entity if the class has properties
    if (dmClass.schemaItemType === SchemaItemType.EntityClass && !dmClass.hasLocalProperties)
      return interfacesTs;

    // convert description to typescript comment only for mixin or struct
    if (dmClass.schemaItemType !== SchemaItemType.EntityClass && dmClass.description)
      interfacesTs += `${this.convertDescriptionToTsComment(dmClass.description)}\n`;

    // build interface for props in dmClass
    interfacesTs += `export interface ${dmClass.name}`;
    if (dmClass.schemaItemType === SchemaItemType.EntityClass)
      interfacesTs += "Props";

    // Extend it with base dmClass Props interface if there is any
    const baseClasses = this.getBaseClassWithProps(dmClass);
    if (baseClasses.length > 0) {
      interfacesTs += " extends ";

      let separator = "";
      for (const base of baseClasses) {
        interfacesTs += separator + this.addImportBasePropsClass(classNameToModule, base, dmClass);
        separator = ", ";
      }
    } else if (dmClass.schemaItemType === SchemaItemType.EntityClass)
      interfacesTs += ` extends ${this.addImportClass(classNameToModule, tsSzewecModules.tsIVaultJsCommon.moduleName, "EntityProps")}`;

    // build props for dmClass
    interfacesTs += " {";
    const propertiesTs = this.convertPropsToTsVars(dmClass, classNameToModule);
    for (const varDeclarationLine of propertiesTs)
      interfacesTs += `\n  ${varDeclarationLine}`;
    interfacesTs += "\n}\n\n";

    return interfacesTs;
  }

  /**
   * Convert schema enumeration to typescript enumeration
   * @param dmEnum Schema enumeration to be converted to typescript enumeration
   */
  private convertEnumToTs(dmEnum: Enumeration): string {
    let outputString: string = "";
    if (dmEnum.description)
      outputString += `${this.convertDescriptionToTsComment(dmEnum.description)}\n`;

    outputString += `export const enum ${dmEnum.name} {\n`;
    for (const dmEnumerator of dmEnum.enumerators) {
      outputString += `  ${dmEnumerator.label}`;
      if (dmEnum.isInt)
        outputString += ` = ${dmEnumerator.value}`;
      else if (dmEnum.isString)
        outputString += ` = "${dmEnumerator.value}"`;
      outputString += ",\n";
    }

    outputString += "}\n\n";
    return outputString;
  }

  /**
   * Convert schema entity to typescript entity class. The typescript class will implement respective props
   * typescript interface if the schema entity class has properties
   * @param dmClass Schema class to be converted to typescript class
   * @param classNameToModule Typescrip modules to be updated after the conversion
   */
  private convertEntityToTs(dmClass: EntityClass, classNameToModule: Map<string, string>): string {
    let outputString: string = "";
    if (dmClass.description)
      outputString += `${this.convertDescriptionToTsComment(dmClass.description)}\n`;

    let modifier: string = "";
    if (dmClass.modifier === DMClassModifier.Abstract)
      modifier = "abstract ";
    outputString += `export ${modifier}class ${dmClass.name} extends `;

    // extend base class if there is any. Default will be Entity class defined in @szewtwin/core-backend
    const base = dmClass.getBaseClassSync();
    if (base)
      outputString += this.addImportBaseClass(classNameToModule, base, dmClass);
    else
      outputString += this.addImportClass(classNameToModule, tsSzewecModules.tsIVaultJsBackend.moduleName, "Entity");

    // determine prop type to pass in the constructor
    let propsBaseTsType: string;
    const propsBase = this.getBaseClassWithProps(dmClass);
    if (dmClass.fullName !== elementDMClassName && dmClass.hasLocalProperties) {
      const moduleName: string = `${this.requireSchema().schemaKey.name}ElementProps`;
      propsBaseTsType = this.addImportClass(classNameToModule, moduleName, `${dmClass.name}Props`);
    } else if (propsBase.length > 0)
      propsBaseTsType = this.addImportBasePropsClass(classNameToModule, propsBase[0], dmClass);
    else
      propsBaseTsType = this.addImportClass(classNameToModule, tsSzewecModules.tsIVaultJsCommon.moduleName, "EntityProps");

    // implement the dmClass props if it has properties
    if (`${dmClass.name}Props` === propsBaseTsType)
      outputString += ` implements ${propsBaseTsType}`;

    // write constructor and className function for class
    const iVaultDbTsType: string = this.addImportClass(classNameToModule, tsSzewecModules.tsIVaultJsBackend.moduleName, "IVaultDb");

    outputString += " {\n";
    outputString += `  public static get className(): string { return "${dmClass.name}"; }\n\n`;
    outputString += `  public constructor (props: ${propsBaseTsType}, iVault: ${iVaultDbTsType}) {\n`;
    outputString += "    super(props, iVault);\n";
    outputString += "  }\n";
    outputString += "}\n\n";

    return outputString;
  }

  /**
   * Convert class properties to typescript member declaration
   * @param dmClass The schema class that has the properties to be converted to typescript member variables
   * @param classNameToModule Typescrip modules to be updated after the conversion
   */
  private convertPropsToTsVars(dmClass: DMClass, classNameToModule: Map<string, string>): string[] {
    if (!dmClass.hasLocalProperties)
      return [];

    const outputStrings: string[] = [];
    for (const dmProperty of dmClass.getPropertiesSync(true)) {
      // not generate ts variable declaration for property that has CustomHandledProperty ca
      if (dmProperty.customAttributes && dmProperty.customAttributes.has(customHandledPropertyCA))
        continue;

      let varDeclarationLine: string = `${this.lowerPropertyName(dmProperty.name)}?: `;
      if (dmProperty.isPrimitive()) {
        // determine Ts type of the primitive
        let typeTs: string = "";
        if (dmProperty.extendedTypeName)
          typeTs = this.convertExtendedTypeNameToTsType(dmProperty.extendedTypeName, classNameToModule);
        else if (dmProperty.isEnumeration()) {
          const dmEnumProperty = dmProperty as EnumerationProperty;
          const dmEnum = dmEnumProperty.enumeration;
          if (undefined === dmEnum)
            throw new Error(`Enumeration property ${dmProperty.fullName} is missing its enumeration.`);
          typeTs = this.addImportClass(classNameToModule, `${dmEnum.schemaKey.name}Elements`, dmEnum.name);
        } else {
          typeTs = this.convertPrimitiveTypeToTsType(dmProperty.primitiveType, classNameToModule);
        }

        varDeclarationLine += typeTs;
      } else if (dmProperty.isStruct()) {
        // import struct class if it is in different schema
        const structClass = dmProperty.structClass;
        if (!structClass.schema.schemaKey.compareByName(dmClass.schema.schemaKey))
          varDeclarationLine += this.addImportClass(classNameToModule, `${structClass.schema.schemaKey.name}ElementProps`, structClass.name);
        else
          varDeclarationLine += structClass.name;

      } else if (dmProperty.isNavigation())
        varDeclarationLine += this.addImportClass(classNameToModule, tsSzewecModules.tsIVaultJsCommon.moduleName, "RelatedElementProps");

      if (dmProperty.isArray())
        varDeclarationLine += "[]";
      varDeclarationLine += ";";

      outputStrings.push(varDeclarationLine);
    }

    return outputStrings;
  }

  /**
   * Convert schema extended type to typescript type
   * @param typeName Schema extended type to be converted to typescript type
   * @param classNameToModule Typescrip modules to be updated after the conversion
   */
  private convertExtendedTypeNameToTsType(typeName: string, classNameToModule: Map<string, string>): string {
    switch (typeName) {
      case "Json":
        return "any";
      case "BeGuid":
        return this.addImportClass(classNameToModule, tsSzewecModules.tsSzewecJsCore.moduleName, "GuidString");
      default:
        return "any";
    }
  }

  /**
   * Convert schema primitive type to typescript type
   * @param type Schema primitive type to be converted to typescript type
   * @param classNameToModule Typescrip modules to be updated after the conversion
   */
  private convertPrimitiveTypeToTsType(type: PrimitiveType, classNameToModule: Map<string, string>) {
    switch (type) {
      case PrimitiveType.Binary:
        return "any";
      case PrimitiveType.Boolean:
        return "boolean";
      case PrimitiveType.DateTime:
        return "Date";
      case PrimitiveType.Double:
        return "number";
      case PrimitiveType.Integer:
        return "number";
      case PrimitiveType.Long:
        // eslint-disable-next-line no-console
        console.log("Primitive type Long is not currently supported during conversion. It will be treated as type 'any'");
        return "any";
      case PrimitiveType.String:
        return "string";
      case PrimitiveType.Point2d:
        return this.addImportClass(classNameToModule, tsSzewecModules.tsGeometryCore.moduleName, "Point2d");
      case PrimitiveType.Point3d:
        return this.addImportClass(classNameToModule, tsSzewecModules.tsGeometryCore.moduleName, "Point3d");
      case PrimitiveType.IGeometry:
        // eslint-disable-next-line no-console
        console.log("Primitive type IGeometry is not currently supported during conversion. It will be treated as type 'any'");
        return "any";
      default:
        // eslint-disable-next-line no-console
        console.log("Unknown primitive type during conversion. It will be treated as type 'any'");
        return "any";
    }
  }

  /**
   * Convert schema description to typescript comment
   * @param description Schema description to be converted to typescript comment
   */
  private convertDescriptionToTsComment(description: string) {
    let outputString: string = "/**\n";

    let wordCount: number = 0;
    let begin: number = 0;
    let spaceBegin: number = 0;
    let spaceIdx: number = description.indexOf(" ", spaceBegin);
    while (spaceIdx !== -1) {
      // new line for every 20 words
      ++wordCount;
      if (wordCount === 20) {
        wordCount = 0;
        outputString += ` * ${description.substring(begin, spaceIdx)}\n`;
        begin = spaceIdx + 1;
      }

      spaceBegin = spaceIdx + 1;
      while (description[spaceBegin] === " ")
        ++spaceBegin;

      spaceIdx = description.indexOf(" ", spaceBegin);
    }

    // append the last word
    outputString += ` * ${description.substring(begin)}\n`;

    outputString += " */";
    return outputString;
  }

  /**
   * Convert all modules needed for the converted schema types to typescript import statements
   * @param classNameToModule Modules to be converted to typescript imports statement
   */
  private convertImportToTsImport(classNameToModule: Map<string, string>): string {
    const moduleToTsTypes: Map<string, Set<string>> = new Map<string, Set<string>>();
    classNameToModule.forEach((moduleNames: string, className: string) => {
      if (!moduleToTsTypes.has(moduleNames))
        moduleToTsTypes.set(moduleNames, new Set<string>());

      const classNames = moduleToTsTypes.get(moduleNames);
      if (undefined === classNames)
        throw new Error(`Unable to create import list for module ${moduleNames}.`);

      classNames.add(className);
    });

    let outputString: string = "";
    moduleToTsTypes.forEach((classNames: Set<string>, moduleName: string) => {
      if (!this._tsSzewecModuleNames.has(moduleName))
        moduleName = `./${moduleName}`;

      outputString += "import { ";
      let separator = "";
      for (const className of classNames) {
        outputString += separator + className;
        separator = ", ";
      }
      outputString += ` } from "${moduleName}";\n`;
    });

    return outputString;
  }

  /**
   * Traverse the inheritance tree to retrieve first base classes that have properties
   * @param dmClass Schema class to be traverse
   */
  private getBaseClassWithProps(dmClass: DMClass): DMClass[] {
    const res: DMClass[] = [];
    const visited: Set<string> = new Set<string>();
    visited.add(dmClass.fullName);
    this.traverseBaseClass(dmClass, visited, (base: DMClass) => {
      if (base.hasLocalProperties) {
        res.push(base);
        return false;
      }

      return true;
    });

    return res;
  }

  /**
   * Traverse the inheritance tree to retrieve base classes of a schema class
   * @param dmClass Schema class to be traverse
   */
  private getAllBaseClasses(dmClass: DMClass): DMClass[] {
    const res: DMClass[] = [];
    const visited: Set<string> = new Set<string>();
    visited.add(dmClass.fullName);
    this.traverseBaseClass(dmClass, visited, (base: DMClass) => {
      res.push(base);
      return true;
    });

    return res;
  }

  /**
   * Traverse the inheritance tree horizontally and vertically of a schema class
   * @param dmClass Schema class to be traverse
   * @param visited Set of classes that are already visited
   * @param shouldTraverseDown Lambda to determine if it should traverse more vertically
   */
  private traverseBaseClass(dmClass: DMClass, visited: Set<string>, shouldTraverseDown: (base: DMClass) => boolean): void {
    const base = dmClass.getBaseClassSync();
    if (base === undefined || visited.has(base.fullName))
      return;

    const baseList: DMClass[] = [base];
    if (dmClass.schemaItemType === SchemaItemType.EntityClass) {
      const entity = dmClass as EntityClass;
      for (const mixin of entity.getMixinsSync())
        baseList.push(mixin);
    }

    for (const eachBase of baseList) {
      visited.add(eachBase.fullName);
      if (shouldTraverseDown(eachBase))
        this.traverseBaseClass(eachBase, visited, shouldTraverseDown);
    }
  }

  /**
   * Add required typescript class that is to be imported from a required module during Schema conversion to typescript. If there is naming conflict
   * it will resolve it by appending prefix name with class name, for example: import { element as BisCoreElement } from "BisCoreElement";
   * @param classNameToModule Typescript modules that is needed for the conversion. It maps typescript class with the required modules
   * @param refModule Typescript module that the typescrip class comes from
   * @param className Required Typescript class for the conversion
   */
  private addImportClass(classNameToModule: Map<string, string>, refModule: string, className: string): string {
    if (!classNameToModule.has(className)) {
      classNameToModule.set(className, refModule);
      return className;
    }

    if (classNameToModule.get(className) === refModule)
      return className;

    let resolvedPrefix: string = refModule;
    const resolvedConflictName = this._tsSzewecModuleResolvedConflictNames.get(refModule);
    if (undefined !== resolvedConflictName)
      resolvedPrefix = resolvedConflictName;

    const renameClassName = `${className} as ${resolvedPrefix}${className}`;
    if (!classNameToModule.has(renameClassName)) {
      classNameToModule.set(renameClassName, refModule);
    }

    return resolvedPrefix + className;
  }

  /**
   * Add appropriate typescript props interface to the classNameToModule and return the corresponding typescript base props interface
   * @param classNameToModule Typescript modules that is needed for the conversion. It maps typescript class with the required modules
   * @param baseDMClass Base class of dmClass that has properties. Its name will be used to derived typescript base props interface
   * @param dmClass DMClass to be converted to Typescript
   */
  private addImportBasePropsClass(classNameToModule: Map<string, string>, baseDMClass: DMClass, dmClass: DMClass): string {
    let baseName: string = baseDMClass.name;
    if (baseDMClass.schemaItemType === SchemaItemType.EntityClass)
      baseName += "Props";

    // find external module to import
    let externalModule: string = "";
    const shouldImportJsCommon = (baseDMClass.fullName === elementDMClassName) ||
      (baseDMClass.schema.schemaKey.name === "BisCore" && dmClass.schema.schemaKey.name !== "BisCore");
    if (shouldImportJsCommon)
      externalModule = tsSzewecModules.tsIVaultJsCommon.moduleName;
    else if (!baseDMClass.schema.schemaKey.compareByName(dmClass.schema.schemaKey))
      externalModule = `${baseDMClass.schema.schemaKey.name}ElementProps`;

    if (externalModule.length !== 0)
      baseName = this.addImportClass(classNameToModule, externalModule, baseName);

    return baseName;
  }

  /**
   * Add appropriate typescript base class to the classNameToModule and return the corresponding typescript base class
   * @param classNameToModule Typescript modules that is needed for the conversion. It maps typescript class with the required modules
   * @param baseDMClass Base class of dmClass
   * @param dmClass DMClass to be converted to Typescript
   */
  private addImportBaseClass(classNameToModule: Map<string, string>, baseDMClass: DMClass, dmClass: DMClass): string {
    let baseName: string = baseDMClass.name;

    // find external module to import for base class
    let externalModule: string = "";
    if (baseDMClass.schema.schemaKey.name === "BisCore" && dmClass.schema.schemaKey.name !== "BisCore")
      externalModule = tsSzewecModules.tsIVaultJsBackend.moduleName;
    else if (!baseDMClass.schema.schemaKey.compareByName(dmClass.schema.schemaKey))
      externalModule = `${baseDMClass.schema.schemaKey.name}Elements`;

    if (externalModule.length !== 0)
      baseName = this.addImportClass(classNameToModule, externalModule, baseName);

    return baseName;
  }

  /**
   * Lower the first character of the property name
   * @param propName Property name
   */
  private lowerPropertyName(propName: string): string {
    return propName.charAt(0).toLowerCase() + propName.slice(1);
  }
}
