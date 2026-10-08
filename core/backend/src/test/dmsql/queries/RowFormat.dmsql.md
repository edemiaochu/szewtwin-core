Copyright © Szewec Systems, Incorporated. All rights reserved. See [LICENSE.md](../../../../LICENSE.md) for license terms and full copyright notice.

# Select DMDb schemas from DMDbMeta using tables but using DMSqlPropertyIndexes

- mode: Statement
- dataset: AllProperties.dtw

```sql
Select s.Name, s.Alias from meta.DMSchemaDef s WHERE s.Name LIKE 'DMDb%' LIMIT 4;
```

- rowFormat: DMSqlIndexes

| name  | type   |
| ----- | ------ |
| Name  | String |
| Alias | String |

|                    |         |
| ------------------ | ------- |
| DMDbFileInfo       | dmdbf   |
| DMDbMap            | dmdbmap |
| DMDbMeta           | meta    |
| DMDbSchemaPolicies | dmdbpol |

# Select DMDb schemas from DMDbMeta using tables but using DMSqlPropertyIndexes and testing only one column in expected Results

- mode: Statement
- dataset: AllProperties.dtw
- indexesToInclude: [1]

```sql
Select s.Name, s.Alias from meta.DMSchemaDef s WHERE s.Name LIKE 'DMDb%' LIMIT 4;
```

- rowFormat: DMSqlIndexes

| name  | type   |
| ----- | ------ |
| Name  | String |
| Alias | String |

|         |
| ------- |
| dmdbf   |
| dmdbmap |
| meta    |
| dmdbpol |

# Select Test elements from sample dataset using Json using DMSqlPropertyIndexes row option

- dataset: AllProperties.dtw

```sql
SELECT dm_classname(e.DMClassId) as ClassName, e.DirectStr FROM aps.TestElement e WHERE e.DirectLong > 1005 ORDER BY e.DirectLong LIMIT 2
```

- rowFormat: DMSqlIndexes

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
  ["AllProperties:TestElement","str6"],
  ["AllProperties:TestElement","str7"]
]
```

# Select Test elements from sample dataset using Json using DMSqlPropertyIndexes row option and testing only one column in expected Results

- dataset: AllProperties.dtw
- indexesToInclude: [1]

```sql
SELECT e.DMClassId, e.DirectStr FROM aps.TestElement e WHERE e.DirectLong > 1005 ORDER BY e.DirectLong LIMIT 2
```

- rowFormat: DMSqlIndexes

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
[["str6"], ["str7"]]
```
