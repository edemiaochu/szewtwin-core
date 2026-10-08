# JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  JOIN aps.IPrimitive p ON te.DMInstanceId = p.DMInstanceId
LIMIT
  3
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x14         | 100 |
| 0x15         | 101 |
| 0x16         | 102 |

# INNER JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  INNER JOIN aps.IPrimitive p ON te.DMInstanceId = p.DMInstanceId
LIMIT
  3
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x14         | 100 |
| 0x15         | 101 |
| 0x16         | 102 |

# LEFT JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  LEFT JOIN meta.DMSchemaDef d ON d.VersionMajor + 100 = te.i
LIMIT
  3
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x14         | 100 |
| 0x15         | 101 |
| 0x15         | 101 |

# RIGHT JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  RIGHT JOIN meta.DMSchemaDef d ON d.VersionMajor + 100 = te.i
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x16         | 102 |
| 0x16         | 102 |
| 0x18         | 104 |
| 0x19         | 105 |

# FULL JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  FULL JOIN meta.DMSchemaDef d ON d.VersionMajor + 100 = te.i
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x14         | 100 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x15         | 101 |
| 0x16         | 102 |
| 0x16         | 102 |
| 0x17         | 103 |
| 0x18         | 104 |
| 0x19         | 105 |
| 0x1a         | 106 |
| 0x1b         | 107 |
| 0x1c         | 108 |
| 0x1d         | 109 |


# JOIN USING - FORWARD

- dataset: AllProperties.dtw

```sql
SELECT
  t0.DMInstanceId AS ParentId,
  dm_classname (t0.DMClassId) AS ParentClassName,
  t1.DMInstanceId AS ChildId,
  dm_classname (t1.DMClassId) AS ChildClassName
FROM
  [BisCore].[Element] t0
  JOIN [BisCore].[Element] t1 USING [BisCore].[ElementOwnsChildElements] FORWARD;
```

| className | accessString    | generated | index | jsonName        | name            | extendedType | typeName | type   | originPropertyName |
| --------- | --------------- | --------- | ----- | --------------- | --------------- | ------------ | -------- | ------ | ------------------ |
|           | ParentId        | true      | 0     | parentId        | ParentId        | Id           | long     | Id     | DMInstanceId       |
|           | ParentClassName | true      | 1     | parentClassName | ParentClassName | undefined    | string   | String | undefined          |
|           | ChildId         | true      | 2     | childId         | ChildId         | Id           | long     | Id     | DMInstanceId       |
|           | ChildClassName  | true      | 3     | childClassName  | ChildClassName  | undefined    | string   | String | undefined          |

| ParentId | ParentClassName         | ChildId | ChildClassName              |
| -------- | ----------------------- | ------- | --------------------------- |
| 0x12     | BisCore:SpatialCategory | 0x13    | BisCore:SubCategory         |
| 0x1      | BisCore:Subject         | 0xe     | BisCore:LinkPartition       |
| 0x1      | BisCore:Subject         | 0x10    | BisCore:DefinitionPartition |
| 0x1      | BisCore:Subject         | 0x11    | BisCore:PhysicalPartition   |

# JOIN USING - BACKWARD

- dataset: AllProperties.dtw

```sql
SELECT
  t0.DMInstanceId AS ParentId,
  dm_classname (t0.DMClassId) AS ParentClassName,
  t1.DMInstanceId AS ChildId,
  dm_classname (t1.DMClassId) AS ChildClassName
FROM
  [BisCore].[Element] t0
  JOIN [BisCore].[Element] t1 USING [BisCore].[ElementOwnsChildElements] BACKWARD;
```

| className | accessString    | generated | index | jsonName        | name            | extendedType | typeName | type   | originPropertyName |
| --------- | --------------- | --------- | ----- | --------------- | --------------- | ------------ | -------- | ------ | ------------------ |
|           | ParentId        | true      | 0     | parentId        | ParentId        | Id           | long     | Id     | DMInstanceId       |
|           | ParentClassName | true      | 1     | parentClassName | ParentClassName | undefined    | string   | String | undefined          |
|           | ChildId         | true      | 2     | childId         | ChildId         | Id           | long     | Id     | DMInstanceId       |
|           | ChildClassName  | true      | 3     | childClassName  | ChildClassName  | undefined    | string   | String | undefined          |

| ParentId | ParentClassName             | ChildId | ChildClassName          |
| -------- | --------------------------- | ------- | ----------------------- |
| 0x13     | BisCore:SubCategory         | 0x12    | BisCore:SpatialCategory |
| 0xe      | BisCore:LinkPartition       | 0x1     | BisCore:Subject         |
| 0x10     | BisCore:DefinitionPartition | 0x1     | BisCore:Subject         |
| 0x11     | BisCore:PhysicalPartition   | 0x1     | BisCore:Subject         |

# Double JOIN ON

- dataset: AllProperties.dtw

```sql
SELECT
  t0.DMInstanceId AS ParentId,
  dm_classname (t0.DMClassId) AS ParentClassName,
  t1.DMInstanceId AS ChildId,
  dm_classname (t1.DMClassId) AS ChildClassName,
  rel.SourceDMInstanceId,
  dm_classname (rel.SourceDMClassId) AS SourceClassName,
  rel.TargetDMInstanceId,
  dm_classname (rel.TargetDMClassId) AS TargetClassName
FROM
  [BisCore].[Element] t0
  JOIN [BisCore].[ElementOwnsChildElements] rel ON t0.DMInstanceId = rel.TargetDMInstanceId
  JOIN [BisCore].[Element] t1 ON t1.DMInstanceId = rel.SourceDMInstanceId;
```

| className | accessString       | generated | index | jsonName        | name               | extendedType | typeName | type   | originPropertyName |
| --------- | ------------------ | --------- | ----- | --------------- | ------------------ | ------------ | -------- | ------ | ------------------ |
|           | ParentId           | true      | 0     | parentId        | ParentId           | Id           | long     | Id     | DMInstanceId       |
|           | ParentClassName    | true      | 1     | parentClassName | ParentClassName    | undefined    | string   | String | undefined          |
|           | ChildId            | true      | 2     | childId         | ChildId            | Id           | long     | Id     | DMInstanceId       |
|           | ChildClassName     | true      | 3     | childClassName  | ChildClassName     | undefined    | string   | String | undefined          |
|           | SourceDMInstanceId | false     | 4     | sourceId        | SourceDMInstanceId | SourceId     | long     | Id     | SourceDMInstanceId |
|           | SourceClassName    | true      | 5     | sourceClassName | SourceClassName    | undefined    | string   | String | undefined          |
|           | TargetDMInstanceId | false     | 6     | targetId        | TargetDMInstanceId | TargetId     | long     | Id     | TargetDMInstanceId |
|           | TargetClassName    | true      | 7     | targetClassName | TargetClassName    | undefined    | string   | String | undefined          |

| ParentId | ParentClassName             | ChildId | ChildClassName          | SourceDMInstanceId | SourceClassName         | TargetDMInstanceId | TargetClassName             |
| -------- | --------------------------- | ------- | ----------------------- | ------------------ | ----------------------- | ------------------ | --------------------------- |
| 0x13     | BisCore:SubCategory         | 0x12    | BisCore:SpatialCategory | 0x12               | BisCore:SpatialCategory | 0x13               | BisCore:SubCategory         |
| 0xe      | BisCore:LinkPartition       | 0x1     | BisCore:Subject         | 0x1                | BisCore:Subject         | 0xe                | BisCore:LinkPartition       |
| 0x10     | BisCore:DefinitionPartition | 0x1     | BisCore:Subject         | 0x1                | BisCore:Subject         | 0x10               | BisCore:DefinitionPartition |
| 0x11     | BisCore:PhysicalPartition   | 0x1     | BisCore:Subject         | 0x1                | BisCore:Subject         | 0x11               | BisCore:PhysicalPartition   |


# CROSS JOIN

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId AS TestElementId,
  d.Name AS SchemaName
FROM
  aps.TestElement te
  CROSS JOIN meta.DMSchemaDef d
LIMIT
  10;
```

| className | accessString  | generated | index | jsonName      | name          | extendedType | typeName | type   | originPropertyName |
| --------- | ------------- | --------- | ----- | ------------- | ------------- | ------------ | -------- | ------ | ------------------ |
|           | TestElementId | true      | 0     | testElementId | TestElementId | Id           | long     | Id     | DMInstanceId       |
|           | SchemaName    | true      | 1     | schemaName    | SchemaName    | undefined    | string   | String | Name               |

| TestElementId | SchemaName           |
| ------------- | -------------------- |
| 0x14          | AllProperties        |
| 0x14          | BisCore              |
| 0x14          | BisCustomAttributes  |
| 0x14          | CoreCustomAttributes |
| 0x14          | DMDbFileInfo         |
| 0x14          | DMDbMap              |
| 0x14          | DMDbMeta             |
| 0x14          | DMDbSchemaPolicies   |
| 0x14          | DMDbSystem           |
| 0x14          | Generic              |

# CROSS JOIN allproperties and ecschemaDef

- dataset: AllProperties.dtw

```sql
SELECT te.DMInstanceId, d.Alias FROM aps.TestElement te CROSS JOIN meta.DMSchemaDef d LIMIT 3;
```

| className            | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| -------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
|                      | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
| DMDbMeta:DMSchemaDef | Alias        | false     | 1     | alias    | Alias        | undefined    | string   | String | Alias              |

| DMInstanceId | Alias |
| ------------ | ----- |
| 0x14         | aps   |
| 0x14         | bis   |
| 0x14         | bisCA |


# NATURAL JOIN

- dataset: AllProperties.dtw
- errorDuringPrepare: true

```sql
SELECT 1
FROM (SELECT DMInstanceId AS CommonId, FederationGuid FROM bis.Element) AS ElementAlias
NATURAL JOIN (SELECT DMInstanceId AS CommonId, IsPrivate FROM bis.Model) AS ModelAlias;
```

# Double Join Using

- dataset: AllProperties.dtw

```sql
SELECT
  t0.DMInstanceId AS ParentId,
  dm_classname (t0.DMClassId) AS ParentClassName,
  t1.DMInstanceId AS ChildId,
  dm_classname (t1.DMClassId) AS ChildClassName,
  t2.DMInstanceId AS GrandChildId,
  dm_classname (t2.DMClassId) AS GrandChildClassName
FROM
  [BisCore].[Element] t0
  JOIN [BisCore].[Element] t1 USING [BisCore].[ElementOwnsChildElements] AS Rel1 FORWARD
  JOIN [BisCore].[Element] t2 USING [BisCore].[ElementOwnsChildElements] AS Rel2 FORWARD;
```

| className | accessString        | generated | index | jsonName            | name                | extendedType | typeName | type   | originPropertyName |
| --------- | ------------------- | --------- | ----- | ------------------- | ------------------- | ------------ | -------- | ------ | ------------------ |
|           | ParentId            | true      | 0     | parentId            | ParentId            | Id           | long     | Id     | DMInstanceId       |
|           | ParentClassName     | true      | 1     | parentClassName     | ParentClassName     | undefined    | string   | String | undefined          |
|           | ChildId             | true      | 2     | childId             | ChildId             | Id           | long     | Id     | DMInstanceId       |
|           | ChildClassName      | true      | 3     | childClassName      | ChildClassName      | undefined    | string   | String | undefined          |
|           | GrandChildId        | true      | 4     | grandChildId        | GrandChildId        | Id           | long     | Id     | DMInstanceId       |
|           | GrandChildClassName | true      | 5     | grandChildClassName | GrandChildClassName | undefined    | string   | String | undefined          |

| ParentId | ParentClassName         | ChildId | ChildClassName              | GrandChildId | GrandChildClassName         |
| -------- | ----------------------- | ------- | --------------------------- | ------------ | --------------------------- |
| 0x12     | BisCore:SpatialCategory | 0x13    | BisCore:SubCategory         | 0x13         | BisCore:SubCategory         |
| 0x1      | BisCore:Subject         | 0xe     | BisCore:LinkPartition       | 0xe          | BisCore:LinkPartition       |
| 0x1      | BisCore:Subject         | 0xe     | BisCore:LinkPartition       | 0x10         | BisCore:DefinitionPartition |
| 0x1      | BisCore:Subject         | 0xe     | BisCore:LinkPartition       | 0x11         | BisCore:PhysicalPartition   |
| 0x1      | BisCore:Subject         | 0x10    | BisCore:DefinitionPartition | 0xe          | BisCore:LinkPartition       |
| 0x1      | BisCore:Subject         | 0x10    | BisCore:DefinitionPartition | 0x10         | BisCore:DefinitionPartition |
| 0x1      | BisCore:Subject         | 0x10    | BisCore:DefinitionPartition | 0x11         | BisCore:PhysicalPartition   |
| 0x1      | BisCore:Subject         | 0x11    | BisCore:PhysicalPartition   | 0xe          | BisCore:LinkPartition       |
| 0x1      | BisCore:Subject         | 0x11    | BisCore:PhysicalPartition   | 0x10         | BisCore:DefinitionPartition |
| 0x1      | BisCore:Subject         | 0x11    | BisCore:PhysicalPartition   | 0x11         | BisCore:PhysicalPartition   |

# Double Join with Where

- dataset: AllProperties.dtw

```sql
SELECT
  Parent.DMInstanceId AS ParentId,
  Child.DMInstanceId AS ChildId,
  GrandChild.DMInstanceId AS GrandChildId
FROM
  [BisCore].[Element] Parent
  JOIN [BisCore].[Element] Child USING [BisCore].[ElementOwnsChildElements] re1 FORWARD
  JOIN [BisCore].[Element] GrandChild USING [BisCore].[ElementOwnsChildElements] re2 FORWARD
WHERE
  Parent.DMInstanceId <> GrandChild.DMInstanceId
```

| className | accessString | generated | index | jsonName     | name         | extendedType | typeName | type | originPropertyName |
| --------- | ------------ | --------- | ----- | ------------ | ------------ | ------------ | -------- | ---- | ------------------ |
|           | ParentId     | true      | 0     | parentId     | ParentId     | Id           | long     | Id   | DMInstanceId       |
|           | ChildId      | true      | 1     | childId      | ChildId      | Id           | long     | Id   | DMInstanceId       |
|           | GrandChildId | true      | 2     | grandChildId | GrandChildId | Id           | long     | Id   | DMInstanceId       |

| ParentId | ChildId | GrandChildId |
| -------- | ------- | ------------ |
| 0x12     | 0x13    | 0x13         |
| 0x1      | 0xe     | 0xe          |
| 0x1      | 0xe     | 0x10         |
| 0x1      | 0xe     | 0x11         |
| 0x1      | 0x10    | 0xe          |
| 0x1      | 0x10    | 0x10         |
| 0x1      | 0x10    | 0x11         |
| 0x1      | 0x11    | 0xe          |
| 0x1      | 0x11    | 0x10         |
| 0x1      | 0x11    | 0x11         |

# JOIN in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  t1.DMInstanceId AS ParentId,
  SubQuery.ChildId
FROM
  [BisCore].[Element] t1
  JOIN (
    SELECT
      TargetDMInstanceId AS ChildId
    FROM
      [BisCore].[ElementOwnsChildElements]
  ) SubQuery ON t1.DMInstanceId = SubQuery.ChildId;
```

| className | accessString | generated | index | jsonName | name     | extendedType | typeName | type | originPropertyName |
| --------- | ------------ | --------- | ----- | -------- | -------- | ------------ | -------- | ---- | ------------------ |
|           | ParentId     | true      | 0     | parentId | ParentId | Id           | long     | Id   | DMInstanceId       |
|           | ChildId      | true      | 1     | childId  | ChildId  | TargetId     | long     | Id   | undefined          |

| ParentId | ChildId |
| -------- | ------- |
| 0x13     | 0x13    |
| 0xe      | 0xe     |
| 0x10     | 0x10    |
| 0x11     | 0x11    |

# JOIN on Empty Table

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i
FROM
  aps.TestElement te
  LEFT JOIN aps.testElementRefersToElements ter ON te.i = ter.i
```

| className                | accessString | generated | index | jsonName | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id       | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i        | i            | undefined    | int      | Int  | i                  |

| DMInstanceId | i   |
| ------------ | --- |
| 0x14         | 100 |
| 0x15         | 101 |
| 0x16         | 102 |
| 0x17         | 103 |
| 0x18         | 104 |
| 0x19         | 105 |
| 0x1a         | 106 |
| 0x1b         | 107 |
| 0x1c         | 108 |
| 0x1d         | 109 |

# Nested JOIN in Select

- dataset: AllProperties.dtw

```sql
SELECT
  nested_join.te_DMInstanceId,
  nested_join.te_i,
  nested_join.VersionMajor
FROM
  (
    SELECT
      te.DMInstanceId AS te_DMInstanceId,
      te.i AS te_i,
      d.VersionMajor
    FROM
      aps.TestElement te
      INNER JOIN aps.IPrimitive p ON te.DMInstanceId = p.DMInstanceId
      LEFT JOIN meta.DMSchemaDef d ON d.VersionMajor + 100 = te.i
  ) AS nested_join
LIMIT
  5;
```

| className            | accessString    | generated | index | jsonName        | name            | extendedType | typeName | type | originPropertyName |
| -------------------- | --------------- | --------- | ----- | --------------- | --------------- | ------------ | -------- | ---- | ------------------ |
|                      | te_DMInstanceId | true      | 0     | te_DMInstanceId | te_DMInstanceId | Id           | long     | Id   | undefined          |
|                      | te_i            | true      | 1     | te_i            | te_i            | undefined    | int      | Int  | undefined          |
| DMDbMeta:DMSchemaDef | VersionMajor    | false     | 2     | versionMajor    | VersionMajor    | undefined    | int      | Int  | VersionMajor       |

| te_DMInstanceId | te_i | VersionMajor |
| --------------- | ---- | ------------ |
| 0x14            | 100  | undefined    |
| 0x15            | 101  | 1            |
| 0x15            | 101  | 1            |
| 0x15            | 101  | 1            |
| 0x15            | 101  | 1            |

# Mixed JOIN types in one query

- dataset: AllProperties.dtw

```sql
SELECT
  te.DMInstanceId,
  te.i,
  d.VersionMajor,
  eoc.SourceDMInstanceId AS sourceECid
FROM
  aps.TestElement te
  INNER JOIN aps.IPrimitive p ON te.DMInstanceId = p.DMInstanceId
  LEFT JOIN meta.DMSchemaDef d ON d.VersionMajor + 100 = te.i
  CROSS JOIN BisCore.ElementOwnsChildElements eoc
LIMIT
  6;
```

| className                | accessString | generated | index | jsonName     | name         | extendedType | typeName | type | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | ------------ | ------------ | ------------ | -------- | ---- | ------------------ |
|                          | DMInstanceId | false     | 0     | id           | DMInstanceId | Id           | long     | Id   | DMInstanceId       |
| AllProperties:IPrimitive | i            | false     | 1     | i            | i            | undefined    | int      | Int  | i                  |
| DMDbMeta:DMSchemaDef     | VersionMajor | false     | 2     | versionMajor | VersionMajor | undefined    | int      | Int  | VersionMajor       |
|                          | sourceECid   | true      | 3     | sourceECid   | sourceECid   | SourceId     | long     | Id   | SourceDMInstanceId |

| DMInstanceId | i   | sourceECid | VersionMajor |
| ------------ | --- | ---------- | ------------ |
| 0x14         | 100 | 0x12       | undefined    |
| 0x14         | 100 | 0x1        | undefined    |
| 0x14         | 100 | 0x1        | undefined    |
| 0x14         | 100 | 0x1        | undefined    |
| 0x15         | 101 | 0x12       | 1            |
| 0x15         | 101 | 0x1        | 1            |

# Named Properties Join

- dataset: AllProperties.dtw
- errorDuringPrepare: true

```sql
SELECT 1 FROM bis.Element e JOIN bis.SpatialElement s USING (DMInstanceId);
```
