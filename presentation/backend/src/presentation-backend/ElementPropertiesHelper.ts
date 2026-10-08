/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { bufferCount, defer, from, groupBy, map, mergeMap, Observable, ObservedValueOf, of, range, reduce } from "rxjs";
import { IVaultDb } from "@szewtwin/core-backend";
import { Id64, Id64Array, Id64String, OrderedId64Iterable } from "@szewtwin/core-szewec";
import { QueryRowProxy } from "@szewtwin/core-common";
import {
  ContentDescriptorRequestOptions,
  ContentRequestOptions,
  Descriptor,
  Item,
  KeySet,
  PresentationError,
  PresentationStatus,
  Ruleset,
  RulesetVariable,
} from "@szewtwin/presentation-common";

/** @internal */
export function parseFullClassName(fullClassName: string): [string, string] {
  const [schemaName, className] = fullClassName.split(/[:\.]/);
  return [schemaName, className];
}

function getDMSqlName(fullClassName: string) {
  const [schemaName, className] = parseFullClassName(fullClassName);
  return `[${schemaName}].[${className}]`;
}

/** @internal */
export function getContentItemsObservableFromElementIds(
  ivault: IVaultDb,
  contentDescriptorGetter: (
    partialProps: Pick<ContentDescriptorRequestOptions<IVaultDb, KeySet, RulesetVariable>, "rulesetOrId" | "keys">,
  ) => Promise<Descriptor | undefined>,
  contentSetGetter: (
    partialProps: Pick<ContentRequestOptions<IVaultDb, Descriptor, KeySet, RulesetVariable>, "rulesetOrId" | "keys" | "descriptor">,
  ) => Promise<Item[]>,
  elementIds: Id64String[],
  classParallelism: number,
  batchesParallelism: number,
  batchSize: number,
): { itemBatches: Observable<{ descriptor: Descriptor; items: Item[] }>; count: Observable<number> } {
  return {
    itemBatches: getElementClassesFromIds(ivault, elementIds).pipe(
      mergeMap(
        ({ classFullName, ids }) =>
          getBatchedClassContentItems(
            classFullName,
            contentDescriptorGetter,
            contentSetGetter,
            () => createIdBatches(OrderedId64Iterable.sortArray(ids), batchSize),
            batchesParallelism,
          ),
        classParallelism,
      ),
    ),
    count: of(elementIds.length),
  };
}

/** @internal */
export function getContentItemsObservableFromClassNames(
  ivault: IVaultDb,
  contentDescriptorGetter: (
    partialProps: Pick<ContentDescriptorRequestOptions<IVaultDb, KeySet, RulesetVariable>, "rulesetOrId" | "keys">,
  ) => Promise<Descriptor | undefined>,
  contentSetGetter: (
    partialProps: Pick<ContentRequestOptions<IVaultDb, Descriptor, KeySet, RulesetVariable>, "rulesetOrId" | "keys" | "descriptor">,
  ) => Promise<Item[]>,
  elementClasses: string[],
  classParallelism: number,
  batchesParallelism: number,
  batchSize: number,
): { itemBatches: Observable<{ descriptor: Descriptor; items: Item[] }>; count: Observable<number> } {
  return {
    itemBatches: getClassesWithInstances(ivault, elementClasses).pipe(
      mergeMap(
        (classFullName) =>
          getBatchedClassContentItems(
            classFullName,
            contentDescriptorGetter,
            contentSetGetter,
            () => getBatchedClassElementIds(ivault, classFullName, batchSize),
            batchesParallelism,
          ),
        classParallelism,
      ),
    ),
    count: from(getElementsCount(ivault, elementClasses)),
  };
}

function getBatchedClassContentItems(
  classFullName: string,
  contentDescriptorGetter: (
    partialProps: Pick<ContentDescriptorRequestOptions<IVaultDb, KeySet, RulesetVariable>, "rulesetOrId" | "keys">,
  ) => Promise<Descriptor | undefined>,
  contentSetGetter: (
    partialProps: Pick<ContentRequestOptions<IVaultDb, Descriptor, KeySet, RulesetVariable>, "rulesetOrId" | "keys" | "descriptor">,
  ) => Promise<Item[]>,
  batcher: () => Observable<Array<{ from: Id64String; to: Id64String }>>,
  batchesParallelism: number,
): Observable<{ descriptor: Descriptor; items: Item[] }> {
  return defer(async () => {
    const ruleset = createClassContentRuleset(classFullName);
    const keys = new KeySet();
    const descriptor = await contentDescriptorGetter({ rulesetOrId: ruleset, keys });
    if (!descriptor) {
      throw new PresentationError(PresentationStatus.Error, `Failed to get descriptor for class ${classFullName}`);
    }
    return { descriptor, keys, ruleset };
  }).pipe(
    // create elements' id batches
    mergeMap((x) => batcher().pipe(map((batch) => ({ ...x, batch })))),
    // request content for each batch, filter by IDs for performance
    mergeMap(
      ({ descriptor, keys, ruleset, batch }) =>
        defer(async () => {
          const filteringDescriptor = new Descriptor(descriptor);
          filteringDescriptor.instanceFilter = {
            selectClassName: classFullName,
            expression: createElementIdsDMExpressionFilter(batch),
          };
          return contentSetGetter({
            rulesetOrId: ruleset,
            keys,
            descriptor: filteringDescriptor,
          });
        }).pipe(map((items) => ({ descriptor, items }))),
      batchesParallelism,
    ),
  );
}

function createElementIdsDMExpressionFilter(batch: Array<{ from: Id64String; to: Id64String }>): string {
  let filter = "";
  function appendCondition(cond: string) {
    if (filter.length > 0) {
      filter += " OR ";
    }
    filter += cond;
  }
  for (const item of batch) {
    if (item.from === item.to) {
      appendCondition(`this.DMInstanceId = ${item.from}`);
    } else {
      appendCondition(`this.DMInstanceId >= ${item.from} AND this.DMInstanceId <= ${item.to}`);
    }
  }
  return filter;
}

function createClassContentRuleset(fullClassName: string): Ruleset {
  const [schemaName, className] = parseFullClassName(fullClassName);
  return {
    id: `content/class-descriptor/${fullClassName}`,
    rules: [
      {
        ruleType: "Content",
        specifications: [
          {
            specType: "ContentInstancesOfSpecificClasses",
            classes: {
              schemaName,
              classNames: [className],
              arePolymorphic: false,
            },
            handlePropertiesPolymorphically: true,
          },
        ],
      },
    ],
  };
}

/** Given a list of element ids, group them by class name. */
function getElementClassesFromIds(ivault: IVaultDb, elementIds: string[]): Observable<{ classFullName: string; ids: Id64Array }> {
  const elementIdsBatchSize = 5000;
  return range(0, elementIds.length / elementIdsBatchSize).pipe(
    mergeMap((batchIndex) => {
      const idsFrom = batchIndex * elementIdsBatchSize;
      const idsTo = Math.min(idsFrom + elementIdsBatchSize, elementIds.length);
      return from(
        ivault.createQueryReader(
          `
            SELECT dm_classname(e.DMClassId) className, GROUP_CONCAT(IdToHex(e.DMInstanceId)) ids
            FROM bis.Element e
            WHERE e.DMInstanceId IN (${elementIds.slice(idsFrom, idsTo).join(",")})
            GROUP BY e.DMClassId
          `,
        ),
      );
    }),
    map((row: QueryRowProxy): { className: string; ids: Id64Array } => ({ className: row.className, ids: row.ids.split(",") })),
    groupBy(({ className }) => className),
    mergeMap((groups) =>
      groups.pipe(
        reduce<ObservedValueOf<typeof groups>, { classFullName: string; ids: Id64Array }>(
          (acc, g) => {
            g.ids.forEach((id) => acc.ids.push(id));
            return {
              classFullName: g.className,
              ids: acc.ids,
            };
          },
          { classFullName: "", ids: [] },
        ),
      ),
    ),
  );
}

/** Given a list of full class names, get a stream of actual class names that have instances. */
function getClassesWithInstances(ivault: IVaultDb, fullClassNames: string[]): Observable<string> {
  return from(fullClassNames).pipe(
    mergeMap((fullClassName) =>
      from(
        ivault.createQueryReader(
          `
            SELECT dm_classname(e.DMClassId, 's.c') className
            FROM ${getDMSqlName(fullClassName)} e
            GROUP BY e.DMClassId
          `,
        ),
      ),
    ),
    map((row: QueryRowProxy): string => row.className),
  );
}

/**
 * Given a sorted list of DMInstanceIds and a batch size, create a stream of batches. Because the IDs won't necessarily
 * be sequential, a batch is defined a list of from-to pairs.
 * @internal
 */
export function createIdBatches(sortedIds: Id64String[], batchSize: number): Observable<Array<{ from: Id64String; to: Id64String }>> {
  return range(0, sortedIds.length / batchSize).pipe(
    map((batchIndex) => {
      const sequences = new Array<{ from: Id64String; to: Id64String }>();
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min((batchIndex + 1) * batchSize, sortedIds.length) - 1;
      let fromId = sortedIds[startIndex];
      let to = {
        id: sortedIds[startIndex],
        localId: Id64.getLocalId(sortedIds[startIndex]),
      };
      for (let i = startIndex + 1; i <= endIndex; ++i) {
        const currLocalId = Id64.getLocalId(sortedIds[i]);
        if (currLocalId !== to.localId + 1) {
          sequences.push({ from: fromId, to: sortedIds[i - 1] });
          fromId = sortedIds[i];
        }
        to = { id: sortedIds[i], localId: currLocalId };
      }
      sequences.push({ from: fromId, to: sortedIds[endIndex] });
      return sequences;
    }),
  );
}

/**
 * Query all DMInstanceIds from given class and stream from-to pairs that batch the items into batches of `batchSize` size.
 * @internal
 */
export function getBatchedClassElementIds(ivault: IVaultDb, fullClassName: string, batchSize: number): Observable<Array<{ from: Id64String; to: Id64String }>> {
  return from(ivault.createQueryReader(`SELECT IdToHex(DMInstanceId) id FROM ${getDMSqlName(fullClassName)} ORDER BY DMInstanceId`)).pipe(
    map((row): Id64String => row.id),
    bufferCount(batchSize),
    map((batch) => [{ from: batch[0], to: batch[batch.length - 1] }]),
  );
}

/** @internal */
export async function getElementsCount(db: IVaultDb, classNames: string[]) {
  const whereClause = (() => {
    if (classNames === undefined || classNames.length === 0) {
      return undefined;
    }
    // check if list contains only valid class names
    const classNameRegExp = new RegExp(/^[\w]+[.:][\w]+$/);
    const invalidName = classNames.find((name) => !name.match(classNameRegExp));
    if (invalidName) {
      throw new PresentationError(
        PresentationStatus.InvalidArgument,
        `Encountered invalid class name - ${invalidName}.
        Valid class name formats: "<schema name or alias>.<class name>", "<schema name or alias>:<class name>"`,
      );
    }
    return `e.DMClassId IS (${classNames.join(",")})`;
  })();
  const query = `
    SELECT COUNT(e.DMInstanceId) AS elementCount
    FROM bis.Element e
    ${whereClause ? `WHERE ${whereClause}` : ""}
  `;
  for await (const row of db.createQueryReader(query)) {
    return row.elementCount;
  }
  return 0;
}
