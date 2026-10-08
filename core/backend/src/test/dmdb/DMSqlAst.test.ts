/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMSqlExpr
 */

import { assert } from "chai";
import { TestUtils } from "../TestUtils";
import {
  AssignmentExpr,
  BetweenExpr,
  BinaryBooleanExpr, BinaryValueExpr,
  CastExpr,
  ClassNameExpr,
  CteBlockExpr,
  CteBlockRefExpr,
  CteExpr,
  DeleteStatementExpr,
  DerivedPropertyExpr,
  DMSqlOptionsClauseExpr,
  Expr,
  ExprType,
  FromClauseExpr,
  FuncCallExpr,
  GroupByClauseExpr,
  HavingClauseExpr,
  IIFExpr,
  InExpr,
  InsertStatementExpr,
  IsNullExpr,
  IsOfTypeExpr,
  LikeExpr,
  LimitClauseExpr,
  LiteralExpr,
  LiteralValueType,
  MemberFuncCallExpr,
  NotExpr,
  OrderByClauseExpr,
  OrderBySpecExpr,
  ParameterExpr,
  PropertyNameExpr,
  QualifiedJoinExpr,
  SearchCaseExpr,
  SelectExpr,
  SelectionClauseExpr,
  SelectStatementExpr,
  SetClauseExpr,
  StatementExpr,
  SubqueryExpr,
  SubqueryRefExpr,
  SubqueryTestExpr,
  TableValuedFuncExpr,
  UnaryValueExpr,
  UpdateStatementExpr,
  UsingRelationshipJoinExpr,
  WhereClauseExp,
} from "@szewtwin/dmsql-common";
import { DMDb, DMDbOpenMode } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { DbResult } from "@szewtwin/core-szewec";

describe("DMSql Abstract Syntax Tree", () => {
  let dmdb: DMDb;

  async function toNormalizeDMSql(dmsql: string) {
    return (await parseDMSql(dmsql)).toDMSql();
  }

  async function parseDMSql(dmsql: string) {
    const parseTreeDMSql = `PRAGMA PARSE_TREE("${dmsql}") DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES`;
    if (true) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return dmdb.withPreparedStatement(parseTreeDMSql, (stmt) => {
        if (DbResult.BE_SQLITE_ROW !== stmt.step()) {
          throw new Error("unable to get parse tree.");
        }
        return StatementExpr.deserialize(JSON.parse(stmt.getValue(0).getString()));
      });
    } else {
      const reader = dmdb.createQueryReader(parseTreeDMSql);
      if (await reader.step()) {
        return StatementExpr.deserialize(JSON.parse(reader.current[0]));
      }
      throw new Error("unable to get parse tree.");
    }
  }

  function printTree(expr: Expr, indent: number = 0) {
    process.stdout.write(`${"".padEnd(indent, ".")}${expr.expType}${"".padEnd(30 - (indent + expr.expType.length), " ")}${expr.toDMSql()}\n`);
    indent += 3;
    for (const child of expr.children)
      printTree(child, indent);
  }

  before(async () => {
    await TestUtils.startBackend();
    dmdb = new DMDb();
    dmdb.openDb(IVaultTestUtils.resolveAssetFile("test.dtw"), DMDbOpenMode.ReadWrite);
  });

  after(async () => {
    dmdb.closeDb();
  });
  it("parse (|, &, <<, >>, +, -, %, /, *) binary & unary", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT (1 & 2 ) | (3 << 4 ) >> (5/ 6) * (7 + 8) + (4 % 9) + (-10) + (+20) - (~45)",
        expectedDMSql: "SELECT (((1 & 2) | (3 << 4)) >> ((((((5 / 6) * (7 + 8)) + (4 % 9)) + -10) + +20) - ~45))",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse DATE, TIME & TIMESTAMP", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT TIMESTAMP '2013-02-09T12:00:00'",
        expectedDMSql: "SELECT TIMESTAMP '2013-02-09T12:00:00'",
      },
      {
        orignalDMSql: "SELECT DATE '2012-01-18'",
        expectedDMSql: "SELECT DATE '2012-01-18'",
      },
      {
        orignalDMSql: "SELECT TIME '13:35:16'",
        expectedDMSql: "SELECT TIME '13:35:16'",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse NULL, NUMBER, STRING, TRUE, FALSE & ||", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT TRUE, FALSE",
        expectedDMSql: "SELECT TRUE, FALSE",
      },
      {
        orignalDMSql: "SELECT NULL",
        expectedDMSql: "SELECT NULL",
      },
      {
        orignalDMSql: "SELECT  3.14159265358",
        expectedDMSql: "SELECT 3.14159265358",
      },
      {
        orignalDMSql: "SELECT  314159",
        expectedDMSql: "SELECT 314159",
      },
      {
        orignalDMSql: "SELECT  'Hello, World'",
        expectedDMSql: "SELECT 'Hello, World'",
      },
      {
        orignalDMSql: "SELECT  'Hello'|| ',' || 'World'",
        expectedDMSql: "SELECT (('Hello' || ',') || 'World')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse (!=, =, >, <, >=, <=, OR, AND)", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF((1 != 2) OR (4 = 5) AND ( 4 > 8 ) OR (4 < 5) OR (4 <= 5) AND ( 4 >= 6 ), 'True', 'False')",
        expectedDMSql: "SELECT IIF(((((1 <> 2) OR ((4 = 5) AND (4 > 8))) OR (4 < 5)) OR ((4 <= 5) AND (4 >= 6))), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse CASE-WHEN-THEN", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT CASE WHEN 4>5 THEN NULL WHEN 1 IS NOT NULL THEN 'Hello' ELSE 'Bye' END",
        expectedDMSql: "SELECT CASE WHEN (4 > 5) THEN NULL WHEN (1 IS NOT NULL) THEN 'Hello' ELSE 'Bye' END",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse [NOT] LIKE", async () => {
    const tests = [
      {
        orignalDMSql: "select IIF(('Hello, World' LIKE '\\%World' escape '\\') , 2, 3)",
        expectedDMSql: "SELECT IIF('Hello, World' LIKE '\\%World' ESCAPE '\\', 2, 3)",
      },
      {
        orignalDMSql: "select IIF(('Hello, World' LIKE '%World') , 2, 3)",
        expectedDMSql: "SELECT IIF('Hello, World' LIKE '%World', 2, 3)",
      }
      ,
      {
        orignalDMSql: "select IIF(('Hello, World' NOT LIKE '%World') , 2, 3)",
        expectedDMSql: "SELECT IIF('Hello, World' NOT LIKE '%World', 2, 3)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse [NOT] IN(select|list)", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF( 3 IN (SELECT 1 AS N UNION SELECT 2), 'True', 'False')",
        expectedDMSql: "SELECT IIF(3 IN (SELECT 1 [N] UNION SELECT 2), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF( 3 IN (1,2,3), 'True', 'False')",
        expectedDMSql: "SELECT IIF(3 IN (1, 2, 3), 'True', 'False')",
      }
      ,
      {
        orignalDMSql: "SELECT IIF( 3 NOT IN (1,2,3), 'True', 'False')",
        expectedDMSql: "SELECT IIF(3 NOT IN (1, 2, 3), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse IS [NOT] NULL", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF( NULL IS NULL, 'True', 'False')",
        expectedDMSql: "SELECT IIF((NULL IS NULL), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF( NULL IS NOT NULL, 'True', 'False')",
        expectedDMSql: "SELECT IIF((NULL IS NOT NULL), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF( 1 IS NOT NULL, 'True', 'False')",
        expectedDMSql: "SELECT IIF((1 IS NOT NULL), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse IS [NOT] (type[,...])", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF( 3 IS (ALL meta.DMClassDef, ONLY meta.DMPropertyDef), 'True', 'False')",
        expectedDMSql: "SELECT IIF(3 IS (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF( 3 IS NOT (ALL meta.DMClassDef, ONLY meta.DMPropertyDef), 'True', 'False')",
        expectedDMSql: "SELECT IIF(3 IS NOT (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse (NOT expr)", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF(NOT 3, 'True', 'False')",
        expectedDMSql: "SELECT IIF((NOT 3), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF( (NOT (NOT (NOT (NOT 3)))), 'True', 'False')",
        expectedDMSql: "SELECT IIF((NOT (NOT (NOT (NOT 3)))), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse [NOT] EXISTS (<subquery>)", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT IIF(EXISTS(SELECT 1), 'True', 'False')",
        expectedDMSql: "SELECT IIF(EXISTS(SELECT 1), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF(EXISTS(WITH temp(x) AS (SELECT 1) SELECT * FROM temp), 'True', 'False')",
        expectedDMSql: "SELECT IIF(EXISTS(WITH [temp]([x]) AS (SELECT 1) SELECT [temp].[x] FROM [temp]), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF(NOT EXISTS(SELECT 1), 'True', 'False')",
        expectedDMSql: "SELECT IIF((NOT EXISTS(SELECT 1)), 'True', 'False')",
      },
      {
        orignalDMSql: "SELECT IIF(NOT EXISTS(WITH temp(x) AS (SELECT 1) SELECT * FROM temp), 'True', 'False')",
        expectedDMSql: "SELECT IIF((NOT EXISTS(WITH [temp]([x]) AS (SELECT 1) SELECT [temp].[x] FROM [temp])), 'True', 'False')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse CAST(<expr> AS [TEXT | INTEGER | REAL | BLOB | TIMESTAMP])", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT CAST(1 AS TEXT)",
        expectedDMSql: "SELECT CAST(1 AS TEXT)",
      },
      {
        orignalDMSql: "SELECT CAST(1 AS INTEGER)",
        expectedDMSql: "SELECT CAST(1 AS INTEGER)",
      },
      {
        orignalDMSql: "SELECT CAST(1 AS REAL)",
        expectedDMSql: "SELECT CAST(1 AS REAL)",
      },
      {
        orignalDMSql: "SELECT CAST(1 AS BLOB)",
        expectedDMSql: "SELECT CAST(1 AS BLOB)",
      },
      {
        orignalDMSql: "SELECT CAST(1 AS TIMESTAMP)",
        expectedDMSql: "SELECT CAST(1 AS TIMESTAMP)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse SELECT DISTINCT|ALL/SUM(DISTINCT|ALL <expr>) ", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT DMInstanceId FROM meta.DMClassDef",
        expectedDMSql: "SELECT [DMInstanceId] FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT DISTINCT DMInstanceId FROM meta.DMClassDef",
        expectedDMSql: "SELECT DISTINCT [DMInstanceId] FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT ALL DMInstanceId FROM meta.DMClassDef",
        expectedDMSql: "SELECT ALL [DMInstanceId] FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT SUM(DISTINCT DMInstanceId) FROM meta.DMClassDef",
        expectedDMSql: "SELECT SUM(DISTINCT [DMInstanceId]) FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT SUM(ALL DMInstanceId) FROM meta.DMClassDef",
        expectedDMSql: "SELECT SUM(ALL [DMInstanceId]) FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT SUM(DMInstanceId) FROM meta.DMClassDef",
        expectedDMSql: "SELECT SUM([DMInstanceId]) FROM [DMDbMeta].[DMClassDef]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse func(args...)", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT INSTR('First', 'Second')",
        expectedDMSql: "SELECT INSTR('First', 'Second')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse DMSQLOPTIONS", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef DMSQLOPTIONS NoDMClassIdFilter ReadonlyPropertiesAreUpdatable X=3",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] DMSQLOPTIONS NoDMClassIdFilter ReadonlyPropertiesAreUpdatable X = 3",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse Subquery", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT d.a FROM (SELECT b.Name a FROM meta.DMClassDef b) d",
        expectedDMSql: "SELECT [d].[a] FROM (SELECT [b].[Name] [a] FROM [DMDbMeta].[DMClassDef] [b]) [d]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse LIMIT <expr> [OFFSET <expr>]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef LIMIT 10+33",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] LIMIT (10 + 33)",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef LIMIT 10+33 OFFSET 44",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] LIMIT (10 + 33) OFFSET 44",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse GROUP BY [expr...] HAVING [expr...]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef GROUP BY Name",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] GROUP BY [Name]",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef GROUP BY [Name] HAVING COUNT(*)>2",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] GROUP BY [Name] HAVING (COUNT(*) > 2)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse ORDER BY [expr...]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef ORDER BY Name ASC, DMInstanceId DESC",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] ORDER BY [Name] ASC, [DMInstanceId] DESC",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef ORDER BY NAME, DISPLAYLABEL",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] ORDER BY [NAME], [DISPLAYLABEL]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse CTE", async () => {
    const tests = [
      {
        orignalDMSql: "WITH RECURSIVE c(i) AS (SELECT 1 UNION SELECT i+1 FROM c WHERE i < 10 ORDER BY 1) SELECT i FROM c",
        expectedDMSql: "WITH RECURSIVE [c]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [c] WHERE ([i] < 10) ORDER BY 1) SELECT [i] FROM [c]",
      },
      {
        orignalDMSql: "WITH c(i) AS (SELECT 1 UNION SELECT i+1 FROM c WHERE i < 10 ORDER BY 1) SELECT i FROM c",
        expectedDMSql: "WITH [c]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [c] WHERE ([i] < 10) ORDER BY 1) SELECT [i] FROM [c]",
      },
      {
        orignalDMSql: "WITH c(i) AS (SELECT 1 UNION SELECT i+1 FROM c WHERE i < 10 ORDER BY 1), d(i) AS (SELECT 1 UNION SELECT i+1 FROM d WHERE i < 100 ORDER BY 1) SELECT * FROM c,d",
        expectedDMSql: "WITH [c]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [c] WHERE ([i] < 10) ORDER BY 1), [d]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [d] WHERE ([i] < 100) ORDER BY 1) SELECT [c].[i], [d].[i] FROM [c], [d]",
      },
      {
        orignalDMSql: "WITH c(a,b,c) AS (SELECT DMInstanceId, DMClassId, Name FROM meta.DMClassDef) SELECT * FROM c",
        expectedDMSql: "WITH [c]([a], [b], [c]) AS (SELECT [DMInstanceId], [DMClassId], [Name] FROM [DMDbMeta].[DMClassDef]) SELECT [c].[a], [c].[b], [c].[c] FROM [c]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse $, $->prop", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT $ FROM Meta.DMClassDef",
        expectedDMSql: "SELECT $ FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT $->[Name], $-> DisplayLabel, $ -> Nothing FROM Meta.DMClassDef",
        expectedDMSql: "SELECT $->[Name], $->[DisplayLabel], $->[Nothing] FROM [DMDbMeta].[DMClassDef]",
      },
      // {
      //   orignalDMSql: "SELECT $->Name, $-> DisplayLabel, $ -> Nothing FROM Meta.DMClassDef WHERE $->Name LIKE '%Hellp' ORDER BY $->DMInstanceId DESC",
      //   expectedDMSql: "SELECT $->[Name], $->[DisplayLabel], $->[Nothing] FROM [DMDbMeta].[DMClassDef] WHERE $->[Name] LIKE '%Hellp' ORDER BY $->[DMInstanceId] DESC",
      // },
      {
        orignalDMSql: "SELECT e.$->[Name], e.$-> DisplayLabel, e.$ -> Nothing FROM Meta.DMClassDef e",
        expectedDMSql: "SELECT [e].$->[Name], [e].$->[DisplayLabel], [e].$->[Nothing] FROM [DMDbMeta].[DMClassDef] [e]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse ?, :<param-name>", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT ?",
        expectedDMSql: "SELECT ?",
      },
      {
        orignalDMSql: "SELECT :param1",
        expectedDMSql: "SELECT :param1",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse <from> JOIN <to> USING rel [FORWARD|BACKWARD]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef JOIN meta.DMPropertyDef USING meta.ClassOwnsLocalProperties",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] JOIN [DMDbMeta].[DMPropertyDef] USING [DMDbMeta].[ClassOwnsLocalProperties]",
      },
      {
        orignalDMSql: "SELECT 1 FROM bis.Element a JOIN bis.Element b USING bis.ElementOwnsChildElements FORWARD",
        expectedDMSql: "SELECT 1 FROM [BisCore].[Element] [a] JOIN [BisCore].[Element] [b] USING [BisCore].[ElementOwnsChildElements] FORWARD",
      },
      {
        orignalDMSql: "SELECT 1 FROM bis.Element a JOIN bis.Element b USING bis.ElementOwnsChildElements BACKWARD",
        expectedDMSql: "SELECT 1 FROM [BisCore].[Element] [a] JOIN [BisCore].[Element] [b] USING [BisCore].[ElementOwnsChildElements] BACKWARD",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse <from> [INNER] [OUTER] JOIN <to> [ON <exp>]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] INNER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef INNER JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] INNER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse <from> RIGHT [OUTER] JOIN <to> [ON <exp>]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef RIGHT JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] RIGHT OUTER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef RIGHT OUTER JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] RIGHT OUTER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse <from> FULL [OUTER] JOIN <to> [ON <exp>]", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef FULL JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] FULL OUTER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
      {
        orignalDMSql: "SELECT 1 FROM meta.DMClassDef FULL OUTER JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] FULL OUTER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse UNION | UNION ALL | INTERSECT | EXCEPT", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT a.DMInstanceId FROM meta.DMClassDef a UNION SELECT b.DMInstanceId FROM meta.DMPropertyDef b",
        expectedDMSql: "SELECT [a].[DMInstanceId] FROM [DMDbMeta].[DMClassDef] [a] UNION SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]",
      },
      {
        orignalDMSql: "SELECT a.DMInstanceId FROM meta.DMClassDef a UNION ALL SELECT b.DMInstanceId FROM meta.DMPropertyDef b",
        expectedDMSql: "SELECT [a].[DMInstanceId] FROM [DMDbMeta].[DMClassDef] [a] UNION ALL SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]",
      },
      {
        orignalDMSql: "SELECT a.DMInstanceId FROM meta.DMClassDef a INTERSECT SELECT b.DMInstanceId FROM meta.DMPropertyDef b",
        expectedDMSql: "SELECT [a].[DMInstanceId] FROM [DMDbMeta].[DMClassDef] [a] INTERSECT SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]",
      },
      {
        orignalDMSql: "SELECT a.DMInstanceId FROM meta.DMClassDef a EXCEPT SELECT b.DMInstanceId FROM meta.DMPropertyDef b",
        expectedDMSql: "SELECT [a].[DMInstanceId] FROM [DMDbMeta].[DMClassDef] [a] EXCEPT SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]",
      },

    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse cte without columns", async () => {
    const tests = [
      {
        orignalDMSql: "WITH cte AS (SELECT * FROM meta.DMClassDef) SELECT * FROM cte",
        expectedDMSql: "WITH [cte] AS (SELECT [DMInstanceId], [DMClassId], [Schema], [Name], [DisplayLabel], [Description], [Type], [Modifier], [CustomAttributeContainerType], [RelationshipStrength], [RelationshipStrengthDirection] FROM [DMDbMeta].[DMClassDef]) SELECT [DMInstanceId], [DMClassId], [Schema], [Name], [DisplayLabel], [Description], [Type], [Modifier], [CustomAttributeContainerType], [RelationshipStrength], [RelationshipStrengthDirection] FROM [cte]",
      },
      {
        orignalDMSql: "WITH cte AS (SELECT * FROM meta.DMClassDef) SELECT cte.DMInstanceId FROM cte",
        expectedDMSql: "WITH [cte] AS (SELECT [DMInstanceId], [DMClassId], [Schema], [Name], [DisplayLabel], [Description], [Type], [Modifier], [CustomAttributeContainerType], [RelationshipStrength], [RelationshipStrengthDirection] FROM [DMDbMeta].[DMClassDef]) SELECT [cte].[DMInstanceId] FROM [cte]",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse SELECT (<subquery>) FROM", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT (SELECT b.DMInstanceId FROM meta.DMPropertyDef b) AS S  FROM [DMDbMeta].[DMClassDef] a",
        expectedDMSql: "SELECT (SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]) [S] FROM [DMDbMeta].[DMClassDef] [a]",
      },
      {
        orignalDMSql: "SELECT (WITH C(iD) AS (SELECT b.DMInstanceId FROM meta.DMPropertyDef b) SELECT * FROM C) AS S  FROM [DMDbMeta].[DMClassDef] a",
        expectedDMSql: "SELECT (WITH [C]([iD]) AS (SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]) SELECT [C].[iD] FROM [C]) [S] FROM [DMDbMeta].[DMClassDef] [a]",
      },
      {
        orignalDMSql: "SELECT (SELECT 1 UNION SELECT 2) FROM meta.DMClassDef a",
        expectedDMSql: "SELECT (SELECT 1 UNION SELECT 2) FROM [DMDbMeta].[DMClassDef] [a]",
      },
      {
        orignalDMSql: "SELECT  1 FROM [DMDbMeta].[DMClassDef] [a] WHERE (SELECT [b].[DMInstanceId] FROM meta.DMPropertyDef b) = 1",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] [a] WHERE ((SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]) = 1)",
      },
      {
        orignalDMSql: "SELECT  1 FROM [DMDbMeta].[DMClassDef] [a] WHERE (WITH temp(Id) AS (SELECT [b].[DMInstanceId] FROM meta.DMPropertyDef b) SELECT * FROM temp) = 1",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef] [a] WHERE ((WITH [temp]([Id]) AS (SELECT [b].[DMInstanceId] FROM [DMDbMeta].[DMPropertyDef] [b]) SELECT [temp].[Id] FROM [temp]) = 1)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse ALL | ONLY <classname>", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef]",
        expectedDMSql: "SELECT 1 FROM [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT 1 FROM ONLY [DMDbMeta].[DMClassDef]",
        expectedDMSql: "SELECT 1 FROM ONLY [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT 1 FROM ALL [DMDbMeta].[DMClassDef]",
        expectedDMSql: "SELECT 1 FROM ALL [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT 1 FROM +ALL [DMDbMeta].[DMClassDef]",
        expectedDMSql: "SELECT 1 FROM +ALL [DMDbMeta].[DMClassDef]",
      },
      {
        orignalDMSql: "SELECT 1 FROM +ONLY [DMDbMeta].[DMClassDef]",
        expectedDMSql: "SELECT 1 FROM +ONLY [DMDbMeta].[DMClassDef]",
      },

    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse tablevalue function FROM json1.json_tree()", async () => {
    const tests = [
      {
        orignalDMSql: "select * from  json1.json_tree('{}') where key='gravity'",
        expectedDMSql: "SELECT [key], [value], [type], [atom], [parent], [fullkey], [path] FROM [json1].[json_tree]('{}') WHERE ([key] = 'gravity')",
      },
      {
        orignalDMSql: "select s.key, s.[value], s.type from  json1.json_tree('{}') s where s.key='gravity'",
        expectedDMSql: "SELECT [s].[key], [s].[value], [s].[type] FROM [json1].[json_tree]('{}') [s] WHERE ([s].[key] = 'gravity')",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse SELECT, WHERE, FROM, GROUP BY, HAVING, ORDER BY, LIMIT & DMSQLOPTIONS", async () => {
    const tests = [
      {
        orignalDMSql: "select count(*) from bis.element where codevalue lIKE '%s' group by dmclassid having count(*)>0 order by UserLabel limit 1 offset 10 DMSQLOPTIONS x=3",
        expectedDMSql: "SELECT COUNT(*) FROM [BisCore].[Element] WHERE [codevalue] LIKE '%s' GROUP BY [dmclassid] HAVING (COUNT(*) > 0) ORDER BY [UserLabel] LIMIT 1 OFFSET 10 DMSQLOPTIONS x = 3",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse INSERT", async () => {
    const tests = [
      {
        orignalDMSql: "INSERT INTO Bis.Subject(DMInstanceId) VALUES(1)",
        expectedDMSql: "INSERT INTO [BisCore].[Subject] ([DMInstanceId]) VALUES(1)",
      },
      {
        orignalDMSql: "INSERT INTO ONLY Bis.Subject(DMInstanceId) VALUES(1)",
        expectedDMSql: "INSERT INTO [BisCore].[Subject] ([DMInstanceId]) VALUES(1)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse DELETE", async () => {
    const tests = [
      {
        orignalDMSql: "DELETE FROM Bis.Subject WHERE DMInstanceId = 1",
        expectedDMSql: "DELETE FROM [BisCore].[Subject] WHERE ([DMInstanceId] = 1)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse UPDATE", async () => {
    const tests = [
      {
        orignalDMSql: "UPDATE Bis.Subject SET CodeValue ='hello' WHERE DMInstanceId =1",
        expectedDMSql: "UPDATE [BisCore].[Subject] SET [CodeValue] = 'hello' WHERE ([DMInstanceId] = 1)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse NAVIGATION_VALUE", async () => {
    const tests = [
      {
        orignalDMSql: "SELECT NAVIGATION_VALUE(Bis.Element.Model, 1)",
        expectedDMSql: "SELECT NAVIGATION_VALUE([BisCore].[Element].[Model], 1)",
      },
      {
        orignalDMSql: "SELECT NAVIGATION_VALUE(Bis.Element.Model, 1, 2)",
        expectedDMSql: "SELECT NAVIGATION_VALUE([BisCore].[Element].[Model], 1, 2)",
      },
    ];
    for (const test of tests) {
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.orignalDMSql));
      assert.equal(test.expectedDMSql, await toNormalizeDMSql(test.expectedDMSql));
    }
  });
  it("parse complex query", async () => {
    const dmsql = `
    WITH RECURSIVE
      f0(i) AS (SELECT 1 UNION SELECT i+1 FROM f0 WHERE i < 10 ORDER BY 1),
      f1(i) AS (SELECT 3.14159265358),
      f2(i) AS (SELECT IIF((1 != 2) OR (4 = 5) AND ( 4 > 8 ) OR (4 < 5) OR (4 <= 5) AND ( 4 >= 6 ), 'True', 'False') i),
      f3(i) AS (SELECT 1 FROM bis.Element t0 JOIN bis.Element t1 USING bis.ElementOwnsChildElements FORWARD),
      f4(i) AS (SELECT 1 FROM bis.Element t0 JOIN bis.Element t1 USING bis.ElementOwnsChildElements BACKWARD),
      f5(i) AS (
        SELECT 1 FROM meta.DMClassDef
          JOIN meta.DMPropertyDef ON DMPropertyDef.Class.Id = DMClassDef.DMInstanceId
          WHERE DMClassDef.DMInstanceId = :param1
      )
      SELECT
        (1 & 2 ) | (3 << 4 ) >> (5/ 6) * (7 + 8) + (4 % 9) + (-10) + (+20) - (~45) c0,
        TIMESTAMP '2013-02-09T12:00:00' c1,
        DATE '2012-01-18' c2,
        TIME '13:35:16' c3,
        TRUE c4,
        FALSE c5,
        3.14159265358 c6,
        314159 c7,
        'Hello, World' c8,
        'Hello'|| ',' || 'World' c9,
        IIF((1 != 2) OR (4 = 5) AND ( 4 > 8 ) OR (4 < 5) OR (4 <= 5) AND ( 4 >= 6 ), 'True', 'False') c10,
        CASE WHEN 4>5 THEN NULL WHEN 1 IS NOT NULL THEN 'Hello' ELSE 'Bye' END  c11,
        IIF(('Hello, World' LIKE '\\%World' escape '\\') , 2, 3)  c12,
        IIF(('Hello, World' LIKE '%World') , 2, 3)  c13,
        IIF(('Hello, World' NOT LIKE '%World') , 2, 3)  c14,
        IIF( 3 IN (SELECT 1 AS N UNION SELECT 2), 'True', 'False')  c15,
        IIF( 3 IN (1,2,3), 'True', 'False') c16,
        IIF( 3 NOT IN (1,2,3), 'True', 'False')  c17,
        IIF( NULL IS NULL, 'True', 'False')  c18,
        IIF( NULL IS NOT NULL, 'True', 'False')  c19,
        IIF( 1 IS NOT NULL, 'True', 'False')  c20,
        IIF( 3 IS (ALL meta.DMClassDef, ONLY meta.DMPropertyDef), 'True', 'False') c21,
        IIF( 3 IS NOT (ALL meta.DMClassDef, ONLY meta.DMPropertyDef), 'True', 'False') c22,
        IIF(NOT 3, 'True', 'False') c23,
        IIF( (NOT (NOT (NOT (NOT 3)))), 'True', 'False') c24,
        IIF(EXISTS(SELECT 1), 'True', 'False') c25,
        IIF(NOT EXISTS(SELECT 1), 'True', 'False') c26,
        CAST(1 AS TEXT) c27,
        CAST(1 AS INTEGER) c28,
        CAST(1 AS REAL) c29,
        CAST(1 AS BLOB) c30,
        CAST(1 AS TIMESTAMP) c31,
        INSTR('First', 'Second') c32,
        f0.i  c33,
        f1.i  c34,
        f2.i  c35,
        k0.DMInstanceId c36
      FROM f0, f1, f2, f3, f4, f5, meta.DMClassDef k0, (
        SELECT DMInstanceId FROM meta.DMClassDef
        UNION
        SELECT DISTINCT DMInstanceId FROM meta.DMClassDef
        UNION ALL
        SELECT ALL DMInstanceId FROM meta.DMClassDef
        EXCEPT
        SELECT SUM(DISTINCT DMInstanceId) FROM meta.DMClassDef
        INTERSECT
        SELECT SUM(DMInstanceId) FROM meta.DMClassDef GROUP BY DMClassId HAVING COUNT(*)> 1
      ) k1
      WHERE f0.i = f1.i AND k0.DMInstanceId = ? + 2
      GROUP BY k0.DMClassId,k0.DisplayLabel HAVING COUNT(*)> 1
      ORDER BY k0.Name ASC, k0.DMInstanceId DESC
      LIMIT 33 OFFSET ? + :param2
      DMSQLOPTIONS NoDMClassIdFilter ReadonlyPropertiesAreUpdatable X=3`;
    /** expected result (indented for readablity)
     * WITH RECURSIVE
        [f0]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [f0] WHERE ([i] < 10) ORDER BY 1),
        [f1]([i]) AS (SELECT 3.14159265358),
        [f2]([i]) AS (SELECT IIF(((((1 <> 2) OR ((4 = 5) AND (4 > 8))) OR (4 < 5)) OR ((4 <= 5) AND (4 >= 6))), 'True', 'False') [i]),
        [f3]([i]) AS (SELECT 1 FROM [BisCore].[Element] [t0] JOIN [BisCore].[Element] [t1] USING [BisCore].[ElementOwnsChildElements] FORWARD),
        [f4]([i]) AS (SELECT 1 FROM [BisCore].[Element] [t0] JOIN [BisCore].[Element] [t1] USING [BisCore].[ElementOwnsChildElements] BACKWARD),
        [f5]([i]) AS (
          SELECT 1 FROM [DMDbMeta].[DMClassDef]
          INNER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId])
          WHERE ([DMClassDef].[DMInstanceId] = :param1)
        )
        SELECT
          (((1 & 2) | (3 << 4)) >> ((((((5 / 6) * (7 + 8)) + (4 % 9)) + -10) + +20) - ~45)) [c0],
          TIMESTAMP '2013-02-09T12:00:00' [c1],
          DATE '2012-01-18' [c2],
          TIME '13:35:16' [c3],
          TRUE [c4],
          FALSE [c5],
          3.14159265358 [c6],
          314159 [c7],
          'Hello, World' [c8],
          (('Hello' || ',') || 'World') [c9],
          IIF(((((1 <> 2) OR ((4 = 5) AND (4 > 8))) OR (4 < 5)) OR ((4 <= 5) AND (4 >= 6))), 'True', 'False') [c10],
          CASE WHEN (4 > 5) THEN NULL WHEN (1 IS NOT NULL) THEN 'Hello' ELSE 'Bye' END [c11],
          IIF('Hello, World' LIKE '\%World' ESCAPE '\', 2, 3) [c12],
          IIF('Hello, World' LIKE '%World', 2, 3) [c13],
          IIF('Hello, World' NOT LIKE '%World', 2, 3) [c14],
          IIF(3 IN (SELECT 1 [N] UNION SELECT 2), 'True', 'False') [c15],
          IIF(3 IN (1, 2, 3), 'True', 'False') [c16], IIF(3 NOT IN (1, 2, 3), 'True', 'False') [c17],
          IIF((NULL IS NULL), 'True', 'False') [c18], IIF((NULL IS NOT NULL), 'True', 'False') [c19],
          IIF((1 IS NOT NULL), 'True', 'False') [c20],
          IIF(3 IS (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False') [c21],
          IIF(3 IS NOT (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False') [c22],
          IIF((NOT 3), 'True', 'False') [c23], IIF((NOT (NOT (NOT (NOT 3)))), 'True', 'False') [c24],
          IIF(EXISTS(SELECT 1), 'True', 'False') [c25], IIF((NOT EXISTS(SELECT 1)), 'True', 'False') [c26],
          CAST(1 AS TEXT) [c27],
          CAST(1 AS INTEGER) [c28],
          CAST(1 AS REAL) [c29],
          CAST(1 AS BLOB) [c30],
          CAST(1 AS TIMESTAMP) [c31],
          INSTR('First', 'Second') [c32],
          [f0].[i] [c33],
          [f1].[i] [c34],
          [f2].[i] [c35],
          [k0].[DMInstanceId] [c36]
        FROM [f0], [f1], [f2], [f3], [f4], [f5], [DMDbMeta].[DMClassDef] [k0],
          (SELECT [DMInstanceId] FROM [DMDbMeta].[DMClassDef]
          UNION SELECT DISTINCT [DMInstanceId] FROM [DMDbMeta].[DMClassDef]
          UNION ALL SELECT ALL [DMInstanceId] FROM [DMDbMeta].[DMClassDef]
          EXCEPT SELECT SUM(DISTINCT [DMInstanceId]) FROM [DMDbMeta].[DMClassDef]
          INTERSECT SELECT SUM([DMInstanceId]) FROM [DMDbMeta].[DMClassDef]
            GROUP BY [DMClassId] HAVING (COUNT(*) > 1)) [k1]
            WHERE (([f0].[i] = [f1].[i]) AND ([k0].[DMInstanceId] = (? + 2))
          )
        GROUP BY [k0].[DMClassId], [k0].[DisplayLabel]
        HAVING (COUNT(*) > 1)
        ORDER BY [k0].[Name] ASC, [k0].[DMInstanceId] DESC LIMIT 33 OFFSET (? + :param2)
        DMSQLOPTIONS NoDMClassIdFilter ReadonlyPropertiesAreUpdatable X = 3
     */
    const expected = "WITH RECURSIVE [f0]([i]) AS (SELECT 1 UNION SELECT ([i] + 1) FROM [f0] WHERE ([i] < 10) ORDER BY 1), [f1]([i]) AS (SELECT 3.14159265358), [f2]([i]) AS (SELECT IIF(((((1 <> 2) OR ((4 = 5) AND (4 > 8))) OR (4 < 5)) OR ((4 <= 5) AND (4 >= 6))), 'True', 'False') [i]), [f3]([i]) AS (SELECT 1 FROM [BisCore].[Element] [t0] JOIN [BisCore].[Element] [t1] USING [BisCore].[ElementOwnsChildElements] FORWARD), [f4]([i]) AS (SELECT 1 FROM [BisCore].[Element] [t0] JOIN [BisCore].[Element] [t1] USING [BisCore].[ElementOwnsChildElements] BACKWARD), [f5]([i]) AS (SELECT 1 FROM [DMDbMeta].[DMClassDef] INNER JOIN [DMDbMeta].[DMPropertyDef] ON ([DMPropertyDef].[Class].[Id] = [DMClassDef].[DMInstanceId]) WHERE ([DMClassDef].[DMInstanceId] = :param1)) SELECT (((1 & 2) | (3 << 4)) >> ((((((5 / 6) * (7 + 8)) + (4 % 9)) + -10) + +20) - ~45)) [c0], TIMESTAMP '2013-02-09T12:00:00' [c1], DATE '2012-01-18' [c2], TIME '13:35:16' [c3], TRUE [c4], FALSE [c5], 3.14159265358 [c6], 314159 [c7], 'Hello, World' [c8], (('Hello' || ',') || 'World') [c9], IIF(((((1 <> 2) OR ((4 = 5) AND (4 > 8))) OR (4 < 5)) OR ((4 <= 5) AND (4 >= 6))), 'True', 'False') [c10], CASE WHEN (4 > 5) THEN NULL WHEN (1 IS NOT NULL) THEN 'Hello' ELSE 'Bye' END [c11], IIF('Hello, World' LIKE '\\%World' ESCAPE '\\', 2, 3) [c12], IIF('Hello, World' LIKE '%World', 2, 3) [c13], IIF('Hello, World' NOT LIKE '%World', 2, 3) [c14], IIF(3 IN (SELECT 1 [N] UNION SELECT 2), 'True', 'False') [c15], IIF(3 IN (1, 2, 3), 'True', 'False') [c16], IIF(3 NOT IN (1, 2, 3), 'True', 'False') [c17], IIF((NULL IS NULL), 'True', 'False') [c18], IIF((NULL IS NOT NULL), 'True', 'False') [c19], IIF((1 IS NOT NULL), 'True', 'False') [c20], IIF(3 IS (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False') [c21], IIF(3 IS NOT (ALL [DMDbMeta].[DMClassDef], ONLY [DMDbMeta].[DMPropertyDef]), 'True', 'False') [c22], IIF((NOT 3), 'True', 'False') [c23], IIF((NOT (NOT (NOT (NOT 3)))), 'True', 'False') [c24], IIF(EXISTS(SELECT 1), 'True', 'False') [c25], IIF((NOT EXISTS(SELECT 1)), 'True', 'False') [c26], CAST(1 AS TEXT) [c27], CAST(1 AS INTEGER) [c28], CAST(1 AS REAL) [c29], CAST(1 AS BLOB) [c30], CAST(1 AS TIMESTAMP) [c31], INSTR('First', 'Second') [c32], [f0].[i] [c33], [f1].[i] [c34], [f2].[i] [c35], [k0].[DMInstanceId] [c36] FROM [f0], [f1], [f2], [f3], [f4], [f5], [DMDbMeta].[DMClassDef] [k0], (SELECT [DMInstanceId] FROM [DMDbMeta].[DMClassDef] UNION SELECT DISTINCT [DMInstanceId] FROM [DMDbMeta].[DMClassDef] UNION ALL SELECT ALL [DMInstanceId] FROM [DMDbMeta].[DMClassDef] EXCEPT SELECT SUM(DISTINCT [DMInstanceId]) FROM [DMDbMeta].[DMClassDef] INTERSECT SELECT SUM([DMInstanceId]) FROM [DMDbMeta].[DMClassDef] GROUP BY [DMClassId] HAVING (COUNT(*) > 1)) [k1] WHERE (([f0].[i] = [f1].[i]) AND ([k0].[DMInstanceId] = (? + 2))) GROUP BY [k0].[DMClassId], [k0].[DisplayLabel] HAVING (COUNT(*) > 1) ORDER BY [k0].[Name] ASC, [k0].[DMInstanceId] DESC LIMIT 33 OFFSET (? + :param2) DMSQLOPTIONS NoDMClassIdFilter ReadonlyPropertiesAreUpdatable X = 3";
    assert.equal(expected, await toNormalizeDMSql(dmsql));
  });
  describe("test methods", () => {
    it("test Expr.findInstancesOf<T>()", async () => {
      const stmt = new SelectStatementExpr(
        new SelectExpr(
          new SelectionClauseExpr([
            new DerivedPropertyExpr(
              new PropertyNameExpr("DMInstanceId")),
            new DerivedPropertyExpr(
              new PropertyNameExpr("CodeValue"))]),
          "ALL",
          new FromClauseExpr([
            new ClassNameExpr("bis", "Element"),
          ]),
          new WhereClauseExp(
            new BinaryBooleanExpr(
              "=",
              new PropertyNameExpr("DMInstanceId"),
              new LiteralExpr(LiteralValueType.Raw, "1")))),
      );
      const expected = "SELECT ALL [DMInstanceId], [CodeValue] FROM [bis].[Element] WHERE ([DMInstanceId] = 1)";
      assert.equal(stmt.toDMSql(), expected);
      assert.equal(stmt.findInstancesOf<SelectExpr>(SelectExpr).length, 1);
      assert.equal(stmt.findInstancesOf<SelectionClauseExpr>(SelectionClauseExpr).length, 1);
      assert.equal(stmt.findInstancesOf<DerivedPropertyExpr>(DerivedPropertyExpr).length, 2);
      assert.equal(stmt.findInstancesOf<PropertyNameExpr>(PropertyNameExpr).length, 3);
      assert.equal(stmt.findInstancesOf<WhereClauseExp>(WhereClauseExp).length, 1);
      assert.equal(stmt.findInstancesOf<BinaryBooleanExpr>(BinaryBooleanExpr).length, 1);
      assert.equal(stmt.findInstancesOf<LiteralExpr>(LiteralExpr).length, 1);
      assert.equal(stmt.findInstancesOf<ClassNameExpr>(ClassNameExpr).length, 1);
      assert.equal(stmt.findInstancesOf<FromClauseExpr>(FromClauseExpr).length, 1);
    });
    it("test Expr.traverse()", async () => {
      const stmt = new SelectStatementExpr(
        new SelectExpr(
          new SelectionClauseExpr([
            new DerivedPropertyExpr(
              new PropertyNameExpr("DMInstanceId")),
            new DerivedPropertyExpr(
              new PropertyNameExpr("CodeValue"))]),
          undefined,
          new FromClauseExpr([
            new ClassNameExpr("bis", "Element"),
          ]),
          new WhereClauseExp(
            new BinaryBooleanExpr(
              "=",
              new PropertyNameExpr("DMInstanceId"),
              new ParameterExpr()))),
      );
      const expected = "SELECT [DMInstanceId], [CodeValue] FROM [bis].[Element] WHERE ([DMInstanceId] = ?)";
      assert.equal(stmt.toDMSql(), expected);
      const exprs: Expr[] = [];
      stmt.traverse((expr) => {
        exprs.push(expr);
      });
      assert.equal(exprs[0].expType, ExprType.SelectStatement);
      assert.equal(exprs[1].expType, ExprType.Select);
      assert.equal(exprs[2].expType, ExprType.SelectionClause);
      assert.equal(exprs[3].expType, ExprType.DerivedProperty);
      assert.equal(exprs[4].expType, ExprType.PropertyName);
      assert.equal(exprs[5].expType, ExprType.DerivedProperty);
      assert.equal(exprs[6].expType, ExprType.PropertyName);
      assert.equal(exprs[7].expType, ExprType.FromClause);
      assert.equal(exprs[8].expType, ExprType.ClassName);
      assert.equal(exprs[9].expType, ExprType.WhereClause);
      assert.equal(exprs[10].expType, ExprType.BinaryBoolean);
      assert.equal(exprs[11].expType, ExprType.PropertyName);
      assert.equal(exprs[12].expType, ExprType.Parameter);
      assert.equal(exprs.length, 13);
    });
    it("test Expr.type", async () => {
      assert.equal(ExprType.Assignment, AssignmentExpr.type);
      assert.equal(ExprType.Between, BetweenExpr.type);
      assert.equal(ExprType.BinaryBoolean, BinaryBooleanExpr.type);
      assert.equal(ExprType.BinaryValue, BinaryValueExpr.type);
      assert.equal(ExprType.Cast, CastExpr.type);
      assert.equal(ExprType.ClassName, ClassNameExpr.type);
      assert.equal(ExprType.Cte, CteExpr.type);
      assert.equal(ExprType.CteBlock, CteBlockExpr.type);
      assert.equal(ExprType.CteBlockRef, CteBlockRefExpr.type);
      assert.equal(ExprType.DeleteStatement, DeleteStatementExpr.type);
      assert.equal(ExprType.DerivedProperty, DerivedPropertyExpr.type);
      assert.equal(ExprType.DMSqlOptionsClause, DMSqlOptionsClauseExpr.type);
      assert.equal(ExprType.FromClause, FromClauseExpr.type);
      assert.equal(ExprType.FuncCall, FuncCallExpr.type);
      assert.equal(ExprType.GroupByClause, GroupByClauseExpr.type);
      assert.equal(ExprType.HavingClause, HavingClauseExpr.type);
      assert.equal(ExprType.IIF, IIFExpr.type);
      assert.equal(ExprType.In, InExpr.type);
      assert.equal(ExprType.InsertStatement, InsertStatementExpr.type);
      assert.equal(ExprType.IsNull, IsNullExpr.type);
      assert.equal(ExprType.IsOfType, IsOfTypeExpr.type);
      assert.equal(ExprType.Like, LikeExpr.type);
      assert.equal(ExprType.LimitClause, LimitClauseExpr.type);
      assert.equal(ExprType.Literal, LiteralExpr.type);
      assert.equal(ExprType.MemberFuncCall, MemberFuncCallExpr.type);
      assert.equal(ExprType.Not, NotExpr.type);
      assert.equal(ExprType.OrderByClause, OrderByClauseExpr.type);
      assert.equal(ExprType.OrderBySpec, OrderBySpecExpr.type);
      assert.equal(ExprType.Parameter, ParameterExpr.type);
      assert.equal(ExprType.PropertyName, PropertyNameExpr.type);
      assert.equal(ExprType.QualifiedJoin, QualifiedJoinExpr.type);
      assert.equal(ExprType.SearchCase, SearchCaseExpr.type);
      assert.equal(ExprType.Select, SelectExpr.type);
      assert.equal(ExprType.SelectionClause, SelectionClauseExpr.type);
      assert.equal(ExprType.SelectStatement, SelectStatementExpr.type);
      assert.equal(ExprType.SetClause, SetClauseExpr.type);
      assert.equal(ExprType.Subquery, SubqueryExpr.type);
      assert.equal(ExprType.SubqueryRef, SubqueryRefExpr.type);
      assert.equal(ExprType.SubqueryTest, SubqueryTestExpr.type);
      assert.equal(ExprType.TableValuedFunc, TableValuedFuncExpr.type);
      assert.equal(ExprType.Unary, UnaryValueExpr.type);
      assert.equal(ExprType.UpdateStatement, UpdateStatementExpr.type);
      assert.equal(ExprType.UsingRelationshipJoin, UsingRelationshipJoinExpr.type);
      assert.equal(ExprType.WhereClause, WhereClauseExp.type);
    });
    it.skip("test print tree", async () => {
      const dmsql = "select el.DMInstanceId as id, count(*) as instances from bis.element el where el.codevalue lIKE '%s' group by el.dmclassid having count(*)>0 order by el.UserLabel limit 1 offset 10 DMSQLOPTIONS x=3";
      const selectStmt = await parseDMSql(dmsql);
      printTree(selectStmt);

    });
    it("test ClassNameExpr.fromDMSql()", async () => {
      assert.equal(ClassNameExpr.fromDMSql("+all Bis.Element").toDMSql(), "+ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("+all Bis:Element").toDMSql(), "+ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("+only Bis.Element").toDMSql(), "+ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("+only Bis:Element").toDMSql(), "+ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" + all  Bis.Element ").toDMSql(), "+ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" + all  Bis:Element ").toDMSql(), "+ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  Bis.Element ").toDMSql(), "+ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  Bis:Element ").toDMSql(), "+ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" all  Bis.Element ").toDMSql(), "ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" all  Bis:Element ").toDMSql(), "ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" only  Bis.Element ").toDMSql(), "ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" only  Bis:Element ").toDMSql(), "ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("all Bis.Element").toDMSql(), "ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("all Bis:Element").toDMSql(), "ALL [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("only Bis.Element").toDMSql(), "ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("only Bis:Element").toDMSql(), "ONLY [Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("Bis:Element").toDMSql(), "[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("Bis.Element").toDMSql(), "[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("[Bis]:[Element]").toDMSql(), "[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("[Bis].[Element]").toDMSql(), "[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("tbl.Bis:Element").toDMSql(), "[tbl].[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("tbl.Bis.Element").toDMSql(), "[tbl].[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("[tbl].[Bis]:[Element]").toDMSql(), "[tbl].[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql("[tbl]:[Bis].[Element]").toDMSql(), "[tbl].[Bis].[Element]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  Bis.Element as el").toDMSql(), "+ONLY [Bis].[Element] [el]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  Bis:Element  el ").toDMSql(), "+ONLY [Bis].[Element] [el]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  tbl:Bis.Element as el").toDMSql(), "+ONLY [tbl].[Bis].[Element] [el]");
      assert.equal(ClassNameExpr.fromDMSql(" + only  tbl:Bis:Element  el ").toDMSql(), "+ONLY [tbl].[Bis].[Element] [el]");
    });
  });
});
