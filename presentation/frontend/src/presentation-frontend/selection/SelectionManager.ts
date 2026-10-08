/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module UnifiedSelection
 */

import { defer, EMPTY, mergeMap, Observable, of, Subject, Subscription, takeUntil, tap } from "rxjs";
import { Id64, Id64Arg, Id64Array } from "@szewtwin/core-szewec";
import { IVaultConnection, SelectableIds, SelectionSetEvent, SelectionSetEventType } from "@szewtwin/core-frontend";
import { BaseNodeKey, InstanceKey, Key, Keys, KeySet, NodeKey, SelectionScope, SelectionScopeProps } from "@szewtwin/presentation-common";
import { AsyncTasksTracker } from "@szewtwin/presentation-common/internal";
import {
  createStorage,
  CustomSelectable,
  Selectable,
  Selectables,
  SelectionStorage,
  StorageSelectionChangeEventArgs,
  StorageSelectionChangeType,
  TRANSIENT_ELEMENT_CLASSNAME,
} from "@szewtwin/unified-selection";
import { Presentation } from "../Presentation.js";
import { HiliteSet, HiliteSetProvider } from "./HiliteSetProvider.js";
import { ISelectionProvider } from "./ISelectionProvider.js";
import { SelectionChangeEvent, SelectionChangeEventArgs, SelectionChangeType } from "./SelectionChangeEvent.js";
import { createSelectionScopeProps, SelectionScopesManager } from "./SelectionScopesManager.js";

/**
 * Properties for creating [[SelectionManager]].
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `SelectionStorage` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export interface SelectionManagerProps {
  /** A manager for [selection scopes]($docs/presentation/unified-selection/index#selection-scopes) */
  scopes: SelectionScopesManager;

  /**
   * Custom unified selection storage to be used by [[SelectionManager]]. If not provided [[SelectionManager]] creates
   * and maintains storage.
   */
  selectionStorage?: SelectionStorage;

  /**
   * An optional function that returns a key for the given iVault. The key is what "glues" iVault selection
   * changes made in `selectionStorage`, where iVaults are identified by key, and `SelectionManager`, where
   * iVaults are specified as `IVaultConnection`.
   *
   * If not provided, [IVaultConnection.key]($core-frontend) or [IVaultConnection.name]($core-frontend) is used.
   */
  ivaultKeyFactory?: (ivault: IVaultConnection) => string;
}

/**
 * The selection manager which stores the overall selection.
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `SelectionStorage` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export class SelectionManager implements ISelectionProvider, Disposable {
  private _ivaultKeyFactory: (ivault: IVaultConnection) => string;
  private _ivaultToolSelectionSyncHandlers = new Map<IVaultConnection, { requestorsCount: number; handler: ToolSelectionSyncHandler }>();
  private _hiliteSetProviders = new Map<IVaultConnection, HiliteSetProvider>();
  private _ownsStorage: boolean;

  private _knownIVaults = new Set<IVaultConnection>();
  private _currentSelection = new CurrentSelectionStorage();
  private _selectionChanges = new Subject<StorageSelectionChangeEventArgs>();
  private _selectionEventsSubscription: Subscription;
  private _listeners: Array<() => void> = [];

  /**
   * Underlying selection storage used by this selection manager. Ideally, consumers should use
   * the storage directly instead of using this manager to manipulate selection.
   */
  public readonly selectionStorage: SelectionStorage;

  /** An event which gets broadcasted on selection changes */
  public readonly selectionChange: SelectionChangeEvent;

  /** Manager for [selection scopes]($docs/presentation/unified-selection/index#selection-scopes) */
  public readonly scopes: SelectionScopesManager;

  /**
   * Creates an instance of SelectionManager.
   */
  constructor(props: SelectionManagerProps) {
    this.selectionChange = new SelectionChangeEvent();
    this.scopes = props.scopes;
    this.selectionStorage = props.selectionStorage ?? createStorage();
    this._ivaultKeyFactory = props.ivaultKeyFactory ?? ((ivault) => (ivault.key.length ? ivault.key : ivault.name));
    this._ownsStorage = props.selectionStorage === undefined;
    this.selectionStorage.selectionChangeEvent.addListener((args) => this._selectionChanges.next(args));
    this._selectionEventsSubscription = this.streamSelectionEvents();
    this._listeners.push(
      IVaultConnection.onOpen.addListener((ivault) => {
        this._knownIVaults.add(ivault);
      }),
    );
    this._listeners.push(
      IVaultConnection.onClose.addListener((ivault: IVaultConnection) => {
        this.onConnectionClose(ivault);
      }),
    );
  }

  public [Symbol.dispose]() {
    this._selectionEventsSubscription.unsubscribe();
    this._listeners.forEach((dispose) => dispose());
  }

  /** @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [Symbol.dispose] instead. */
  /* c8 ignore next 3 */
  public dispose() {
    this[Symbol.dispose]();
  }

  private onConnectionClose(ivault: IVaultConnection): void {
    const ivaultKey = this._ivaultKeyFactory(ivault);
    this._hiliteSetProviders.delete(ivault);
    this._knownIVaults.delete(ivault);
    this._currentSelection.clear(ivaultKey);
    if (this._ownsStorage) {
      this.clearSelection("Connection Close Event", ivault);
      this.selectionStorage.clearStorage({ ivaultKey });
    }
  }

  /**
   * Request the manager to sync with ivault's tool selection (see `IVaultConnection.selectionSet`).
   */
  public setSyncWithIVaultToolSelection(ivault: IVaultConnection, sync = true) {
    const registration = this._ivaultToolSelectionSyncHandlers.get(ivault);
    if (sync) {
      if (!registration || registration.requestorsCount === 0) {
        this._ivaultToolSelectionSyncHandlers.set(ivault, { requestorsCount: 1, handler: new ToolSelectionSyncHandler(ivault, this) });
      } else {
        this._ivaultToolSelectionSyncHandlers.set(ivault, { ...registration, requestorsCount: registration.requestorsCount + 1 });
      }
    } else {
      if (registration && registration.requestorsCount > 0) {
        const requestorsCount = registration.requestorsCount - 1;
        if (requestorsCount > 0) {
          this._ivaultToolSelectionSyncHandlers.set(ivault, { ...registration, requestorsCount });
        } else {
          this._ivaultToolSelectionSyncHandlers.delete(ivault);
          registration.handler[Symbol.dispose]();
        }
      }
    }
  }

  /**
   * Temporarily suspends tool selection synchronization until the returned `Disposable`
   * is disposed.
   */
  public suspendIVaultToolSelectionSync(ivault: IVaultConnection) {
    const registration = this._ivaultToolSelectionSyncHandlers.get(ivault);
    if (!registration) {
      const noop = () => {};
      return { [Symbol.dispose]: noop, dispose: noop };
    }

    const wasSuspended = registration.handler.isSuspended;
    registration.handler.isSuspended = true;
    const doDispose = () => (registration.handler.isSuspended = wasSuspended);
    return { [Symbol.dispose]: doDispose, dispose: doDispose };
  }

  /** Get the selection levels currently stored in this manager for the specified ivault */
  public getSelectionLevels(ivault: IVaultConnection): number[] {
    const ivaultKey = this._ivaultKeyFactory(ivault);
    return this.selectionStorage.getSelectionLevels({ ivaultKey });
  }

  /**
   * Get the selection currently stored in this manager
   *
   * @note Calling immediately after `add*`|`replace*`|`remove*`|`clear*` method call does not guarantee
   * that returned `KeySet` will include latest changes. Listen for `selectionChange` event to get the
   * latest selection after changes.
   */
  public getSelection(ivault: IVaultConnection, level: number = 0): Readonly<KeySet> {
    const ivaultKey = this._ivaultKeyFactory(ivault);
    return this._currentSelection.getSelection(ivaultKey, level);
  }

  private handleEvent(evt: SelectionChangeEventArgs): void {
    const ivaultKey = this._ivaultKeyFactory(evt.ivault);
    this._knownIVaults.add(evt.ivault);
    switch (evt.changeType) {
      case SelectionChangeType.Add:
        this.selectionStorage.addToSelection({
          ivaultKey,
          source: evt.source,
          level: evt.level,
          selectables: keysToSelectable(evt.ivault, evt.keys),
        });
        break;
      case SelectionChangeType.Remove:
        this.selectionStorage.removeFromSelection({
          ivaultKey,
          source: evt.source,
          level: evt.level,
          selectables: keysToSelectable(evt.ivault, evt.keys),
        });
        break;
      case SelectionChangeType.Replace:
        this.selectionStorage.replaceSelection({
          ivaultKey,
          source: evt.source,
          level: evt.level,
          selectables: keysToSelectable(evt.ivault, evt.keys),
        });
        break;
      case SelectionChangeType.Clear:
        this.selectionStorage.clearSelection({ ivaultKey, source: evt.source, level: evt.level });
        break;
    }
  }

  /**
   * Add keys to the selection
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param keys Keys to add
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public addToSelection(source: string, ivault: IVaultConnection, keys: Keys, level: number = 0, rulesetId?: string): void {
    const evt: SelectionChangeEventArgs = {
      source,
      level,
      ivault,
      changeType: SelectionChangeType.Add,
      keys: new KeySet(keys),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Remove keys from current selection
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param keys Keys to remove
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public removeFromSelection(source: string, ivault: IVaultConnection, keys: Keys, level: number = 0, rulesetId?: string): void {
    const evt: SelectionChangeEventArgs = {
      source,
      level,
      ivault,
      changeType: SelectionChangeType.Remove,
      keys: new KeySet(keys),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Replace current selection
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param keys Keys to add
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public replaceSelection(source: string, ivault: IVaultConnection, keys: Keys, level: number = 0, rulesetId?: string): void {
    const evt: SelectionChangeEventArgs = {
      source,
      level,
      ivault,
      changeType: SelectionChangeType.Replace,
      keys: new KeySet(keys),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Clear current selection
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public clearSelection(source: string, ivault: IVaultConnection, level: number = 0, rulesetId?: string): void {
    const evt: SelectionChangeEventArgs = {
      source,
      level,
      ivault,
      changeType: SelectionChangeType.Clear,
      keys: new KeySet(),
      timestamp: new Date(),
      rulesetId,
    };
    this.handleEvent(evt);
  }

  /**
   * Add keys to selection after applying [selection scope]($docs/presentation/unified-selection/index#selection-scopes) on them.
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param ids Element IDs to add
   * @param scope Selection scope to apply
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public async addToSelectionWithScope(
    source: string,
    ivault: IVaultConnection,
    ids: Id64Arg,
    scope: SelectionScopeProps | SelectionScope | string,
    level: number = 0,
    rulesetId?: string,
  ): Promise<void> {
    const scopedKeys = await this.scopes.computeSelection(ivault, ids, scope);
    this.addToSelection(source, ivault, scopedKeys, level, rulesetId);
  }

  /**
   * Remove keys from current selection after applying [selection scope]($docs/presentation/unified-selection/index#selection-scopes) on them.
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param ids Element IDs to remove
   * @param scope Selection scope to apply
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public async removeFromSelectionWithScope(
    source: string,
    ivault: IVaultConnection,
    ids: Id64Arg,
    scope: SelectionScopeProps | SelectionScope | string,
    level: number = 0,
    rulesetId?: string,
  ): Promise<void> {
    const scopedKeys = await this.scopes.computeSelection(ivault, ids, scope);
    this.removeFromSelection(source, ivault, scopedKeys, level, rulesetId);
  }

  /**
   * Replace current selection with keys after applying [selection scope]($docs/presentation/unified-selection/index#selection-scopes) on them.
   * @param source Name of the selection source
   * @param ivault iVault associated with the selection
   * @param ids Element IDs to replace with
   * @param scope Selection scope to apply
   * @param level Selection level (see [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels))
   * @param rulesetId ID of the ruleset in case the selection was changed from a rules-driven control
   */
  public async replaceSelectionWithScope(
    source: string,
    ivault: IVaultConnection,
    ids: Id64Arg,
    scope: SelectionScopeProps | SelectionScope | string,
    level: number = 0,
    rulesetId?: string,
  ): Promise<void> {
    const scopedKeys = await this.scopes.computeSelection(ivault, ids, scope);
    this.replaceSelection(source, ivault, scopedKeys, level, rulesetId);
  }

  /**
   * Get the current hilite set for the specified ivault
   * @public
   */
  public async getHiliteSet(ivault: IVaultConnection): Promise<HiliteSet> {
    return this.getHiliteSetProvider(ivault).getHiliteSet(this.getSelection(ivault));
  }

  /**
   * Get the current hilite set iterator for the specified ivault.
   * @public
   */
  public getHiliteSetIterator(ivault: IVaultConnection) {
    return this.getHiliteSetProvider(ivault).getHiliteSetIterator(this.getSelection(ivault));
  }

  private getHiliteSetProvider(ivault: IVaultConnection) {
    let provider = this._hiliteSetProviders.get(ivault);
    if (!provider) {
      provider = HiliteSetProvider.create({ ivault });
      this._hiliteSetProviders.set(ivault, provider);
    }
    return provider;
  }

  private streamSelectionEvents() {
    return this._selectionChanges
      .pipe(
        mergeMap((args) => {
          const currentSelectables = this.selectionStorage.getSelection({ ivaultKey: args.ivaultKey, level: args.level });
          return this._currentSelection.computeSelection(args.ivaultKey, args.level, currentSelectables, args.selectables).pipe(
            mergeMap(({ level, changedSelection }): Observable<SelectionChangeEventArgs> => {
              const ivault = findIVault(this._knownIVaults, this._ivaultKeyFactory, args.ivaultKey);
              /* c8 ignore next 3 */
              if (!ivault) {
                return EMPTY;
              }
              return of({
                ivault,
                keys: changedSelection,
                level,
                source: args.source,
                timestamp: args.timestamp,
                changeType: getChangeType(args.changeType),
              });
            }),
          );
        }),
      )
      .subscribe({
        next: (args) => {
          this.selectionChange.raiseEvent(args, this);
        },
      });
  }
}

function findIVault(set: Set<IVaultConnection>, ivaultKeyFactory: (ivault: IVaultConnection) => string, key: string) {
  for (const ivault of set) {
    if (ivaultKeyFactory(ivault) === key) {
      return ivault;
    }
  }
  return undefined;
}

/** @internal */
export class ToolSelectionSyncHandler implements Disposable {
  private _selectionSourceName = "Tool";
  private _logicalSelection: SelectionManager;
  private _ivault: IVaultConnection;
  private _ivaultToolSelectionListenerDisposeFunc: () => void;
  private _asyncsTracker = new AsyncTasksTracker();
  public isSuspended?: boolean;

  public constructor(ivault: IVaultConnection, logicalSelection: SelectionManager) {
    this._ivault = ivault;
    this._logicalSelection = logicalSelection;
    this._ivaultToolSelectionListenerDisposeFunc = ivault.selectionSet.onChanged.addListener(this.onToolSelectionChanged);
  }

  public [Symbol.dispose]() {
    this._ivaultToolSelectionListenerDisposeFunc();
  }

  /** note: used only it tests */
  public get pendingAsyncs() {
    return this._asyncsTracker.pendingAsyncs;
  }

  private onToolSelectionChanged = async (ev: SelectionSetEvent): Promise<void> => {
    // ignore selection change event if the handler is suspended
    if (this.isSuspended) {
      return;
    }

    // this component only cares about its own ivault
    const ivault = ev.set.iVault;
    if (ivault !== this._ivault) {
      return;
    }

    // determine the level of selection changes
    // wip: may want to allow selecting at different levels?
    const selectionLevel = 0;

    let ids: SelectableIds;
    switch (ev.type) {
      case SelectionSetEventType.Add:
        ids = ev.additions;
        break;
      case SelectionSetEventType.Replace:
        ids = ev.set.active;
        break;
      default:
        ids = ev.removals;
        break;
    }

    // we're always using scoped selection changer even if the scope is set to "element" - that
    // makes sure we're adding to selection keys with concrete classes and not "BisCore:Element", which
    // we can't because otherwise our keys compare fails (presentation components load data with
    // concrete classes)
    const changer = new ScopedSelectionChanger(
      this._selectionSourceName,
      this._ivault,
      this._logicalSelection,
      createSelectionScopeProps(this._logicalSelection.scopes.activeScope),
    );

    using _r = this._asyncsTracker.trackAsyncTask();
    switch (ev.type) {
      case SelectionSetEventType.Add:
        await changer.add(ids, selectionLevel);
        break;
      case SelectionSetEventType.Replace:
        await changer.replace(ids, selectionLevel);
        break;
      case SelectionSetEventType.Remove:
        await changer.remove(ids, selectionLevel);
        break;
      case SelectionSetEventType.Clear:
        await changer.clear(selectionLevel);
        break;
    }
  };
}

const parseElementIds = (ids: Id64Arg): { persistent: Id64Arg; transient: Id64Arg } => {
  let allPersistent = true;
  let allTransient = true;
  for (const id of Id64.iterable(ids)) {
    if (Id64.isTransient(id)) {
      allPersistent = false;
    } else {
      allTransient = false;
    }

    if (!allPersistent && !allTransient) {
      break;
    }
  }

  // avoid making a copy if ids are only persistent or only transient
  if (allPersistent) {
    return { persistent: ids, transient: [] };
  } else if (allTransient) {
    return { persistent: [], transient: ids };
  }

  // if `ids` contain mixed ids, we have to copy.. use Array instead of
  // a Set for performance
  const persistentElementIds: Id64Array = [];
  const transientElementIds: Id64Array = [];
  for (const id of Id64.iterable(ids)) {
    if (Id64.isTransient(id)) {
      transientElementIds.push(id);
    } else {
      persistentElementIds.push(id);
    }
  }

  return { persistent: persistentElementIds, transient: transientElementIds };
};

function addKeys(target: KeySet, className: string, ids: Id64Arg) {
  for (const id of Id64.iterable(ids)) {
    target.add({ className, id });
  }
}

class ScopedSelectionChanger {
  public readonly name: string;
  public readonly ivault: IVaultConnection;
  public readonly manager: SelectionManager;
  public readonly scope: SelectionScopeProps | SelectionScope | string;
  public constructor(name: string, ivault: IVaultConnection, manager: SelectionManager, scope: SelectionScopeProps | SelectionScope | string) {
    this.name = name;
    this.ivault = ivault;
    this.manager = manager;
    this.scope = scope;
  }
  public async clear(level: number): Promise<void> {
    this.manager.clearSelection(this.name, this.ivault, level);
  }
  public async add(ids: SelectableIds, level: number): Promise<void> {
    const keys = await this.#computeSelection(ids);
    this.manager.addToSelection(this.name, this.ivault, keys, level);
  }
  public async remove(ids: SelectableIds, level: number): Promise<void> {
    const keys = await this.#computeSelection(ids);
    this.manager.removeFromSelection(this.name, this.ivault, keys, level);
  }
  public async replace(ids: SelectableIds, level: number): Promise<void> {
    const keys = await this.#computeSelection(ids);
    this.manager.replaceSelection(this.name, this.ivault, keys, level);
  }
  async #computeSelection(ids: SelectableIds) {
    let keys = new KeySet();
    if (ids.elements) {
      const { persistent, transient } = parseElementIds(ids.elements);
      keys = await this.manager.scopes.computeSelection(this.ivault, persistent, this.scope);
      addKeys(keys, TRANSIENT_ELEMENT_CLASSNAME, transient);
    }
    if (ids.models) {
      addKeys(keys, "BisCore.Model", ids.models);
    }
    if (ids.subcategories) {
      addKeys(keys, "BisCore.SubCategory", ids.subcategories);
    }
    return keys;
  }
}

/** Stores current selection in `KeySet` format per iVault.  */
class CurrentSelectionStorage {
  private _currentSelection = new Map<string, IVaultSelectionStorage>();

  private getCurrentSelectionStorage(ivaultKey: string) {
    let storage = this._currentSelection.get(ivaultKey);
    if (!storage) {
      storage = new IVaultSelectionStorage();
      this._currentSelection.set(ivaultKey, storage);
    }
    return storage;
  }

  public getSelection(ivaultKey: string, level: number) {
    return this.getCurrentSelectionStorage(ivaultKey).getSelection(level);
  }

  public clear(ivaultKey: string) {
    this._currentSelection.delete(ivaultKey);
  }

  public computeSelection(ivaultKey: string, level: number, currSelectables: Selectables, changedSelectables: Selectables) {
    return this.getCurrentSelectionStorage(ivaultKey).computeSelection(level, currSelectables, changedSelectables);
  }
}

interface StorageEntry {
  value: KeySet;
  ongoingComputationDisposers: Set<Subject<void>>;
}

/**
 * Computes and stores current selection in `KeySet` format.
 * It always stores result of latest resolved call to `computeSelection`.
 */
class IVaultSelectionStorage {
  private _currentSelection = new Map<number, StorageEntry>();

  public getSelection(level: number): KeySet {
    let entry = this._currentSelection.get(level);
    if (!entry) {
      entry = { value: new KeySet(), ongoingComputationDisposers: new Set() };
      this._currentSelection.set(level, entry);
    }
    return entry.value;
  }

  private clearSelections(level: number) {
    const clearedLevels = [];
    for (const [storedLevel] of this._currentSelection.entries()) {
      if (storedLevel > level) {
        clearedLevels.push(storedLevel);
      }
    }
    clearedLevels.forEach((storedLevel) => {
      const entry = this._currentSelection.get(storedLevel);
      /* c8 ignore next 3 */
      if (!entry) {
        return;
      }

      for (const disposer of entry.ongoingComputationDisposers) {
        disposer.next();
      }
      this._currentSelection.delete(storedLevel);
    });
  }

  private addDisposer(level: number, disposer: Subject<void>) {
    const entry = this._currentSelection.get(level);
    if (!entry) {
      this._currentSelection.set(level, { value: new KeySet(), ongoingComputationDisposers: new Set([disposer]) });
      return;
    }
    entry.ongoingComputationDisposers.add(disposer);
  }

  private setSelection(level: number, keys: KeySet, disposer: Subject<void>) {
    const currEntry = this._currentSelection.get(level);
    if (currEntry) {
      currEntry.ongoingComputationDisposers.delete(disposer);
    }
    this._currentSelection.set(level, {
      value: keys,
      ongoingComputationDisposers: currEntry?.ongoingComputationDisposers ?? /* c8 ignore next */ new Set(),
    });
  }

  public computeSelection(level: number, currSelectables: Selectables, changedSelectables: Selectables) {
    this.clearSelections(level);

    const prevComputationsDisposers = [...(this._currentSelection.get(level)?.ongoingComputationDisposers ?? [])];
    const currDisposer = new Subject<void>();
    this.addDisposer(level, currDisposer);

    return defer(async () => {
      const convertedSelectables: SelectableKeys[] = [];
      const [current, changed] = await Promise.all([
        selectablesToKeys(currSelectables, convertedSelectables),
        selectablesToKeys(changedSelectables, convertedSelectables),
      ]);

      const currentSelection = new KeySet([...current.keys, ...current.selectableKeys.flatMap((selectable) => selectable.keys)]);
      const changedSelection = new KeySet([...changed.keys, ...changed.selectableKeys.flatMap((selectable) => selectable.keys)]);

      return {
        level,
        currentSelection,
        changedSelection,
      };
    }).pipe(
      takeUntil(currDisposer),
      tap({
        next: (val) => {
          prevComputationsDisposers.forEach((disposer) => disposer.next());
          this.setSelection(val.level, val.currentSelection, currDisposer);
        },
      }),
    );
  }
}

function keysToSelectable(ivault: IVaultConnection, keys: Readonly<KeySet>) {
  const selectables: Selectable[] = [];
  keys.forEach((key) => {
    if ("id" in key) {
      selectables.push(key);
      return;
    }

    const customSelectable: CustomSelectable = {
      identifier: key.pathFromRoot.join("/"),
      data: key,
      loadInstanceKeys: () => createInstanceKeysIterator(ivault, key),
    };
    selectables.push(customSelectable);
  });
  return selectables;
}

interface SelectableKeys {
  identifier: string;
  keys: Key[];
}

async function selectablesToKeys(selectables: Selectables, convertedList: SelectableKeys[]) {
  const keys: Key[] = [];
  const selectableKeys: SelectableKeys[] = [];

  for (const [className, ids] of selectables.instanceKeys) {
    for (const id of ids) {
      keys.push({ id, className });
    }
  }

  for (const [_, selectable] of selectables.custom) {
    if (isNodeKey(selectable.data)) {
      selectableKeys.push({ identifier: selectable.identifier, keys: [selectable.data] });
      continue;
    }
    const converted = convertedList.find((con) => con.identifier === selectable.identifier);
    if (converted) {
      selectableKeys.push(converted);
      continue;
    }

    const newConverted: SelectableKeys = { identifier: selectable.identifier, keys: [] };
    convertedList.push(newConverted);
    for await (const instanceKey of selectable.loadInstanceKeys()) {
      newConverted.keys.push(instanceKey);
    }
    selectableKeys.push(newConverted);
  }

  return { keys, selectableKeys };
}

async function* createInstanceKeysIterator(ivault: IVaultConnection, nodeKey: NodeKey): AsyncIterableIterator<InstanceKey> {
  if (NodeKey.isInstancesNodeKey(nodeKey)) {
    for (const key of nodeKey.instanceKeys) {
      yield key;
    }
    return;
  }

  const content = await Presentation.presentation.getContentInstanceKeys({
    ivault,
    keys: new KeySet([nodeKey]),
    rulesetOrId: {
      id: "grouped-instances",
      rules: [
        {
          ruleType: "Content",
          specifications: [
            {
              specType: "SelectedNodeInstances",
            },
          ],
        },
      ],
    },
  });

  for await (const key of content.items()) {
    yield key;
  }
}

function isNodeKey(data: unknown): data is NodeKey {
  const key = data as BaseNodeKey;
  return key.pathFromRoot !== undefined && key.type !== undefined;
}

function getChangeType(type: StorageSelectionChangeType): SelectionChangeType {
  switch (type) {
    case "add":
      return SelectionChangeType.Add;
    case "remove":
      return SelectionChangeType.Remove;
    case "replace":
      return SelectionChangeType.Replace;
    case "clear":
      return SelectionChangeType.Clear;
  }
}
