Copyright © Szewec Systems, Incorporated. All rights reserved. See [LICENSE.md](../../../../LICENSE.md) for license terms and full copyright notice.

# Using ALL with equality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId = ALL (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName             |
| ------- | --------------------- |
| 0x11    | BisCore:PhysicalModel |

# Using ALL with inequality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId != ALL (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x1     | BisCore:RepositoryModel |

# Using ANY with equality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId = ANY(
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName             |
| ------- | --------------------- |
| 0x11    | BisCore:PhysicalModel |

# Using ANY with inequality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId != ANY(
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x1     | BisCore:RepositoryModel |

# Using ANY Greater Than

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId > ANY(
    SELECT
      DMClassId
    FROM
      aps.TestElement
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using ANY Greater Than Or Equal To

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId >= ANY(
    SELECT
      DMClassId
    FROM
      aps.TestElement
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElement                 |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using ANY Less Than

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId < ANY(
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x1     | BisCore:RepositoryModel |

# Using ANY Less Than Or Equal To

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId <= ANY(
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x11    | BisCore:PhysicalModel   |
| 0x1     | BisCore:RepositoryModel |

# Using SOME with equality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId = SOME (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName             |
| ------- | --------------------- |
| 0x11    | BisCore:PhysicalModel |

# Using SOME with inequality

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId != SOME (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x1     | BisCore:RepositoryModel |

# Using SOME with Greater Than

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId > SOME (
    SELECT
      DMClassId
    FROM
      aps.TestElement
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using SOME with Greater Than Or Equal To

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId >= SOME (
    SELECT
      DMClassId
    FROM
      aps.TestElement
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElement                 |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using SOME with Less Than

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId < SOME (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x1     | BisCore:RepositoryModel |

# Using SOME with Less Than Or Equal To

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId AS ModelId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId <= SOME (
    SELECT
      Model.Id
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName  | name      | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | --------- | ------------ | -------- | ------ | ------------------ |
|           | ModelId      | true      | 0     | modelId   | ModelId   | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName | undefined    | string   | String | undefined          |

| ModelId | ClassName               |
| ------- | ----------------------- |
| 0x10    | BisCore:DictionaryModel |
| 0xe     | BisCore:LinkModel       |
| 0x11    | BisCore:PhysicalModel   |
| 0x1     | BisCore:RepositoryModel |

# Using ANY with subquery

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId > ANY(
    SELECT
      e.DMClassId
    FROM
      aps.TestElement e
    WHERE
      e.DMInstanceId IN (
        SELECT
          Element.Id
        FROM
          aps.TestElementAspect
      )
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using ANY with where clause in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId >= ANY(
    SELECT
      e.DMClassId
    FROM
      aps.TestElement e
    WHERE
      e.DMInstanceId IN (
        SELECT
          Element.Id
        FROM
          aps.TestElementAspect
      )
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElement                 |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using SOME with where clause in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId > SOME (
    SELECT
      e.DMClassId
    FROM
      aps.TestElement e
    WHERE
      e.DMInstanceId IN (
        SELECT
          Element.Id
        FROM
          aps.TestElementAspect
      )
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using ANY with group by clause in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId >= ANY(
    SELECT
      DMClassId
    FROM
      aps.TestElement
    GROUP BY
      DMClassId
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElement                 |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |

# Using SOME with group by clause in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName
FROM
  Bis.Model
WHERE
  DMInstanceId <= SOME (
    SELECT
      Model.Id
    FROM
      aps.TestElement
    GROUP BY
      DMClassId
  )
ORDER BY
  DMInstanceId ASC
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |

| DMInstanceId | ClassName               |
| ------------ | ----------------------- |
| 0x1          | BisCore:RepositoryModel |
| 0xe          | BisCore:LinkModel       |
| 0x10         | BisCore:DictionaryModel |
| 0x11         | BisCore:PhysicalModel   |

# Using ALL with simple CTE in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName,
  Element.Id AS ElementID
FROM
  aps.TestElementAspect
WHERE
  Element.Id = ALL (
    WITH
      cte (Id) AS (
        SELECT
          DMInstanceId
        FROM
          aps.TestElement
        LIMIT
          1
      )
    SELECT
      *
    FROM
      cte
  )
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |
|           | ElementID    | true      | 2     | elementID | ElementID    | NavId        | long     | Id     | Id                 |

| DMInstanceId | ClassName                       | ElementID |
| ------------ | ------------------------------- | --------- |
| 0x21         | AllProperties:TestElementAspect | 0x14      |

# Using ANY with simple CTE in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName,
  Element.Id AS ElementID
FROM
  aps.TestElementAspect
WHERE
  Element.Id = ANY(
    WITH
      cte (Id) AS (
        SELECT
          DMInstanceId
        FROM
          aps.TestElement
      )
    SELECT
      *
    FROM
      cte
  )
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |
|           | ElementID    | true      | 2     | elementID | ElementID    | NavId        | long     | Id     | Id                 |

| DMInstanceId | ClassName                       | ElementID |
| ------------ | ------------------------------- | --------- |
| 0x21         | AllProperties:TestElementAspect | 0x14      |
| 0x22         | AllProperties:TestElementAspect | 0x16      |
| 0x23         | AllProperties:TestElementAspect | 0x18      |
| 0x24         | AllProperties:TestElementAspect | 0x1a      |
| 0x25         | AllProperties:TestElementAspect | 0x1c      |

# Using ANY GTE with simple CTE in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName,
  Element.Id AS ElementID
FROM
  aps.TestElementAspect
WHERE
  Element.Id >= ANY(
    WITH
      cte (Id) AS (
        SELECT
          DMInstanceId
        FROM
          aps.TestElement
      )
    SELECT
      *
    FROM
      cte
  )
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |
|           | ElementID    | true      | 2     | elementID | ElementID    | NavId        | long     | Id     | Id                 |

| DMInstanceId | ClassName                       | ElementID |
| ------------ | ------------------------------- | --------- |
| 0x21         | AllProperties:TestElementAspect | 0x14      |
| 0x22         | AllProperties:TestElementAspect | 0x16      |
| 0x23         | AllProperties:TestElementAspect | 0x18      |
| 0x24         | AllProperties:TestElementAspect | 0x1a      |
| 0x25         | AllProperties:TestElementAspect | 0x1c      |

# Using SOME with simple CTE in subquery

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName,
  Element.Id AS ElementID
FROM
  aps.TestElementAspect
WHERE
  Element.Id < SOME (
    WITH
      cte (Id) AS (
        SELECT
          DMInstanceId
        FROM
          aps.TestElement
      )
    SELECT
      *
    FROM
      cte
  )
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |
|           | ElementID    | true      | 2     | elementID | ElementID    | NavId        | long     | Id     | Id                 |

| DMInstanceId | ClassName                       | ElementID |
| ------------ | ------------------------------- | --------- |
| 0x21         | AllProperties:TestElementAspect | 0x14      |
| 0x22         | AllProperties:TestElementAspect | 0x16      |
| 0x23         | AllProperties:TestElementAspect | 0x18      |
| 0x24         | AllProperties:TestElementAspect | 0x1a      |
| 0x25         | AllProperties:TestElementAspect | 0x1c      |

# Using ANY with CTE and alias

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  dm_classname (DMClassId) AS ClassName,
  Element.Id AS ElementID
FROM
  aps.TestElementAspect aspect
WHERE
  aspect.Element.Id >= ANY(
    WITH
      cte (Id) AS (
        SELECT
          elem.DMInstanceId
        FROM
          aps.TestElement elem
      )
    SELECT
      Id
    FROM
      cte
  )
```

| className | accessString | generated | index | jsonName  | name         | extendedType | typeName | type   | originPropertyName |
| --------- | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | ------ | ------------------ |
|           | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id     | DMInstanceId       |
|           | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String | undefined          |
|           | ElementID    | true      | 2     | elementID | ElementID    | NavId        | long     | Id     | Id                 |

| DMInstanceId | ClassName                       | ElementID |
| ------------ | ------------------------------- | --------- |
| 0x21         | AllProperties:TestElementAspect | 0x14      |
| 0x22         | AllProperties:TestElementAspect | 0x16      |
| 0x23         | AllProperties:TestElementAspect | 0x18      |
| 0x24         | AllProperties:TestElementAspect | 0x1a      |
| 0x25         | AllProperties:TestElementAspect | 0x1c      |

# Using ALL with recursive CTE

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  DirectLong
FROM
  aps.TestElement
WHERE
  DirectLong < ALL (
    WITH RECURSIVE
      cnt (x) AS (
        VALUES
          (1005)
        UNION ALL
        SELECT
          x + 1
        FROM
          cnt
        WHERE
          x < 1010
      )
    SELECT
      x
    FROM
      cnt
  )
```

| className                 | accessString | generated | index | jsonName   | name         | extendedType | typeName | type  | originPropertyName |
| ------------------------- | ------------ | --------- | ----- | ---------- | ------------ | ------------ | -------- | ----- | ------------------ |
|                           | DMInstanceId | false     | 0     | id         | DMInstanceId | Id           | long     | Id    | DMInstanceId       |
| AllProperties:TestElement | DirectLong   | false     | 1     | directLong | DirectLong   | undefined    | long     | Int64 | DirectLong         |

| DMInstanceId | DirectLong |
| ------------ | ---------- |
| 0x14         | 1000       |
| 0x15         | 1001       |
| 0x16         | 1002       |
| 0x17         | 1003       |
| 0x18         | 1004       |
| 0x19         | 1005       |

# Using ALL with recursive CTE

- dataset: AllProperties.dtw

```sql
SELECT
  DMInstanceId,
  DirectLong
FROM
  aps.TestElement
WHERE
  DirectLong >= SOME (
    WITH RECURSIVE
      cnt (x) AS (
        VALUES
          (1007)
        UNION ALL
        SELECT
          x + 1
        FROM
          cnt
        WHERE
          x < 10
      )
    SELECT
      x
    FROM
      cnt
  )
```

| className                 | accessString | generated | index | jsonName   | name         | extendedType | typeName | type  | originPropertyName |
| ------------------------- | ------------ | --------- | ----- | ---------- | ------------ | ------------ | -------- | ----- | ------------------ |
|                           | DMInstanceId | false     | 0     | id         | DMInstanceId | Id           | long     | Id    | DMInstanceId       |
| AllProperties:TestElement | DirectLong   | false     | 1     | directLong | DirectLong   | undefined    | long     | Int64 | DirectLong         |

| DMInstanceId | DirectLong |
| ------------ | ---------- |
| 0x1b         | 1007       |
| 0x1c         | 1008       |
| 0x1d         | 1009       |

# Using ALL with multiple items

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  aps.TestFeature
WHERE
  DMInstanceID < ALL (
    SELECT
      DMClassId,
      Model.RelDMClassId
    FROM
      aps.TestElement
  )
```

| className                 | accessString | generated | index | jsonName | name | extendedType | typeName | type   | originPropertyName |
| ------------------------- | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | ------ | ------------------ |
| AllProperties:TestFeature | Name         | false     | 0     | name     | Name | undefined    | string   | String | Name               |

| Name        |
| ----------- |
| Feature0x1d |
| Feature0x1c |

# Using ANY with multiple items

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  aps.TestFeature
WHERE
  DMInstanceID < ANY(
    SELECT
      DMClassId,
      Model.RelDMClassId
    FROM
      aps.TestElement
  )
```

| className                 | accessString | generated | index | jsonName | name | extendedType | typeName | type   | originPropertyName |
| ------------------------- | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | ------ | ------------------ |
| AllProperties:TestFeature | Name         | false     | 0     | name     | Name | undefined    | string   | String | Name               |

| Name        |
| ----------- |
| Feature0x1d |
| Feature0x1c |

# Using SOME with multiple items

- dataset: AllProperties.dtw

```sql
SELECT
  count(*) AS Total_Count
FROM
  meta.dmclassdef
WHERE
  DMInstanceID = SOME(
    SELECT
      DMClassId,
      Model.RelDMClassId
    FROM
      aps.TestElement
  )
```

| className | accessString | generated | index | jsonName    | name        | extendedType | typeName | type  |
| --------- | ------------ | --------- | ----- | ----------- | ----------- | ------------ | -------- | ----- |
|           | Total_Count  | true      | 0     | Total_Count | Total_Count | undefined    | long     | Int64 |

| Total_Count |
| ----------- |
| 2           |

# ALL in select clause

- dataset: AllProperties.dtw

```sql
select dm_classname(ALL(DMClassId)) as Test_Val from aps.TestElement
```

| className | accessString | generated | index | jsonName | name     | extendedType | typeName | type   |
| --------- | ------------ | --------- | ----- | -------- | -------- | ------------ | -------- | ------ |
|           | Test_Val     | true      | 0     | test_Val | Test_Val | undefined    | string   | String |

| Test_Val                  |
| ------------------------- |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |
| AllProperties:TestElement |

# ANY in select clause

- dataset: AllProperties.dtw

```sql
select ANY(DMClassId) as Test_Val from aps.TestElement
```

| className | accessString | generated | index | jsonName | name     | extendedType | typeName | type    |
| --------- | ------------ | --------- | ----- | -------- | -------- | ------------ | -------- | ------- |
|           | Test_Val     | true      | 0     | test_Val | Test_Val | undefined    | boolean  | Boolean |

| Test_Val |
| -------- |
| true     |

# SOME in select clause

- dataset: AllProperties.dtw

```sql
select SOME(DMClassId) as Test_Val from aps.TestElement
```

| className | accessString | generated | index | jsonName | name     | extendedType | typeName | type    |
| --------- | ------------ | --------- | ----- | -------- | -------- | ------------ | -------- | ------- |
|           | Test_Val     | true      | 0     | test_Val | Test_Val | undefined    | boolean  | Boolean |

| Test_Val |
| -------- |
| true     |

# With conditional ALL

- dataset: AllProperties.dtw

```sql
SELECT
  Name
FROM
  meta.DMClassDef
WHERE
  DMInstanceId > ANY(
    SELECT
      DMClassId
    FROM
      aps.TestElement
    WHERE
      DirectLong > 1007
  )
```

| className           | accessString | generated | index | jsonName | name         | extendedType | typeName | type   | originPropertyName |
| ------------------- | ------------ | --------- | ----- | -------- | ------------ | ------------ | -------- | ------ | ------------------ |
| DMDbMeta:DMClassDef | Name         | false     | 0     | name     | Name         | undefined    | string   | String | Name               |

| Name                        |
| --------------------------- |
| TestElementAspect           |
| TestElementRefersToElements |
| TestEntityClass             |
| TestFeature                 |
| TestFeatureUsesElement      |
