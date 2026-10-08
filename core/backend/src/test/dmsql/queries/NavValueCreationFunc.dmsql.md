Copyright © Szewec Systems, Incorporated. All rights reserved. See [LICENSE.md](../../../../LICENSE.md) for license terms and full copyright notice.

# With all 3 arguments and hex ids

- dataset: AllProperties.dtw

```sql
select navigation_value(aps.TestFeature.FeatureUsesElement, 0x1d, 0x155)
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "FeatureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1d",
      "RelDMClassId": "0x155"
    }
  }
]
```

# With only navigation property and hex instance id

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement.Id AS Id,
  dm_classname (FeatureUsesElement.RelDMClassId) AS RelDMClassName
FROM
  (
    SELECT
      navigation_value (aps.TestFeature.FeatureUsesElement, 0x1c)
  )
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "Id",
      "generated": true,
      "index": 0,
      "jsonName": "id",
      "name": "Id",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id"
    },
    {
      "className": "",
      "accessString": "RelDMClassName",
      "generated": true,
      "index": 1,
      "jsonName": "relDMClassName",
      "name": "RelDMClassName",
      "typeName": "string",
      "type": "String"
    }
  ]
}
```

```json
[
  {
    "Id": "0x1c",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  }
]
```

# With all 3 arguments and decimal ids

- dataset: AllProperties.dtw

```sql
select navigation_value(aps.TestFeature.FeatureUsesElement, 29, 341)
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "FeatureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1d",
      "RelDMClassId": "0x155"
    }
  }
]
```

# With only navigation property and decimal instance id arguments

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement.Id AS Id,
  dm_classname (FeatureUsesElement.RelDMClassId) AS RelDMClassName
FROM
  (
    SELECT
      navigation_value (aps.TestFeature.FeatureUsesElement, 29)
  )
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "Id",
      "generated": true,
      "index": 0,
      "jsonName": "id",
      "name": "Id",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id"
    },
    {
      "className": "",
      "accessString": "RelDMClassName",
      "generated": true,
      "index": 1,
      "jsonName": "relDMClassName",
      "name": "RelDMClassName",
      "typeName": "string",
      "type": "String"
    }
  ]
}
```

```json
[
  {
    "Id": "0x1d",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  }
]
```

# With binders and hex ids

- dataset: AllProperties.dtw

```sql
select navigation_value(aps.TestFeature.FeatureUsesElement, ?, ?)
```

- bindId 1, 0x1d
- bindId 2, 0x155

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "FeatureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1d",
      "RelDMClassId": "0x155"
    }
  }
]
```

# With binders and decimal ids

- dataset: AllProperties.dtw

```sql
select navigation_value(aps.TestFeature.FeatureUsesElement, ?, ?)
```

- bindId 1, 29
- bindId 2, 341

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "featureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1d",
      "RelDMClassId": "0x155"
    }
  }
]
```

# With actual navigation property row values

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement.Id AS Id,
  dm_classname (FeatureUsesElement.RelDMClassId) AS RelDMClassName
FROM
  (
    SELECT
      navigation_value (
        aps.TestFeature.FeatureUsesElement,
        FeatureUsesElement.Id,
        FeatureUsesElement.RelDMClassId
      )
    FROM
      aps.TestFeature
  )
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "Id",
      "generated": true,
      "index": 0,
      "jsonName": "id",
      "name": "Id",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id"
    },
    {
      "className": "",
      "accessString": "RelDMClassName",
      "generated": true,
      "index": 1,
      "jsonName": "relDMClassName",
      "name": "RelDMClassName",
      "typeName": "string",
      "type": "String"
    }
  ]
}
```

```json
[
  {
    "Id": "0x1d",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  },
  {
    "Id": "0x1c",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  }
]
```

# With duplicate navigation properties

- dataset: AllProperties.dtw

```sql
SELECT
  NAVIGATION_VALUE (aps.TestFeature.FeatureUsesElement, 0x1c, 0x155),
  NAVIGATION_VALUE (aps.TestFeature.FeatureUsesElement, 28, 341)
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "FeatureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    },
    {
      "className": "",
      "accessString": "FeatureUsesElement_1",
      "generated": true,
      "index": 1,
      "jsonName": "FeatureUsesElement_1",
      "name": "FeatureUsesElement_1",
      "typeName": "navigation",
      "type": "Navigation",
      "originPropertyName": "FeatureUsesElement"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1c",
      "RelDMClassId": "0x155"
    },
    "FeatureUsesElement_1": {
      "Id": "0x1c",
      "RelDMClassId": "0x155"
    }
  }
]
```

# Check fields directly

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement.Id,
  dm_classname (FeatureUsesElement.RelDMClassId) AS RelDMClassName
FROM
  aps.TestFeature
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement.Id",
      "generated": false,
      "index": 0,
      "jsonName": "featureUsesElement.id",
      "name": "Id",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id",
      "originPropertyName": "Id"
    },
    {
      "className": "",
      "accessString": "RelDMClassName",
      "generated": true,
      "index": 1,
      "jsonName": "relDMClassName",
      "name": "RelDMClassName",
      "typeName": "string",
      "type": "String"
    }
  ]
}
```

```json
[
  {
    "Id": "0x1d",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  },
  {
    "Id": "0x1c",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  }
]
```

# With navigation value function in from clause

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement,
  FeatureUsesElement.Id AS featureId,
  FeatureUsesElement.RelDMClassId AS featureRelClassId
FROM
  (
    SELECT
      navigation_value (aps.TestFeature.FeatureUsesElement, 0x1d, 0x155)
  )
WHERE
  FeatureUsesElement.RelDMClassId = 0x155
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "FeatureUsesElement",
      "generated": true,
      "index": 0,
      "jsonName": "featureUsesElement",
      "name": "FeatureUsesElement",
      "typeName": "navigation",
      "type": "Navigation"
    },
    {
      "className": "",
      "accessString": "featureId",
      "generated": true,
      "index": 1,
      "jsonName": "featureId",
      "name": "featureId",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id"
    },
    {
      "className": "",
      "accessString": "featureRelClassId",
      "generated": true,
      "index": 2,
      "jsonName": "featureRelClassId",
      "name": "featureRelClassId",
      "extendedType": "NavRelClassId",
      "typeName": "long",
      "type": "Id"
    }
  ]
}
```

```json
[
  {
    "FeatureUsesElement": {
      "Id": "0x1d",
      "RelDMClassId": "0x155"
    },
    "featureId": "0x1d",
    "featureRelClassId": "0x155"
  }
]
```

# With navigation value function with subquery as arguments

- dataset: AllProperties.dtw

```sql
SELECT
  FeatureUsesElement.Id AS Id,
  dm_classname (FeatureUsesElement.RelDMClassId) AS RelDMClassName
FROM
  (
    SELECT
      NAVIGATION_VALUE (
        aps.TestFeature.FeatureUsesElement,
        (
          SELECT
            FeatureUsesElement.Id
          FROM
            aps.TestFeature
          WHERE
            dm_classname (FeatureUsesElement.RelDMClassId) = 'AllProperties:TestFeatureUsesElement'
          LIMIT
            1
          OFFSET
            1
        ),
        (
          SELECT
            FeatureUsesElement.RelDMClassId
          FROM
            aps.TestFeature
          WHERE
            FeatureUsesElement.Id = 0x1d
        )
      )
  )
```

```json
{
  "columns": [
    {
      "className": "",
      "accessString": "Id",
      "generated": true,
      "index": 0,
      "jsonName": "id",
      "name": "Id",
      "extendedType": "NavId",
      "typeName": "long",
      "type": "Id"
    },
    {
      "className": "",
      "accessString": "RelDMClassName",
      "generated": true,
      "index": 1,
      "jsonName": "relDMClassName",
      "name": "RelDMClassName",
      "typeName": "string",
      "type": "String"
    }
  ]
}
```

```json
[
  {
    "Id": "0x1c",
    "RelDMClassName": "AllProperties:TestFeatureUsesElement"
  }
]
```