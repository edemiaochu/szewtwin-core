Copyright © Szewec Systems, Incorporated. All rights reserved. See [LICENSE.md](../../../../LICENSE.md) for license terms and full copyright notice.

# Select DMDb schemas from DMDbMeta using tables

- mode: Statement
- dataset: AllProperties.dtw

```sql
Select s.Name, s.Alias from meta.DMSchemaDef s WHERE s.Name LIKE 'DMDb%' LIMIT 4;
```

| name  | type   |
| ----- | ------ |
| Name  | String |
| Alias | String |

| Name               | Alias   |
| ------------------ | ------- |
| DMDbFileInfo       | dmdbf   |
| DMDbMap            | dmdbmap |
| DMDbMeta           | meta    |
| DMDbSchemaPolicies | dmdbpol |

# Select Test elements from sample dataset using Json

- dataset: AllProperties.dtw

```sql
SELECT dm_classname(e.DMClassId) as ClassName, e.DirectStr FROM aps.TestElement e WHERE e.DirectLong > 1005 ORDER BY e.DirectLong LIMIT 2
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "ClassName",
      "generated": true,
      "index": 0,
      "jsonName": "className",
      "name": "ClassName",
      "typeName": "string",
      "type": "String"
    },
    {
      "className": "AllProperties:TestElement",
      "accessString": "DirectStr",
      "generated": false,
      "index": 1,
      "jsonName": "directStr",
      "name": "DirectStr",
      "typeName": "string",
      "type": "String",
      "originPropertyName": "DirectStr"
    }
  ]
}
```

```json
[
  {
    "ClassName": "AllProperties:TestElement",
    "DirectStr": "str6"
  },
  {
    "ClassName": "AllProperties:TestElement",
    "DirectStr": "str7"
  }
]
```

# Select Test elements from sample dataset with convertClassIdsToClassNames flag using Json

- dataset: AllProperties.dtw
- convertClassIdsToClassNames: true

```sql
SELECT e.DMClassId, e.DirectStr FROM aps.TestElement e WHERE e.DirectLong > 1005 ORDER BY e.DirectLong LIMIT 2
```

```json
{
  "columns": [
    {
      "accessString": "DMClassId",
      "name": "DMClassId",
      "type": "Id",
      "typeName": "long",
      "generated": false,
      "extendedType": "ClassId"
    },
    {
      "accessString": "DirectStr",
      "name": "DirectStr",
      "type": "String",
      "typeName": "string",
      "generated": false
    }
  ]
}
```

```json
[
  {
    "DMClassId": "AllProperties.TestElement",
    "DirectStr": "str6"
  },
  {
    "DMClassId": "AllProperties.TestElement",
    "DirectStr": "str7"
  }
]
```
