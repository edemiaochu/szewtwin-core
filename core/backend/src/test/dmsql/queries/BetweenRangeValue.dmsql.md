# Select all properties from TestElement which is between 2 Numeric value expression

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId BETWEEN 1 and 3
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

| DMInstanceId | DMClassId | Name                 | DisplayLabel           | Description                                                                                                            | Alias   | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0x1          | 0x27      | CoreCustomAttributes | Core Custom Attributes | Custom attributes to indicate core DM concepts, may include struct classes intended for use in core custom attributes. | CoreCA  | 1            | 0            | 4            | 3                         | 2                         |
| 0x2          | 0x27      | DMDbMap              | DMDb DB Mapping        | Custom attributes that customize DMDb's DMSchema to database mapping.                                                  | dmdbmap | 2            | 0            | 4            | 3                         | 2                         |
| 0x3          | 0x27      | DMDbFileInfo         | DMDb FileInfo          | DMDb FileInfo                                                                                                          | dmdbf   | 2            | 0            | 1            | 3                         | 2                         |

# Select all properties from TestElement which is Not between 2 Numeric value expression

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId NOT BETWEEN 1 and 9
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

| DMInstanceId | DMClassId | Name          | Alias | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | ------------- | ----- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0xa          | 0x27      | AllProperties | aps   | 1            | 0            | 0            | 3                         | 2                         |

# Select all properties from TestElement which is Not between 2 String value expression - implicit conversion from string to number for DMInstanceId

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId BETWEEN '1' and '3'
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

| DMInstanceId | DMClassId | Name                 | DisplayLabel           | Description                                                                                                            | Alias   | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0x1          | 0x27      | CoreCustomAttributes | Core Custom Attributes | Custom attributes to indicate core DM concepts, may include struct classes intended for use in core custom attributes. | CoreCA  | 1            | 0            | 4            | 3                         | 2                         |
| 0x2          | 0x27      | DMDbMap              | DMDb DB Mapping        | Custom attributes that customize DMDb's DMSchema to database mapping.                                                  | dmdbmap | 2            | 0            | 4            | 3                         | 2                         |
| 0x3          | 0x27      | DMDbFileInfo         | DMDb FileInfo          | DMDb FileInfo                                                                                                          | dmdbf   | 2            | 0            | 1            | 3                         | 2                         |

# Select all properties from TestElement which is between 2 String value expression - implicit conversion from string to number for DMInstanceId

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE DMInstanceId NOT BETWEEN '1' and '9'
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

| DMInstanceId | DMClassId | Name          | Alias | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | ------------- | ----- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0xa          | 0x27      | AllProperties | aps   | 1            | 0            | 0            | 3                         | 2                         |

# Select all properties from TestElement which is between 2 String value expression

- dataset: AllProperties.dtw

```sql
SELECT DMInstanceId, DMClassId, Name, DisplayLabel, Description, Alias FROM meta.DMSchemaDef WHERE Alias BETWEEN 'bis' and 'CoreCA'
```

| className            | accessString              | generated | index | jsonName                  | name                      | extendedType | typeName | type   | originPropertyName        |
| -------------------- | ------------------------- | --------- | ----- | ------------------------- | ------------------------- | ------------ | -------- | ------ | ------------------------- |
|                      | DMInstanceId              | false     | 0     | id                        | DMInstanceId              | Id           | long     | Id     | DMInstanceId              |
|                      | DMClassId                 | false     | 1     | className                 | DMClassId                 | ClassId      | long     | Id     | DMClassId                 |
| DMDbMeta:DMSchemaDef | Name                      | false     | 2     | name                      | Name                      | undefined    | string   | String | Name                      |
| DMDbMeta:DMSchemaDef | DisplayLabel              | false     | 3     | displayLabel              | DisplayLabel              | undefined    | string   | String | DisplayLabel              |
| DMDbMeta:DMSchemaDef | Description               | false     | 4     | description               | Description               | undefined    | string   | String | Description               |
| DMDbMeta:DMSchemaDef | Alias                     | false     | 5     | alias                     | Alias                     | undefined    | string   | String | Alias                     |

| DMInstanceId | DMClassId | Name                 | DisplayLabel           | Description                                                                                                            | Alias  |
| ------------ | --------- | -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| 0x8          | 0x27      | BisCore              | BIS Core               | The BIS core schema contains classes that all other domain schemas extend.                                             | bis    |
| 0x6          | 0x27      | BisCustomAttributes  | BIS Custom Attributes  | Custom attributes to indicate BIS concepts.                                                                            | bisCA  |
| 0x1          | 0x27      | CoreCustomAttributes | Core Custom Attributes | Custom attributes to indicate core DM concepts, may include struct classes intended for use in core custom attributes. | CoreCA |

# Select all properties from TestElement which is Not between 2 String value expression

- dataset: AllProperties.dtw

```sql
SELECT * FROM meta.DMSchemaDef WHERE Alias NOT BETWEEN 'bis' and 'CoreCA'
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

| DMInstanceId | DMClassId | Name               | DisplayLabel         | Description                                                                                                                                                   | Alias   | VersionMajor | VersionWrite | VersionMinor | OriginalDMXmlVersionMajor | OriginalDMXmlVersionMinor |
| ------------ | --------- | ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------ | ------------ | ------------------------- | ------------------------- |
| 0x2          | 0x27      | DMDbMap            | DMDb DB Mapping      | Custom attributes that customize DMDb's DMSchema to database mapping.                                                                                         | dmdbmap | 2            | 0            | 4            | 3                         | 2                         |
| 0x3          | 0x27      | DMDbFileInfo       | DMDb FileInfo        | DMDb FileInfo                                                                                                                                                 | dmdbf   | 2            | 0            | 1            | 3                         | 2                         |
| 0x4          | 0x27      | DMDbMeta           | undefined            | undefined                                                                                                                                                     | meta    | 4            | 0            | 3            | 3                         | 2                         |
| 0x5          | 0x27      | DMDbSystem         | undefined            | Helper DMSchema for DMDb internal purposes.                                                                                                                   | dmdbsys | 5            | 0            | 2            | 3                         | 2                         |
| 0x7          | 0x27      | DMDbSchemaPolicies | DMDb Schema Policies | Schema policies which impose schema authoring rules.                                                                                                          | dmdbpol | 1            | 0            | 1            | 3                         | 2                         |
| 0x9          | 0x27      | Generic            | undefined            | This schema contains classes that are completely generic. These classes should only be used when there is not enough context to pick something more specific. | generic | 1            | 0            | 5            | 3                         | 2                         |
| 0xa          | 0x27      | AllProperties      | undefined            | undefined                                                                                                                                                     | aps     | 1            | 0            | 0            | 3                         | 2                         |

# Select all properties from TestElement which is between 2 DATE value expression

- dataset: AllProperties.dtw

```sql
SELECT
  i,
  l,
  d,
  b,
  dt,
  s,
  bin,
  p2d,
  p3d
FROM
  aps.TestElement
WHERE
  dt BETWEEN DATE '2017-01-01' AND DATE  '2017-01-01'
LIMIT
  2
```

| className                | accessString | generated | index | jsonName | name | extendedType | typeName | type     | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | -------- | ------------------ |
| AllProperties:IPrimitive | i            | false     | 0     | i        | i    | undefined    | int      | Int      | i                  |
| AllProperties:IPrimitive | l            | false     | 1     | l        | l    | undefined    | long     | Int64    | l                  |
| AllProperties:IPrimitive | d            | false     | 2     | d        | d    | undefined    | double   | Double   | d                  |
| AllProperties:IPrimitive | b            | false     | 3     | b        | b    | undefined    | boolean  | Boolean  | b                  |
| AllProperties:IPrimitive | dt           | false     | 4     | dt       | dt   | undefined    | dateTime | DateTime | dt                 |
| AllProperties:IPrimitive | s            | false     | 5     | s        | s    | undefined    | string   | String   | s                  |
| AllProperties:IPrimitive | bin          | false     | 6     | bin      | bin  | undefined    | binary   | Blob     | bin                |
| AllProperties:IPrimitive | p2d          | false     | 7     | p2d      | p2d  | undefined    | point2d  | Point2d  | p2d                |
| AllProperties:IPrimitive | p3d          | false     | 8     | p3d      | p3d  | undefined    | point3d  | Point3d  | p3d                |

| i   | l    | d   | b    | dt                      | s    | bin        | p2d                     | p3d                            |
| --- | ---- | --- | ---- | ----------------------- | ---- | ---------- | ----------------------- | ------------------------------ |
| 100 | 1000 | 0.1 | true | 2017-01-01T00:00:00.000 | str0 | BIN(1,2,3) | {"X": 1.034,"Y": 2.034} | {"X": -1,"Y": 2.3,"Z": 3.0001} |
| 102 | 1002 | 2.1 | true | 2017-01-01T00:00:00.000 | str2 | BIN(1,2,3) | {"X": 1.034,"Y": 2.034} | {"X": -1,"Y": 2.3,"Z": 3.0001} |

# Select all properties from TestElement which is Not between 2 DATE value expression

- dataset: AllProperties.dtw

```sql
SELECT
  i,
  l,
  d,
  b,
  dt,
  s,
  bin,
  p2d,
  p3d
FROM
  aps.TestElement
WHERE
  dt NOT BETWEEN DATE '2017-01-01' AND DATE  '2017-01-01'
LIMIT
  2
```

| className                | accessString | generated | index | jsonName | name | extendedType | typeName | type     | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | -------- | ------------------ |
| AllProperties:IPrimitive | i            | false     | 0     | i        | i    | undefined    | int      | Int      | i                  |
| AllProperties:IPrimitive | l            | false     | 1     | l        | l    | undefined    | long     | Int64    | l                  |
| AllProperties:IPrimitive | d            | false     | 2     | d        | d    | undefined    | double   | Double   | d                  |
| AllProperties:IPrimitive | b            | false     | 3     | b        | b    | undefined    | boolean  | Boolean  | b                  |
| AllProperties:IPrimitive | dt           | false     | 4     | dt       | dt   | undefined    | dateTime | DateTime | dt                 |
| AllProperties:IPrimitive | s            | false     | 5     | s        | s    | undefined    | string   | String   | s                  |
| AllProperties:IPrimitive | bin          | false     | 6     | bin      | bin  | undefined    | binary   | Blob     | bin                |
| AllProperties:IPrimitive | p2d          | false     | 7     | p2d      | p2d  | undefined    | point2d  | Point2d  | p2d                |
| AllProperties:IPrimitive | p3d          | false     | 8     | p3d      | p3d  | undefined    | point3d  | Point3d  | p3d                |

| i   | l    | d   | b    | dt                      | s    | bin                                | p2d                         | p3d                                      |
| --- | ---- | --- | ---- | ----------------------- | ---- | ---------------------------------- | --------------------------- | ---------------------------------------- |
| 101 | 1001 | 1.1 | true | 2010-01-01T11:11:11.000 | str1 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11,"Y": 2222.22} | {"X": -111.11,"Y": -222.22,"Z": -333.33} |
| 103 | 1003 | 3.1 | true | 2010-01-01T11:11:11.000 | str3 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11,"Y": 2222.22} | {"X": -111.11,"Y": -222.22,"Z": -333.33} |

# Select all properties from TestElement which is between 2 TIMESTAMP value expression

- dataset: AllProperties.dtw

```sql
SELECT
  i,
  l,
  d,
  b,
  dt,
  s,
  bin,
  p2d,
  p3d
FROM
  aps.TestElement
WHERE
  dt BETWEEN TIMESTAMP '2017-01-01 00:00:00' AND TIMESTAMP  '2017-01-01 00:00:00'
LIMIT
  2
```

| className                | accessString | generated | index | jsonName | name | extendedType | typeName | type     | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | -------- | ------------------ |
| AllProperties:IPrimitive | i            | false     | 0     | i        | i    | undefined    | int      | Int      | i                  |
| AllProperties:IPrimitive | l            | false     | 1     | l        | l    | undefined    | long     | Int64    | l                  |
| AllProperties:IPrimitive | d            | false     | 2     | d        | d    | undefined    | double   | Double   | d                  |
| AllProperties:IPrimitive | b            | false     | 3     | b        | b    | undefined    | boolean  | Boolean  | b                  |
| AllProperties:IPrimitive | dt           | false     | 4     | dt       | dt   | undefined    | dateTime | DateTime | dt                 |
| AllProperties:IPrimitive | s            | false     | 5     | s        | s    | undefined    | string   | String   | s                  |
| AllProperties:IPrimitive | bin          | false     | 6     | bin      | bin  | undefined    | binary   | Blob     | bin                |
| AllProperties:IPrimitive | p2d          | false     | 7     | p2d      | p2d  | undefined    | point2d  | Point2d  | p2d                |
| AllProperties:IPrimitive | p3d          | false     | 8     | p3d      | p3d  | undefined    | point3d  | Point3d  | p3d                |

| i   | l    | d   | b    | dt                      | s    | bin        | p2d                     | p3d                            |
| --- | ---- | --- | ---- | ----------------------- | ---- | ---------- | ----------------------- | ------------------------------ |
| 100 | 1000 | 0.1 | true | 2017-01-01T00:00:00.000 | str0 | BIN(1,2,3) | {"X": 1.034,"Y": 2.034} | {"X": -1,"Y": 2.3,"Z": 3.0001} |
| 102 | 1002 | 2.1 | true | 2017-01-01T00:00:00.000 | str2 | BIN(1,2,3) | {"X": 1.034,"Y": 2.034} | {"X": -1,"Y": 2.3,"Z": 3.0001} |

# Select all properties from TestElement which is Not between 2 TIMESTAMP value expression

- dataset: AllProperties.dtw

```sql
SELECT
  i,
  l,
  d,
  b,
  dt,
  s,
  bin,
  p2d,
  p3d
FROM
  aps.TestElement
WHERE
  dt NOT BETWEEN TIMESTAMP '2017-01-01 00:00:00' AND TIMESTAMP  '2017-01-01 00:00:00'
LIMIT
  2
```

| className                | accessString | generated | index | jsonName | name | extendedType | typeName | type     | originPropertyName |
| ------------------------ | ------------ | --------- | ----- | -------- | ---- | ------------ | -------- | -------- | ------------------ |
| AllProperties:IPrimitive | i            | false     | 0     | i        | i    | undefined    | int      | Int      | i                  |
| AllProperties:IPrimitive | l            | false     | 1     | l        | l    | undefined    | long     | Int64    | l                  |
| AllProperties:IPrimitive | d            | false     | 2     | d        | d    | undefined    | double   | Double   | d                  |
| AllProperties:IPrimitive | b            | false     | 3     | b        | b    | undefined    | boolean  | Boolean  | b                  |
| AllProperties:IPrimitive | dt           | false     | 4     | dt       | dt   | undefined    | dateTime | DateTime | dt                 |
| AllProperties:IPrimitive | s            | false     | 5     | s        | s    | undefined    | string   | String   | s                  |
| AllProperties:IPrimitive | bin          | false     | 6     | bin      | bin  | undefined    | binary   | Blob     | bin                |
| AllProperties:IPrimitive | p2d          | false     | 7     | p2d      | p2d  | undefined    | point2d  | Point2d  | p2d                |
| AllProperties:IPrimitive | p3d          | false     | 8     | p3d      | p3d  | undefined    | point3d  | Point3d  | p3d                |

| i   | l    | d   | b    | dt                      | s    | bin                                | p2d                         | p3d                                      |
| --- | ---- | --- | ---- | ----------------------- | ---- | ---------------------------------- | --------------------------- | ---------------------------------------- |
| 101 | 1001 | 1.1 | true | 2010-01-01T11:11:11.000 | str1 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11,"Y": 2222.22} | {"X": -111.11,"Y": -222.22,"Z": -333.33} |
| 103 | 1003 | 3.1 | true | 2010-01-01T11:11:11.000 | str3 | BIN(11,21,31,34,53,21,14,14,55,22) | {"X": 1111.11,"Y": 2222.22} | {"X": -111.11,"Y": -222.22,"Z": -333.33} |
