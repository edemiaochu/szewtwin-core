/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMSqlExpr
 */

import { assert } from "chai";
import {
  AssignmentExpr,
  BetweenExpr,
  BinaryBooleanExpr,
  BinaryValueExpr,
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
  NavValueCreationFuncExpr,
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
  SubqueryExpr,
  SubqueryRefExpr,
  SubqueryTestExpr,
  TableValuedFuncExpr,
  UnaryValueExpr,
  UpdateStatementExpr,
  UsingRelationshipJoinExpr,
  WhereClauseExp,
} from "../DMSqlAst";

describe("DMSql AST", () => {
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
    assert.equal(ExprType.NavValueCreationFunc, NavValueCreationFuncExpr.type);
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
