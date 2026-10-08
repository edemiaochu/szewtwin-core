/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { AccessToken, compareStrings, Dictionary, Guid, isDisposable, OrderedComparator } from "@szewtwin/core-szewec";
import { InternetConnectivityStatus } from "@szewtwin/core-common";
import { IVaultApp } from "@szewtwin/core-frontend";
import { PresentationError, PresentationStatus } from "@szewtwin/presentation-common";
import { ConnectivityInformationProvider, IConnectivityInformationProvider } from "../ConnectivityInformationProvider.js";
import { FavoritePropertiesOrderInfo, PropertyFullName } from "./FavoritePropertiesManager.js";

/** @internal */
export const IVAULTJS_PRESENTATION_SETTING_NAMESPACE = "ivaultjs.presentation";
/** @internal */
export const DEPRECATED_PROPERTIES_SETTING_NAMESPACE = "Properties";
/** @internal */
export const FAVORITE_PROPERTIES_SETTING_NAME = "FavoriteProperties";
/** @internal */
export const FAVORITE_PROPERTIES_ORDER_INFO_SETTING_NAME = "FavoritePropertiesOrderInfo";

/**
 * Stores user preferences for favorite properties.
 * @public
 */
export interface IFavoritePropertiesStorage {
  /** Load Favorite properties from user-specific settings.
   * @param szewTwinId SZEWTwin Id, if the settings is specific to a szewTwin, otherwise undefined.
   * @param ivaultId iVault Id, if the setting is specific to an iVault, otherwise undefined. The szewTwinId must be specified if iVaultId is specified.
   */
  loadProperties(szewTwinId?: string, ivaultId?: string): Promise<Set<PropertyFullName> | undefined>;
  /** Saves Favorite properties to user-specific settings.
   * @param properties Favorite properties to save.
   * @param szewTwinId szewTwin Id, if the settings is specific to a szewTwin, otherwise undefined.
   * @param iVaultId iVault Id, if the setting is specific to an iVault, otherwise undefined. The szewTwinId must be specified if iVaultId is specified.
   */
  saveProperties(properties: Set<PropertyFullName>, szewTwinId?: string, ivaultId?: string): Promise<void>;
  /** Load array of FavoritePropertiesOrderInfo from user-specific settings.
   * Setting is specific to an iVault.
   * @param szewTwinId szewTwin Id.
   * @param ivaultId iVault Id.
   */
  loadPropertiesOrder(szewTwinId: string | undefined, ivaultId: string): Promise<FavoritePropertiesOrderInfo[] | undefined>;
  /** Saves FavoritePropertiesOrderInfo array to user-specific settings.
   * Setting is specific to an iVault.
   * @param orderInfo Array of FavoritePropertiesOrderInfo to save.
   * @param szewTwinId szewTwin Id.
   * @param ivaultId iVault Id.
   */
  savePropertiesOrder(orderInfos: FavoritePropertiesOrderInfo[], szewTwinId: string | undefined, ivaultId: string): Promise<void>;
}

/**
 * Available implementations of [[IFavoritePropertiesStorage]].
 * @public
 */
export enum DefaultFavoritePropertiesStorageTypes {
  /** A no-op storage that doesn't store or return anything. Used for cases when favorite properties aren't used by the application. */
  Noop,
  /** A storage that stores favorite properties information in a browser local storage. */
  BrowserLocalStorage,
  /** A storage that stores favorite properties in a user preferences storage (see [[IVaultApp.userPreferences]]). */
  UserPreferencesStorage,
}

/**
 * A factory method to create one of the available [[IFavoritePropertiesStorage]] implementations.
 * @public
 */
export function createFavoritePropertiesStorage(type: DefaultFavoritePropertiesStorageTypes): IFavoritePropertiesStorage {
  switch (type) {
    case DefaultFavoritePropertiesStorageTypes.Noop:
      return new NoopFavoritePropertiesStorage();
    case DefaultFavoritePropertiesStorageTypes.BrowserLocalStorage:
      return new BrowserLocalFavoritePropertiesStorage();
    case DefaultFavoritePropertiesStorageTypes.UserPreferencesStorage:
      return new OfflineCachingFavoritePropertiesStorage({ impl: new IVaultAppFavoritePropertiesStorage() });
  }
}

/**
 * @internal
 */
export class IVaultAppFavoritePropertiesStorage implements IFavoritePropertiesStorage {
  private async ensureIsSignedIn(): Promise<{ accessToken: AccessToken }> {
    const accessToken = IVaultApp.authorizationClient ? await IVaultApp.authorizationClient.getAccessToken() : "";
    if (accessToken) {
      return { accessToken };
    }
    throw new PresentationError(PresentationStatus.Error, "Current user is not authorized to use the settings service");
  }

  public async loadProperties(szewTwinId?: string, ivaultId?: string): Promise<Set<PropertyFullName> | undefined> {
    if (!IVaultApp.userPreferences) {
      throw new PresentationError(PresentationStatus.Error, "User preferences service is not set up");
    }

    const { accessToken } = await this.ensureIsSignedIn();
    let setting = await IVaultApp.userPreferences.get({
      accessToken,
      szewTwinId,
      iVaultId: ivaultId,
      namespace: IVAULTJS_PRESENTATION_SETTING_NAMESPACE,
      key: FAVORITE_PROPERTIES_SETTING_NAME,
    });

    if (setting !== undefined) {
      return new Set<PropertyFullName>(setting);
    }

    // try to check the old namespace
    setting = await IVaultApp.userPreferences.get({
      accessToken,
      szewTwinId,
      iVaultId: ivaultId,
      namespace: DEPRECATED_PROPERTIES_SETTING_NAMESPACE,
      key: FAVORITE_PROPERTIES_SETTING_NAME,
    });

    if (
      setting !== undefined &&
      setting.hasOwnProperty("nestedContentInfos") &&
      setting.hasOwnProperty("propertyInfos") &&
      setting.hasOwnProperty("baseFieldInfos")
    ) {
      return new Set<PropertyFullName>([...setting.nestedContentInfos, ...setting.propertyInfos, ...setting.baseFieldInfos]);
    }

    return undefined;
  }

  public async saveProperties(properties: Set<PropertyFullName>, szewTwinId?: string, ivaultId?: string): Promise<void> {
    if (!IVaultApp.userPreferences) {
      throw new PresentationError(PresentationStatus.Error, "User preferences service is not set up");
    }

    const { accessToken } = await this.ensureIsSignedIn();
    await IVaultApp.userPreferences.save({
      accessToken,
      szewTwinId,
      iVaultId: ivaultId,
      namespace: IVAULTJS_PRESENTATION_SETTING_NAMESPACE,
      key: FAVORITE_PROPERTIES_SETTING_NAME,
      content: Array.from(properties),
    });
  }

  public async loadPropertiesOrder(szewTwinId: string | undefined, ivaultId: string): Promise<FavoritePropertiesOrderInfo[] | undefined> {
    if (!IVaultApp.userPreferences) {
      throw new PresentationError(PresentationStatus.Error, "User preferences service is not set up");
    }

    const { accessToken } = await this.ensureIsSignedIn();
    const setting = await IVaultApp.userPreferences.get({
      accessToken,
      szewTwinId,
      iVaultId: ivaultId,
      namespace: IVAULTJS_PRESENTATION_SETTING_NAMESPACE,
      key: FAVORITE_PROPERTIES_ORDER_INFO_SETTING_NAME,
    });
    return setting as FavoritePropertiesOrderInfo[];
  }

  public async savePropertiesOrder(orderInfos: FavoritePropertiesOrderInfo[], szewTwinId: string | undefined, ivaultId: string) {
    if (!IVaultApp.userPreferences) {
      throw new PresentationError(PresentationStatus.Error, "User preferences service is not set up");
    }

    const { accessToken } = await this.ensureIsSignedIn();
    await IVaultApp.userPreferences.save({
      accessToken,
      szewTwinId,
      iVaultId: ivaultId,
      namespace: IVAULTJS_PRESENTATION_SETTING_NAMESPACE,
      key: FAVORITE_PROPERTIES_ORDER_INFO_SETTING_NAME,
      content: orderInfos,
    });
  }
}

/** @internal */
export interface OfflineCachingFavoritePropertiesStorageProps {
  impl: IFavoritePropertiesStorage;
  connectivityInfo?: IConnectivityInformationProvider;
}
/** @internal */
export class OfflineCachingFavoritePropertiesStorage implements IFavoritePropertiesStorage, Disposable {
  private _connectivityInfo: IConnectivityInformationProvider;
  private _impl: IFavoritePropertiesStorage;
  private _propertiesOfflineCache = new DictionaryWithReservations<SZEWTwinAndIVaultIdsKey, Set<PropertyFullName>>(szewTwinAndIVaultIdsKeyComparer);
  private _propertiesOrderOfflineCache = new DictionaryWithReservations<SZEWTwinAndIVaultIdsKey, FavoritePropertiesOrderInfo[]>(szewTwinAndIVaultIdsKeyComparer);

  public constructor(props: OfflineCachingFavoritePropertiesStorageProps) {
    this._impl = props.impl;
    /* c8 ignore next */
    this._connectivityInfo = props.connectivityInfo ?? new ConnectivityInformationProvider();
    this._connectivityInfo.onInternetConnectivityChanged.addListener(this.onConnectivityStatusChanged);
  }

  public [Symbol.dispose]() {
    isDisposable(this._connectivityInfo) && this._connectivityInfo[Symbol.dispose]();
  }

  public get impl() {
    return this._impl;
  }

  private onConnectivityStatusChanged = (args: { status: InternetConnectivityStatus }) => {
    if (args.status === InternetConnectivityStatus.Online) {
      // note: we're copying the cached values to temp arrays because `saveProperties` and `savePropertiesOrder` both
      // attempt to modify cache dictionaries

      const propertiesCache = new Array<{ properties: Set<PropertyFullName>; szewTwinId?: string; ivaultId?: string }>();
      this._propertiesOfflineCache.forEach((key, value) => propertiesCache.push({ properties: value, szewTwinId: key[0], ivaultId: key[1] }));
      propertiesCache.forEach(async (cached) => this.saveProperties(cached.properties, cached.szewTwinId, cached.ivaultId));

      const ordersCache = new Array<{ order: FavoritePropertiesOrderInfo[]; szewTwinId?: string; ivaultId: string }>();
      this._propertiesOrderOfflineCache.forEach((key, value) => ordersCache.push({ order: value, szewTwinId: key[0], ivaultId: key[1]! }));
      ordersCache.forEach(async (cached) => this.savePropertiesOrder(cached.order, cached.szewTwinId, cached.ivaultId));
    }
  };

  public async loadProperties(szewTwinId?: string, ivaultId?: string) {
    if (this._connectivityInfo.status === InternetConnectivityStatus.Online) {
      try {
        return await this._impl.loadProperties(szewTwinId, ivaultId);
      } catch {
        // return from offline cache if the above fails
      }
    }
    return this._propertiesOfflineCache.get([szewTwinId, ivaultId]);
  }

  public async saveProperties(properties: Set<PropertyFullName>, szewTwinId?: string, ivaultId?: string) {
    const key: SZEWTwinAndIVaultIdsKey = [szewTwinId, ivaultId];
    if (this._connectivityInfo.status === InternetConnectivityStatus.Offline) {
      this._propertiesOfflineCache.set(key, properties);
      return;
    }
    const reservationId = this._propertiesOfflineCache.reserve(key);
    try {
      await this._impl.saveProperties(properties, szewTwinId, ivaultId);
      this._propertiesOfflineCache.reservedDelete(key, reservationId);
    } catch {
      this._propertiesOfflineCache.reservedSet(key, properties, reservationId);
    }
  }

  public async loadPropertiesOrder(szewTwinId: string | undefined, ivaultId: string) {
    if (this._connectivityInfo.status === InternetConnectivityStatus.Online) {
      try {
        return await this._impl.loadPropertiesOrder(szewTwinId, ivaultId);
      } catch {
        // return from offline cache if the above fails
      }
    }
    return this._propertiesOrderOfflineCache.get([szewTwinId, ivaultId]);
  }

  public async savePropertiesOrder(orderInfos: FavoritePropertiesOrderInfo[], szewTwinId: string | undefined, ivaultId: string) {
    const key: SZEWTwinAndIVaultIdsKey = [szewTwinId, ivaultId];
    if (this._connectivityInfo.status === InternetConnectivityStatus.Offline) {
      this._propertiesOrderOfflineCache.set(key, orderInfos);
      return;
    }
    const reservationId = this._propertiesOrderOfflineCache.reserve(key);
    try {
      await this._impl.savePropertiesOrder(orderInfos, szewTwinId, ivaultId);
      this._propertiesOrderOfflineCache.reservedDelete(key, reservationId);
    } catch {
      this._propertiesOrderOfflineCache.reservedSet(key, orderInfos, reservationId);
    }
  }
}

class DictionaryWithReservations<TKey, TValue> {
  private _impl: Dictionary<TKey, { value?: TValue; lastReservationId?: string }>;
  public constructor(compareKeys: OrderedComparator<TKey>) {
    this._impl = new Dictionary(compareKeys);
  }
  public get(key: TKey) {
    return this._impl.get(key)?.value;
  }
  public forEach(func: (key: TKey, value: TValue) => void): void {
    this._impl.forEach((key, entry) => {
      if (entry.value) {
        func(key, entry.value);
      }
    });
  }
  public reserve(key: TKey) {
    const reservationId = Guid.createValue();
    this._impl.set(key, { lastReservationId: reservationId });
    return reservationId;
  }
  public set(key: TKey, value: TValue) {
    return this._impl.set(key, { value });
  }
  public reservedSet(key: TKey, value: TValue, reservationId: string) {
    const entry = this._impl.get(key);
    if (entry && entry.lastReservationId === reservationId) {
      this._impl.set(key, { value });
    }
  }
  public reservedDelete(key: TKey, reservationId: string) {
    const entry = this._impl.get(key);
    if (entry && entry.lastReservationId === reservationId) {
      this._impl.delete(key);
    }
  }
}
type SZEWTwinAndIVaultIdsKey = [string | undefined, string | undefined];

/* c8 ignore next 4 */
function szewTwinAndIVaultIdsKeyComparer(lhs: SZEWTwinAndIVaultIdsKey, rhs: SZEWTwinAndIVaultIdsKey) {
  const szewTwinIdCompare = compareStrings(lhs[0] ?? "", rhs[0] ?? "");
  return szewTwinIdCompare !== 0 ? szewTwinIdCompare : compareStrings(lhs[1] ?? "", rhs[1] ?? "");
}

/** @internal */
/* c8 ignore start */
export class NoopFavoritePropertiesStorage implements IFavoritePropertiesStorage {
  public async loadProperties(_szewTwinId?: string, _ivaultId?: string): Promise<Set<PropertyFullName> | undefined> {
    return undefined;
  }
  public async saveProperties(_properties: Set<PropertyFullName>, _szewTwinId?: string, _ivaultId?: string) {}
  public async loadPropertiesOrder(_szewTwinId: string | undefined, _ivaultId: string): Promise<FavoritePropertiesOrderInfo[] | undefined> {
    return undefined;
  }
  public async savePropertiesOrder(_orderInfos: FavoritePropertiesOrderInfo[], _szewTwinId: string | undefined, _ivaultId: string): Promise<void> {}
}
/* c8 ignore end */

/** @internal */
export class BrowserLocalFavoritePropertiesStorage implements IFavoritePropertiesStorage {
  private _localStorage: Storage;

  public constructor(props?: { localStorage?: Storage }) {
    /* c8 ignore next */
    this._localStorage = props?.localStorage ?? window.localStorage;
  }

  public createFavoritesSettingItemKey(szewTwinId?: string, ivaultId?: string): string {
    return `${IVAULTJS_PRESENTATION_SETTING_NAMESPACE}${FAVORITE_PROPERTIES_SETTING_NAME}?szewTwinId=${szewTwinId}&ivaultId=${ivaultId}`;
  }
  public createOrderSettingItemKey(szewTwinId?: string, ivaultId?: string): string {
    return `${IVAULTJS_PRESENTATION_SETTING_NAMESPACE}${FAVORITE_PROPERTIES_ORDER_INFO_SETTING_NAME}?szewTwinId=${szewTwinId}&ivaultId=${ivaultId}`;
  }

  public async loadProperties(szewTwinId?: string, ivaultId?: string): Promise<Set<PropertyFullName> | undefined> {
    const value = this._localStorage.getItem(this.createFavoritesSettingItemKey(szewTwinId, ivaultId));
    if (!value) {
      return undefined;
    }

    const properties: PropertyFullName[] = JSON.parse(value);
    return new Set(properties);
  }

  public async saveProperties(properties: Set<PropertyFullName>, szewTwinId?: string, ivaultId?: string) {
    this._localStorage.setItem(this.createFavoritesSettingItemKey(szewTwinId, ivaultId), JSON.stringify([...properties]));
  }

  public async loadPropertiesOrder(szewTwinId: string | undefined, ivaultId: string): Promise<FavoritePropertiesOrderInfo[] | undefined> {
    const value = this._localStorage.getItem(this.createOrderSettingItemKey(szewTwinId, ivaultId));
    if (!value) {
      return undefined;
    }

    const orderInfos: FavoritePropertiesOrderInfo[] = JSON.parse(value).map((json: any) => ({
      ...json,
      orderedTimestamp: new Date(json.orderedTimestamp),
    }));
    return orderInfos;
  }

  public async savePropertiesOrder(orderInfos: FavoritePropertiesOrderInfo[], szewTwinId: string | undefined, ivaultId: string): Promise<void> {
    this._localStorage.setItem(this.createOrderSettingItemKey(szewTwinId, ivaultId), JSON.stringify(orderInfos));
  }
}
