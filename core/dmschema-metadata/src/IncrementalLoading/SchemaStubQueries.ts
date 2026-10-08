/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { SchemaItemQueries } from "./SchemaItemQueries";

export const modifier = (alias: string) => {
  return `
    CASE
      WHEN [${alias}].[modifier] = 0 THEN 'None'
      WHEN [${alias}].[modifier] = 1 THEN 'Abstract'
      WHEN [${alias}].[modifier] = 2 THEN 'Sealed'
      ELSE NULL
    END
  `;
};

export const strength = (alias: string) => {
  return `
    CASE
      WHEN [${alias}].[RelationshipStrength] = 0 THEN 'Referencing'
      WHEN [${alias}].[RelationshipStrength] = 1 THEN 'Holding'
      WHEN [${alias}].[RelationshipStrength] = 2 THEN 'Embedding'
      ELSE NULL
    END
  `;
};

export const strengthDirection = (alias: string) => {
  return `
    CASE
      WHEN [${alias}].[RelationshipStrengthDirection] = 1 THEN 'Forward'
      WHEN [${alias}].[RelationshipStrengthDirection] = 2 THEN 'Backward'
      ELSE NULL
    END
  `;
};

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

const withSchemaReferences = `
  SchemaReferences AS (
    SELECT
      [ref].[SourceDMInstanceId] AS [SchemaId],
      CONCAT([Name],'.',[VersionMajor],'.',[VersionWrite],'.',[VersionMinor]) AS [fullName]
    FROM
      [meta].[DMSchemaDef] AS [refSchema]
    INNER JOIN [meta].[SchemaHasSchemaReferences] [ref]
      ON [ref].[TargetDMInstanceId] = [refSchema].[DMInstanceId]
  )
`;

const customAttributeQuery = `
  SELECT
    [Schema].[Id] AS [SchemaId],
    json_object(
      'name', [class].[Name],
      'schemaItemType', 'CustomAttributeClass',
      'modifier', ${modifier("class")},
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'appliesTo', [class].[CustomAttributeContainerType],
      'baseClasses', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'CustomAttributeClass',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description],
            'appliesTo', [baseClass].[CustomAttributeContainerType]
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasAllBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  WHERE [class].[Type] = 3
`;

const structQuery = `
  SELECT
    [Schema].[Id] AS [SchemaId],
    json_object(
      'name', [class].[Name],
      'schemaItemType', 'StructClass',
      'modifier', ${modifier("class")},
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'baseClasses', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'StructClass',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description]
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasAllBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  WHERE [class].[Type] = 2
`;

const relationshipQuery = `
  SELECT
    [Schema].[Id] AS [SchemaId],
    json_object(
      'name', [class].[Name],
      'schemaItemType', 'RelationshipClass',
      'modifier', ${modifier("class")},
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'strength', ${strength("class")},
      'strengthDirection', ${strengthDirection("class")},
      'baseClasses', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'RelationshipClass',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description],
            'strength', ${strength("baseClass")},
            'strengthDirection', ${strengthDirection("baseClass")}
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasAllBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
      )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  WHERE [class].[Type] = 1
`;

const entityQuery = `
  SELECT
    [Schema].[Id] AS [SchemaId],
    json_object(
      'name', [class].[Name],
      'schemaItemType', 'EntityClass',
      'modifier', ${modifier("class")},
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'baseClasses', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'EntityClass',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description]
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasAllBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
          AND NOT EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [baseClass].[DMInstanceId] = [ca].[Class].[Id]
            AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
        ),
      'mixins', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'Mixin',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description],
            'appliesTo', (
              SELECT IIF(instr([atCTE].[AppliesTo], ':') > 1, dm_classname(dm_classId([atCTE].[AppliesTo]), 's.c'), CONCAT([atCTE].[AppliesToSchema], '.', [atCTE].[AppliesTo]))
              FROM [AppliesToCTE] [atCTE]
              WHERE [atCTE].[AppliesToId] = [baseClass].[DMInstanceId]
            ),
            'baseClasses', (
              SELECT
                json_group_array(json(json_object(
                  'schema', dm_classname([mixinBaseClass].[DMInstanceId], 's'),
                  'name', [mixinBaseClass].[Name],
                  'schemaItemType', 'Mixin',
                  'modifier', ${modifier("mixinBaseClass")},
                  'label', [mixinBaseClass].[DisplayLabel],
                  'description', [mixinBaseClass].[Description],
                  'appliesTo', (
                    SELECT IIF(instr([atCTE].[AppliesTo], ':') > 1, dm_classname(dm_classId([atCTE].[AppliesTo]), 's.c'), CONCAT([atCTE].[AppliesToSchema], '.', [atCTE].[AppliesTo]))
                    FROM [AppliesToCTE] [atCTE]
                    WHERE [atCTE].[AppliesToId] = [mixinBaseClass].[DMInstanceId]
                  )
                )))
              FROM
                [meta].[DMClassDef] [mixinBaseClass]
              INNER JOIN [meta].[ClassHasAllBaseClasses] [mixinBaseClassMap]
                ON [mixinBaseClassMap].[TargetDMInstanceId] = [mixinBaseClass].[DMInstanceId]
              WHERE [mixinBaseClassMap].[SourceDMInstanceId] = [baseClass].[DMInstanceId]
            )
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
          AND EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [baseClass].[DMInstanceId] = [ca].[Class].[Id]
            AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
          )
    ) AS [item]
  FROM [meta].[DMClassDef] [class]
  WHERE [class].[Type] = 0
    AND NOT EXISTS(SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [class].[DMInstanceId] = [ca].[Class].[Id]
      AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
`;

const mixinQuery = `
  SELECT
    [Schema].[Id] AS [SchemaId],
    json_object(
      'name', [class].[Name],
      'schemaItemType', 'Mixin',
      'modifier', ${modifier("class")},
      'label', [class].[DisplayLabel],
      'description', [class].[Description],
      'appliesTo', (
        SELECT IIF(instr([atCTE].[AppliesTo], ':') > 1, dm_classname(dm_classId([atCTE].[AppliesTo]), 's.c'), CONCAT([atCTE].[AppliesToSchema], '.', [atCTE].[AppliesTo]))
        FROM [AppliesToCTE] [atCTE]
        WHERE [atCTE].[AppliesToId] = [class].[DMInstanceId]
      ),
      'baseClasses', (
        SELECT
          json_group_array(json(json_object(
            'schema', dm_classname([baseClass].[DMInstanceId], 's'),
            'name', [baseClass].[Name],
            'schemaItemType', 'Mixin',
            'modifier', ${modifier("baseClass")},
            'label', [baseClass].[DisplayLabel],
            'description', [baseClass].[Description],
            'appliesTo', (
              SELECT IIF(instr([atCTE].[AppliesTo], ':') > 1, dm_classname(dm_classId([atCTE].[AppliesTo]), 's.c'), CONCAT([atCTE].[AppliesToSchema], '.', [atCTE].[AppliesTo]))
              FROM [AppliesToCTE] [atCTE]
              WHERE [atCTE].[AppliesToId] = [baseClass].[DMInstanceId]
            )
          )))
        FROM
          [meta].[DMClassDef] [baseClass]
        INNER JOIN [meta].[ClassHasAllBaseClasses] [baseClassMap]
          ON [baseClassMap].[TargetDMInstanceId] = [baseclass].[DMInstanceId]
        WHERE [baseClassMap].[SourceDMInstanceId] = [class].[DMInstanceId]
      )
    ) AS [item]
    FROM [meta].[DMClassDef] [class]
    WHERE [class].[Type] = 0 AND EXISTS (SELECT 1 FROM [meta].[ClassCustomAttribute] [ca] WHERE [class].[DMInstanceId] = [ca].[Class].[Id]
      AND [ca].[CustomAttributeClass].[Id] Is ([CoreCA].[IsMixin]))
`;

const withSchemaItems = `
SchemaItems AS (
  ${customAttributeQuery}
  UNION ALL
  ${structQuery}
  UNION ALL
  ${relationshipQuery}
  UNION ALL
  ${entityQuery}
  UNION ALL
  ${mixinQuery}
  UNION ALL
  ${SchemaItemQueries.enumeration()}
  UNION ALL
  ${SchemaItemQueries.kindOfQuantity()}
  UNION ALL
  ${SchemaItemQueries.propertyCategory()}
  UNION ALL
  ${SchemaItemQueries.unit()}
  UNION ALL
  ${SchemaItemQueries.invertedUnit()}
  UNION ALL
  ${SchemaItemQueries.constant()}
  UNION ALL
  ${SchemaItemQueries.phenomenon()}
  UNION ALL
  ${SchemaItemQueries.unitSystem()}
  UNION ALL
  ${SchemaItemQueries.format()}
  )
`;

const schemaStubQuery = `
  WITH
    ${withAppliesTo},
    ${withSchemaItems}
  SELECT
    [items].[item]
  FROM
    [SchemaItems] [items]
  JOIN [meta].[DMSchemaDef] [schemaDef]
    ON [schemaDef].[DMInstanceId] = [items].[SchemaId]
  WHERE [schemaDef].[Name] = :schemaName
`;

const schemaInfoQuery = `
  WITH
    ${withSchemaReferences}
  SELECT
    [Name] as [name],
    CONCAT('',[VersionMajor],'.',[VersionWrite],'.',[VersionMinor]) AS [version],
    [Alias] as [alias],
    [DisplayLabel] as [label],
    [Description] as [description],
    (
      SELECT
        json_group_array([schemaReferences].[fullName])
      FROM
        [SchemaReferences] [schemaReferences]
      WHERE
        [schemaReferences].[SchemaId] = [schemaDef].[DMInstanceId]
    ) AS [references]
  FROM
    [meta].[DMSchemaDef] [schemaDef]
`;

/**
 * Partial Schema queries.
 * @internal
 */
export const ecsqlQueries = {
  schemaStubQuery,
  schemaInfoQuery,
};
