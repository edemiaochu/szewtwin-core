# Type List Expression

- dataset: AllProperties.dtw

```sql
SELECT Instance FROM meta.CustomAttribute WHERE Class.Id IS (AllProperties.TestCAClass) LIMIT 1
```

```json
{
  "columns": [
    {
      "className": "DMDbMeta:CustomAttribute",
      "accessString": "Instance",
      "generated": false,
      "index": 0,
      "jsonName": "instance",
      "name": "Instance",
      "extendedType": "Xml",
      "typeName": "string",
      "type": "String",
      "originPropertyName": "Instance"
    }
  ]
}
```

```json
[
  {
    "Instance": "<TestCAClass xmlns=\"AllProperties.01.00\">\n    <TestCAProp>TestProp</TestCAProp>\n</TestCAClass>\n"
  }
]
```

# Using Bitwise AND

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId = (4 & 5)
```

| className            | accessString              | generated | index | jsonName                  | name                      | extendedType | typeName | type   | originPropertyName        |
| -------------------- | ------------------------- | --------- | ----- | ------------------------- | ------------------------- | ------------ | -------- | ------ | ------------------------- |
|                      | DMInstanceId              | false     | 0     | id                        | DMInstanceId              | Id           | long     | Id     | DMInstanceId              |
|                      | DMClassId                 | false     | 1     | className                 | DMClassId                 | ClassId      | long     | Id     | DMClassId                 |
| DMDbMeta:DMSchemaDef | Name                      | false     | 2     | name                      | Name                      | undefined    | string   | String | Name                      |
| DMDbMeta:DMSchemaDef | DisplayLabel              | false     | 3     | displayLabel              | DisplayLabel              | undefined    | string   | String | DisplayLabel              |
| DMDbMeta:DMSchemaDef | Description               | false     | 4     | description               | Description               | undefined    | string   | String | Description               |
| DMDbMeta:DMSchemaDef | Alias                     | false     | 5     | alias                     | Alias                     | undefined    | string   | String | Alias                     |
| DMDbMeta:DMSchemaDef | VersionMajor              | false     | 6     | versionMajor              | VersionMajor              | undefined    | int      | Int    | VersionMajor              |
| DMDbMeta:DMSchemaDef | VersionWrite              | false     | 7     | versionWrite              | VersionWrite              | undefined    | int      | Int    | VersionWrite              |
| DMDbMeta:DMSchemaDef | VersionMinor              | false     | 8     | versionMinor              | VersionMinor              | undefined    | int      | Int    | VersionMinor              |
| DMDbMeta:DMSchemaDef | OriginalDMXmlVersionMajor | false     | 9     | originalDMXmlVersionMajor | OriginalDMXmlVersionMajor | undefined    | int      | Int    | OriginalDMXmlVersionMajor |
| DMDbMeta:DMSchemaDef | OriginalDMXmlVersionMinor | false     | 10    | originalDMXmlVersionMinor | OriginalDMXmlVersionMinor | undefined    | int      | Int    | OriginalDMXmlVersionMinor |

| DMInstanceId | DMClassId | Name     | Alias | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | -------- | ----- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0x4          | 0x27      | DMDbMeta | meta  | 4            | 0            | 3            | 3                         | 2                         |

# Using Bitwise OR

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId = (4 | 1)
```

| className            | accessString              | generated | index | jsonName                  | name                      | extendedType | typeName | type   | originPropertyName        |
| -------------------- | ------------------------- | --------- | ----- | ------------------------- | ------------------------- | ------------ | -------- | ------ | ------------------------- |
|                      | DMInstanceId              | false     | 0     | id                        | DMInstanceId              | Id           | long     | Id     | DMInstanceId              |
|                      | DMClassId                 | false     | 1     | className                 | DMClassId                 | ClassId      | long     | Id     | DMClassId                 |
| DMDbMeta:DMSchemaDef | Name                      | false     | 2     | name                      | Name                      | undefined    | string   | String | undefined                 |
| DMDbMeta:DMSchemaDef | DisplayLabel              | false     | 3     | displayLabel              | DisplayLabel              | undefined    | string   | String | DisplayLabel              |
| DMDbMeta:DMSchemaDef | Description               | false     | 4     | description               | Description               | undefined    | string   | String | Description               |
| DMDbMeta:DMSchemaDef | Alias                     | false     | 5     | alias                     | Alias                     | undefined    | string   | String | Alias                     |
| DMDbMeta:DMSchemaDef | VersionMajor              | false     | 6     | versionMajor              | VersionMajor              | undefined    | int      | Int    | VersionMajor              |
| DMDbMeta:DMSchemaDef | VersionWrite              | false     | 7     | versionWrite              | VersionWrite              | undefined    | int      | Int    | VersionWrite              |
| DMDbMeta:DMSchemaDef | VersionMinor              | false     | 8     | versionMinor              | VersionMinor              | undefined    | int      | Int    | VersionMinor              |
| DMDbMeta:DMSchemaDef | OriginalDMXmlVersionMajor | false     | 9     | originalDMXmlVersionMajor | OriginalDMXmlVersionMajor | undefined    | int      | Int    | OriginalDMXmlVersionMajor |
| DMDbMeta:DMSchemaDef | OriginalDMXmlVersionMinor | false     | 10    | originalDMXmlVersionMinor | OriginalDMXmlVersionMinor | undefined    | int      | Int    | OriginalDMXmlVersionMinor |

| DMInstanceId | DMClassId | Name       | Description                                 | Alias   | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | ---------- | ------------------------------------------- | ------- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0x5          | 0x27      | DMDbSystem | Helper DMSchema for DMDb internal purposes. | dmdbsys | 5            | 0            | 2            | 3                         | 2                         |

# Unary Predicate Expression

- dataset: AllProperties.dtw

```sql
SELECT DMInstanceId, dm_classname(DMClassId) as ClassName, i, l, d, b, dt, s, bin, p2d, p3d FROM aps.TestElement WHERE True
```

| className                | accessString | generated | index | jsonName  | name         | extendedType | typeName | type     | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | --------- | ------------ | ------------ | -------- | -------- | ------------------ |
|                          | DMInstanceId | false     | 0     | id        | DMInstanceId | Id           | long     | Id       | DMInstanceId       |
|                          | ClassName    | true      | 1     | className | ClassName    | undefined    | string   | String   | undefined          |
| AllProperties:IPrimitive | i            | false     | 2     | i         | i            | undefined    | int      | Int      | i                  |
| AllProperties:IPrimitive | l            | false     | 3     | l         | l            | undefined    | long     | Int64    | l                  |
| AllProperties:IPrimitive | d            | false     | 4     | d         | d            | undefined    | double   | Double   | d                  |
| AllProperties:IPrimitive | b            | false     | 5     | b         | b            | undefined    | boolean  | Boolean  | b                  |
| AllProperties:IPrimitive | dt           | false     | 6     | dt        | dt           | undefined    | dateTime | DateTime | dt                 |
| AllProperties:IPrimitive | s            | false     | 7     | s         | s            | undefined    | string   | String   | s                  |
| AllProperties:IPrimitive | bin          | false     | 8     | bin       | bin          | undefined    | binary   | Blob     | bin                |
| AllProperties:IPrimitive | p2d          | false     | 9     | p2d       | p2d          | undefined    | point2d  | Point2d  | p2d                |
| AllProperties:IPrimitive | p3d          | false     | 10    | p3d       | p3d          | undefined    | point3d  | Point3d  | p3d                |

| DMInstanceId | ClassName                 | i   | l    | d   | b    | dt                      | s    | bin                                | p2d                          | p3d                                        |
| ------------ | ------------------------- | --- | ---- | --- | ---- | ----------------------- | ---- | ---------------------------------- | ---------------------------- | ------------------------------------------ |
| 0x14         | AllProperties:TestElement | 100 | 1000 | 0.1 | true | 2017-01-01T00:00:00.000 | str0 | BIN(1,2,3)                         | {"X": 1.034, "Y": 2.034}     | {"X": -1, "Y": 2.3, "Z": 3.0001}           |
| 0x15         | AllProperties:TestElement | 101 | 1001 | 1.1 | true | 2010-01-01T11:11:11.000 | str1 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11, "Y": 2222.22} | {"X": -111.11, "Y": -222.22, "Z": -333.33} |
| 0x16         | AllProperties:TestElement | 102 | 1002 | 2.1 | true | 2017-01-01T00:00:00.000 | str2 | BIN(1,2,3)                         | {"X": 1.034, "Y": 2.034}     | {"X": -1, "Y": 2.3, "Z": 3.0001}           |
| 0x17         | AllProperties:TestElement | 103 | 1003 | 3.1 | true | 2010-01-01T11:11:11.000 | str3 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11, "Y": 2222.22} | {"X": -111.11, "Y": -222.22, "Z": -333.33} |
| 0x18         | AllProperties:TestElement | 104 | 1004 | 4.1 | true | 2017-01-01T00:00:00.000 | str4 | BIN(1,2,3)                         | {"X": 1.034, "Y": 2.034}     | {"X": -1, "Y": 2.3, "Z": 3.0001}           |
| 0x19         | AllProperties:TestElement | 105 | 1005 | 5.1 | true | 2010-01-01T11:11:11.000 | str5 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11, "Y": 2222.22} | {"X": -111.11, "Y": -222.22, "Z": -333.33} |
| 0x1a         | AllProperties:TestElement | 106 | 1006 | 6.1 | true | 2017-01-01T00:00:00.000 | str6 | BIN(1,2,3)                         | {"X": 1.034, "Y": 2.034}     | {"X": -1, "Y": 2.3, "Z": 3.0001}           |
| 0x1b         | AllProperties:TestElement | 107 | 1007 | 7.1 | true | 2010-01-01T11:11:11.000 | str7 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11, "Y": 2222.22} | {"X": -111.11, "Y": -222.22, "Z": -333.33} |
| 0x1c         | AllProperties:TestElement | 108 | 1008 | 8.1 | true | 2017-01-01T00:00:00.000 | str8 | BIN(1,2,3)                         | {"X": 1.034, "Y": 2.034}     | {"X": -1, "Y": 2.3, "Z": 3.0001}           |
| 0x1d         | AllProperties:TestElement | 109 | 1009 | 9.1 | true | 2010-01-01T11:11:11.000 | str9 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11, "Y": 2222.22} | {"X": -111.11, "Y": -222.22, "Z": -333.33} |
