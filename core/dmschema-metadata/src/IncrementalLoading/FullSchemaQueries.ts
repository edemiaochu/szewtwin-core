/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { SchemaItemQueries } from "./SchemaItemQueries";
import { modifier, strength, strengthDirection } from "./SchemaStubQueries";

/**
 * Queries that return full Schema JSON data are found here. Shared SELECTS and
 * WITH clauses are broken down into individual variables.
 */

const propertyType = (alias: string) => {
  return `
    CASE
      WHEN [${alias}].[Kind] = 0 THEN 'PrimitiveProperty'
      WHEN [${alias}].[Kind] = 1 THEN 'StructProperty'
      WHEN [${alias}].[Kind] = 2 THEN 'PrimitiveArrayProperty'
      WHEN [${alias}].[Kind] = 3 THEN 'StructArrayProperty'
      WHEN [${alias}].[Kind] = 4 THEN 'NavigationProperty'
      ELSE NULL
    END
  `;
};

const navigationDirection = (alias: string) => {
  return `
    CASE
      WHEN [${alias}].[NavigationDirection] = 1 THEN 'Forward'
      WHEN [${alias}].[NavigationDirection] = 2 THEN 'Backward'
      ELSE NULL
    END
  `;
};

const schemaCustomAttribute = (alias: string) => {
  return `
    SELECT
      json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
      FROM [meta].[CustomAttribute] [ca]
    WHERE [ca].[ContainerId] = [${alias}].[DMInstanceId] AND [ca].[ContainerType] = 1
    ORDER BY [ca].[Ordinal]
  `;
};

/**
 * Selects customAttribute data for each class type.
 */
const classCustomAttribute = (alias: string) => {
  return `
    SELECT
      json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
    FROM [meta].[CustomAttribute] [ca]
    WHERE [ca].[ContainerId] = [${alias}].[DMInstanceId] AND [ca].[ContainerType] = 30
    ORDER BY [ca].[Ordinal]
  `;
};

const propertyCustomAttribute = (alias: string) => {
  return `
    SELECT
      json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
    FROM [meta].[CustomAttribute] [ca]
    WHERE [ca].[ContainerId] = [${alias}].[DMInstanceId] AND [ca].[ContainerType] = 992
    ORDER BY [ca].[Ordinal]
  `;
};


/**
 * Selects base class data for each class type.
 */
const selectBaseClasses = `
  SELECT
    dm_classname([baseClass].[DMInstanceId], 's.c')
  FROM
    [meta].[DMClassDef] [baseClass]
  INNER JOIN [meta].[ClassHasBaseClasses] [baseClassMap]
    ON [baseClassMap].[TargetDMInstanceId] = [baseClass].[DMInstanceId]
  WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
  ORDER BY [baseClassMap].[Ordinal] ASC
  LIMIT 1
`;

/**
 * Selects class property data for each class type. ClassProperties
 * is a common table expression (CTE or WITH clause) defined below.
 */
const selectProperties = `
  SELECT
    json_group_array(json([classProperties].[property]))
  FROM
    [ClassProperties] [classProperties]
  WHERE
    [classProperties].[ClassId] = [class].[DMInstanceId]
`;

/**
 * A CTE used to select AppliesTo from IsMixin CustomAttributes for a given Mixin.
 */
const withAppliesTo = `
  AppliesToCTE AS (
    SELECT
      [mixinAppliesTo].[DMInstanceId] AS [AppliesToId],
      [appliesToSchema].[name] as [AppliesToSchema],
      json_extract(XmlCAToJson([ca].[Class].[Id], [ca].[Instance]), '$.IsMixin.AppliesToEntityClass') AS [AppliesTo]
    FROM [meta].[CustomAttribute] [ca]
    JOIN [meta].[DMClassDef] [mixinAppliesTo]
      ON [mixinAppliesTo].[DMInstanceId] = [ca].[ContainerId]
    JOIN [meta].[DMSchemaDef] [appliesToSchema]
      ON [appliesToSchema].[DMInstanceId] = [mixinAppliesTo].[Schema].[Id]
    WHERE [ca].[ContainerType] = 30
      AND json_extract(XmlCAToJson([ca].[Class].[Id], [ca].[Instance]), '$.dmClass') = 'IsMixin'
  )
`;

/**
 * A CTE used to select Schema reference data for a given Schema.
 */
const withSchemaReferences = `
SchemaReferences as (
  SELECT
    [ref].[SourceDMInstanceId] as [SchemaId],
    json_object(
      'name', [Name],
      'version', CONCAT(printf('%02d', [VersionMajor]), '.', printf('%02d', [VersionWrite]), '.', printf('%02d', [VersionMinor]))
    ) as [reference]
  FROM
    [meta].[DMSchemaDef] as [refSchema]
  INNER JOIN [meta].[SchemaHasSchemaReferences] [ref]
    ON [ref].[TargetDMInstanceId] = [refSchema].[DMInstanceId]
)
`;

/**
 * A CTE used to select Relationship constraints for a given RelationshipClass.
 */
const withRelationshipConstraints = `
ClassRelationshipConstraints as (
  SELECT
    [rhc].[SourceDMInstanceId] as [ClassId],
    [constraintDef].[DMInstanceId] as [ConstraintId],
    [RelationshipEnd],
    CONCAT('(', [MultiplicityLowerLimit], '..', IIF([MultiplicityUpperLimit] IS NULL, '*', [MultiplicityUpperLimit]), ')') as [Multiplicity],
    [IsPolyMorphic],
    [RoleLabel],
    IIF([constraintDef].[AbstractConstraintClass] IS NOT NULL, dm_classname([constraintDef].[AbstractConstraintClass].[Id], 's.c'), null) as [AbstractConstraint],
    IIF ([rchc].[TargetDMInstanceId] IS NOT NULL, JSON_GROUP_ARRAY(dm_classname([rchc].[TargetDMInstanceId], 's.c')), null) as [ConstraintClasses]
  FROM
    [meta].[DMRelationshipConstraintDef] [constraintDef]
  JOIN [meta].[RelationshipHasConstraints] [rhc]
    ON [rhc].[TargetDMInstanceId] = [constraintDef].[DMInstanceId]
  JOIN [meta].[RelationshipConstraintHasClasses] [rchc]
    ON [rchc].[SourceDMInstanceId] = [constraintDef].[DMInstanceId]
  GROUP BY [constraintDef].[DMInstanceId]
)
`;

/**
 * A CTE used to select Class property data for a given Class.
 */
const withClassProperties = `
ClassProperties as (
SELECT
  [cop].[SourceDMInstanceId] as [ClassId],
  json_object(
    'name', [pd].[Name],
    'label', [pd].[DisplayLabel],
    'description', [pd].[Description],
    'isReadOnly', IIF([pd].[IsReadOnly] = 1, json('true'), NULL),
    'priority', [pd].[Priority],
    'category', IIF([categoryDef].[Name] IS NULL, NULL, CONCAT([categorySchemaDef].[Name], '.', [categoryDef].[Name])),
    'kindOfQuantity', IIF([koqDef].[Name] IS NULL, NULL, CONCAT([koqSchemaDef].[Name], '.', [koqDef].[Name])),
    'typeName',
      CASE
        WHEN [pd].[Kind] = 0 OR [pd].[Kind] = 2 Then
          CASE
            WHEN [enumDef].[Name] IS NOT NULL Then CONCAT([enumSchemaDef].[Name], '.', [enumDef].[Name])
            WHEN [pd].[PrimitiveType] = 257 Then 'binary'
            WHEN [pd].[PrimitiveType] = 513 Then 'boolean'
            WHEN [pd].[PrimitiveType] = 769 Then 'dateTime'
            WHEN [pd].[PrimitiveType] = 1025 Then 'double'
            WHEN [pd].[PrimitiveType] = 1281 Then 'int'
            WHEN [pd].[PrimitiveType] = 1537 Then 'long'
            WHEN [pd].[PrimitiveType] = 1793 Then 'point2d'
            WHEN [pd].[PrimitiveType] = 2049 Then 'point3d'
            WHEN [pd].[PrimitiveType] = 2305 Then 'string'
            WHEN [pd].[PrimitiveType] = 2561 Then 'Szewec.Geometry.Common.IGeometry'
            ELSE null
          END
        WHEN [pd].[Kind] = 1 OR [pd].[Kind] = 3 Then
          CONCAT([structSchemaDef].[Name], '.', [structDef].[Name])
        ELSE null
      END,
    'type', ${propertyType("pd")},
    'minLength', [pd].[PrimitiveTypeMinLength],
    'maxLength', [pd].[PrimitiveTypeMaxLength],
    'minValue', [pd].[PrimitiveTypeMinValue],
    'maxValue', [pd].[PrimitiveTypeMaxValue],
    'extendedTypeName', [pd].[ExtendedTypeName],
    'minOccurs', [pd].[ArrayMinOccurs],
    'maxOccurs', [pd].[ArrayMaxOccurs],
    'direction', ${navigationDirection("pd")},
    'relationshipName', IIF([navRelDef].[Name] IS NULL, NULL, CONCAT([navSchemaDef].[Name], '.', [navRelDef].[Name])),
    'customAttributes', (${propertyCustomAttribute("pd")})
  ) as [property]
FROM
  [meta].[DMPropertyDef] as [pd]
JOIN [meta].[ClassOwnsLocalProperties] [cop]
  ON cop.[TargetDMInstanceId] = [pd].[DMInstanceId]
LEFT JOIN [meta].[DMEnumerationDef] [enumDef]
  ON [enumDef].[DMInstanceId] = [pd].[Enumeration].[Id]
LEFT JOIN [meta].[DMSchemaDef] enumSchemaDef
  ON [enumSchemaDef].[DMInstanceId] = [enumDef].[Schema].[Id]
LEFT JOIN [meta].[PropertyCategoryDef] [categoryDef]
  ON [categoryDef].[DMInstanceId] = [pd].[Category].[Id]
LEFT JOIN [meta].[DMSchemaDef] [categorySchemaDef]
  ON [categorySchemaDef].[DMInstanceId] = [categoryDef].[Schema].[Id]
LEFT JOIN [meta].[KindOfQuantityDef] [koqDef]
  ON [koqDef].[DMInstanceId] = [pd].[KindOfQuantity].[Id]
LEFT JOIN [meta].[DMSchemaDef] [koqSchemaDef]
  ON [koqSchemaDef].[DMInstanceId] = [koqDef].[Schema].[Id]
LEFT JOIN [meta].[DMClassDef] [structDef]
  ON structDef.[DMInstanceId] = [pd].[StructClass].[Id]
LEFT JOIN [meta].[DMSchemaDef] [structSchemaDef]
  ON [structSchemaDef].[DMInstanceId] = [structDef].[Schema].[Id]
LEFT JOIN [meta].[DMClassDef] [navRelDef]
  ON [navRelDef].[DMInstanceId] = [pd].[NavigationRelationshipClass].[Id]
LEFT JOIN [meta].[DMSchemaDef] [navSchemaDef]
  ON [navSchemaDef].[DMInstanceId] = [navRelDef].[Schema].[Id]
)
`;

/**
 * Query that provides EntityClass data and is shared by two cases:
 * 1. A single query to return a full schema.
 * 2. When querying a full schema with multiple schema item queries or
 *    when just querying for Entity classes.
 */
const baseEntityQuery = `
  SELECT
    [sd].[Name] as [schema],
    json_object (
      'schemaItemType', 'EntityClass',
      'name', [class].[Name],
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'modifier', ${modifier("class")},
      'baseClass', (
        ${selectBaseClasses}
      ),
      'mixins', (
        SELECT
          json_group_array(
            dm_classname([baseClass].[DMInstanceId], 's.c')
          )
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseClass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
          AND EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [baseClass].[DMInstanceId] = [ca].[Class].[Id]
          AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
      ),
      'customAttributes', (${classCustomAttribute("class")}),
      'properties', (
        ${selectProperties}
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  JOIN
    [meta].[DMSchemaDef] [sd] ON [sd].[DMInstanceId] = [class].[Schema].[Id]
  WHERE [class].[Type] = 0 AND
    [sd].[Name] = :schemaName
    AND NOT EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [class].[DMInstanceId] = [ca].[Class].[Id]
    AND [ca].[CustomAttributeClass].Id Is ([CoreCA].[IsMixin]))
 `;

/**
 * EntityClass query used to when querying for EntityClass data only. Not used
 * for full Schema load via single query.
 */
const entityQuery = `
  WITH
    ${withClassProperties}
  ${baseEntityQuery}
 `

/**
 * Query that provides Mixin data and is shared by two cases:
 * 1. A single query to return a full schema.
 * 2. When querying a full schema with multiple schema item queries or
 *    when just querying for Mixin classes.
 */
const baseMixinQuery = `
  SELECT
    [sd].[Name] as [schema],
    json_object (
      'schemaItemType', 'Mixin',
      'name', [class].[Name],
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'modifier', ${modifier("class")},
      'baseClass', (
        ${selectBaseClasses}
      ),
      'appliesTo', (
        SELECT IIF(instr([atCTE].[AppliesTo], ':') > 1, dm_classname(dm_classId([atCTE].[AppliesTo]), 's.c'), CONCAT([atCTE].[AppliesToSchema], '.', [atCTE].[AppliesTo]))
        FROM [AppliesToCTE] [atCTE]
        WHERE [atCTE].[AppliesToId] = [class].[DMInstanceId]
      ),
      'customAttributes', (
        SELECT
          json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
        FROM [meta].[CustomAttribute] [ca]
        WHERE [ca].[ContainerId] = [class].[DMInstanceId] AND [ca].[ContainerType] = 30
          AND json_extract(XmlCAToJson([ca].[Class].[Id], [ca].[Instance]), '$.dmClass') <> 'IsMixin'
      ),
      'properties', (
        SELECT
          json_group_array(json([classProperties].[property]))
        FROM
          [ClassProperties] [classProperties]
        WHERE
          [classProperties].[ClassId] = [class].[DMInstanceId]
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  JOIN
    [meta].[DMSchemaDef] [sd] ON [sd].[DMInstanceId] = [class].[Schema].[Id]
  WHERE [class].[Type] = 0 AND
    [sd].[Name] = :schemaName
    AND EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [class].[DMInstanceId] = [ca].[Class].[Id]
    AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
 `;

/**
* Mixin query used to when querying for Mixin data only. Not used
* for full Schema load via single query.
*/
const mixinQuery = `
 WITH
  ${withAppliesTo},
  ${withClassProperties}
${baseMixinQuery}
`

/**
 * Query that provides RelationshipClass data and is shared by two cases:
 * 1. A single query to return a full schema.
 * 2. When querying a full schema with multiple schema item queries or
 *    when just querying for Relationship classes.
 */
const baseRelationshipClassQuery = `
  SELECT
    [sd].Name as schema,
    json_object (
      'schemaItemType', 'RelationshipClass',
      'name', [class].[Name],
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'strength', ${strength("class")},
      'strengthDirection', ${strengthDirection("class")},
      'modifier', ${modifier("class")},
      'baseClass', (
        ${selectBaseClasses}
      ),
      'customAttributes', (${classCustomAttribute("class")}),
      'properties', (
        ${selectProperties}
      ),
      'source', (
        SELECT
          json_object (
            'multiplicity', [sourceConst].[Multiplicity],
            'roleLabel', [sourceConst].[RoleLabel],
            'polymorphic', IIF([sourceConst].[IsPolyMorphic] = 1, json('true'), json('false')),
            'abstractConstraint', [sourceConst].[AbstractConstraint],
            'constraintClasses', json([sourceConst].[ConstraintClasses]),
            'customAttributes', (
              SELECT
                json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
              FROM [meta].[CustomAttribute] [ca]
              WHERE [ca].[ContainerId] = [sourceConst].[ConstraintId] AND [ca].[ContainerType] = 1024
              ORDER BY [ca].[Ordinal]
            )
          )
        FROM
          [ClassRelationshipConstraints] [sourceConst]
        WHERE [sourceConst].[relationshipEnd] = 0
          AND [sourceConst].[ClassId] = [class].[DMInstanceId]
      ),
      'target', (
        SELECT
          json_object (
            'multiplicity', [targetConst].[Multiplicity],
            'roleLabel', [targetConst].[RoleLabel],
            'polymorphic', IIF([targetConst].[IsPolyMorphic] = 1, json('true'), json('false')),
            'abstractConstraint', [targetConst].[AbstractConstraint],
            'constraintClasses', json([targetConst].[ConstraintClasses]),
            'customAttributes', (
              SELECT
                json_group_array(json(XmlCAToJson([ca].[Class].[Id], [ca].[Instance])))
              FROM [meta].[CustomAttribute] [ca]
              WHERE [ca].[ContainerId] = [targetConst].[ConstraintId] AND [ca].[ContainerType] = 2048
              ORDER BY [ca].[Ordinal]
            )
          )
        FROM
            [ClassRelationshipConstraints] [targetConst]
        WHERE [targetConst].[relationshipEnd] = 1
            AND [targetConst].[ClassId] = [class].[DMInstanceId]
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  JOIN
    [meta].[DMSchemaDef] [sd] ON [sd].[DMInstanceId] = [class].[Schema].[Id]
  WHERE [class].[Type] = 1 AND
    [sd].[Name] = :schemaName
 `;

/**
* RelationshipClass query used to when querying for RelationshipClass data only. Not used
* for full Schema load via single query.
*/
const relationshipClassQuery = `
 WITH
  ${withClassProperties},
  ${withRelationshipConstraints}
${baseRelationshipClassQuery}
`

/**
 * Query that provides StructClass data and is shared by two cases:
 * 1. A single query to return a full schema.
 * 2. When querying a full schema with multiple schema item queries or
 *    when just querying for Struct classes.
 */
const baseStructQuery = `
  SELECT
    [sd].Name as schema,
    json_object (
      'schemaItemType', 'StructClass',
      'name', [class].[Name],
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'modifier', ${modifier("class")},
      'baseClass', (
        ${selectBaseClasses}
      ),
      'customAttributes', (${classCustomAttribute("class")}),
      'properties', (
        ${selectProperties}
      )
    ) AS item
  FROM [meta].[DMClassDef] [class]
  JOIN
    [meta].[DMSchemaDef] [sd] ON [sd].[DMInstanceId] = [class].[Schema].[Id]
  WHERE [class].[Type] = 2 AND
    [sd].[Name] = :schemaName
 `;

/**
 * StructClass query used to when querying for StructClass data only. Not used
 * for full Schema load via single query.
 */
const structQuery = `
 WITH
  ${withClassProperties}
${baseStructQuery}
`

/**
 * Query that provides CustomAttributeClass data and is shared by two cases:
 * 1. A single query to return a full schema.
 * 2. When querying a full schema with multiple schema item queries or
 *    when just querying for CustomAttribute classes.
 */
const baseCustomAttributeQuery = `
  SELECT
    [sd].Name as schema,
    json_object (
      'schemaItemType', 'CustomAttributeClass',
      'name', [class].[Name],
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'appliesTo', [class].[CustomAttributeContainerType],
      'modifier', ${modifier("class")},
      'baseClass', (
        ${selectBaseClasses}
      ),
      'customAttributes', (${classCustomAttribute("class")}),
      'properties', (
        ${selectProperties}
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  JOIN
    [meta].[DMSchemaDef] sd ON [sd].[DMInstanceId] = [class].[Schema].[Id]
  WHERE [class].[Type] = 3 AND
    [sd].[Name] = :schemaName
 `;

/**
 * CustomAttributeClass query used to when querying for CustomAttributeClass data only. Not used
 * for full Schema load via single query.
 */
const customAttributeQuery = `
WITH
  ${withClassProperties}
${baseCustomAttributeQuery}
`

/**
 * Used by full schema load query via single query. Allows
 * all SchemaItemTypes to be queried at once.
 */
const withSchemaItems = `
SchemaItems AS (
  ${baseEntityQuery}
  UNION ALL
  ${baseRelationshipClassQuery}
  UNION ALL
  ${baseStructQuery}
  UNION ALL
  ${baseMixinQuery}
  UNION ALL
  ${baseCustomAttributeQuery}
  UNION ALL
  ${SchemaItemQueries.kindOfQuantity(true)}
  UNION ALL
  ${SchemaItemQueries.enumeration(true)}
  UNION ALL
  ${SchemaItemQueries.propertyCategory(true)}
  UNION ALL
  ${SchemaItemQueries.unit(true)}
  UNION ALL
  ${SchemaItemQueries.invertedUnit(true)}
  UNION ALL
  ${SchemaItemQueries.unitSystem(true)}
  UNION ALL
  ${SchemaItemQueries.constant(true)}
  UNION ALL
  ${SchemaItemQueries.phenomenon(true)}
  UNION ALL
  ${SchemaItemQueries.format(true)}
)
`;

/**
 * Query for Schema data without SchemaItems
 */
const schemaNoItemsQuery = `
WITH
  ${withSchemaReferences}
SELECT
  json_object (
    'name', [schemaDef].[Name],
    'version', CONCAT(printf('%02d', [VersionMajor]), '.', printf('%02d', [VersionWrite]), '.', printf('%02d', [VersionMinor])),
    'alias', [schemaDef].[Alias],
    'label', [schemaDef].[DisplayLabel],
    'description', [schemaDef].[Description],
    'dmSpecMajorVersion', [schemaDef].[OriginalDMXmlVersionMajor],
    'dmSpecMinorVersion', [schemaDef].[OriginalDMXmlVersionMinor],
    'customAttributes', (${schemaCustomAttribute("schemaDef")}),
    'references', (
      SELECT
        json_group_array(json([schemaReferences].[reference]))
      FROM
        [SchemaReferences] [schemaReferences]
      WHERE
        [schemaReferences].[SchemaId] = [schemaDef].[DMInstanceId]
    )
  ) as [schema]
FROM
  [meta].[DMSchemaDef] [schemaDef] WHERE [Name] = :schemaName
`;

/**
 * Query to load a full Schema via a single query.
 */
const schemaQuery = `
WITH
  ${withAppliesTo},
  ${withSchemaReferences},
  ${withClassProperties},
  ${withRelationshipConstraints},
  ${withSchemaItems}
SELECT
  json_object (
    'name', [schemaDef].[Name],
    'version', CONCAT(printf('%02d', [VersionMajor]), '.', printf('%02d', [VersionWrite]), '.', printf('%02d', [VersionMinor])),
    'alias', [schemaDef].[Alias],
    'label', [schemaDef].[DisplayLabel],
    'description', [schemaDef].[Description],
    'dmSpecMajorVersion', [schemaDef].[OriginalDMXmlVersionMajor],
    'dmSpecMinorVersion', [schemaDef].[OriginalDMXmlVersionMinor],
    'customAttributes', (${schemaCustomAttribute("schemaDef")}),
    'references', (
      SELECT
        json_group_array(json([schemaReferences].[reference]))
      FROM
        [SchemaReferences] [schemaReferences]
      WHERE
        [schemaReferences].[SchemaId] = [schemaDef].[DMInstanceId]
    ),
    'items', (
      SELECT
        json_group_array(json(json_object(
          'item', json([items].[item])
        )))
      FROM
        [SchemaItems] [items]
    )
) as [schema]
FROM
  [meta].[DMSchemaDef] [schemaDef] WHERE [Name] = :schemaName
`;

/**
 * Queries for loading full Schema JSON.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FullSchemaQueries = {
  schemaQuery,
  schemaNoItemsQuery,
  entityQuery,
  relationshipClassQuery,
  mixinQuery,
  structQuery,
  customAttributeQuery
};
