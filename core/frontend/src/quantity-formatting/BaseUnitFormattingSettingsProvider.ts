/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormatting
 */

import { FormatProps, UnitSystemKey } from "@szewtwin/core-quantity";
import { IVaultApp } from "../IVaultApp";
import { IVaultConnection } from "../IVaultConnection";
import { SelectedViewportChangedArgs } from "../ViewManager";
import {
  FormattingUnitSystemChangedArgs, OverrideFormatEntry, QuantityFormatOverridesChangedArgs, QuantityFormatter,
  QuantityTypeKey, UnitFormattingSettingsProvider,
} from "./QuantityFormatter";

/** This abstract class reacts to changes in the "active" iVault and updates the [[QuantityFormatter]] overrides and active
 * presentation unit system based on stored preferences.  In addition, monitors the [[QuantityFormatter]] for changes to format overrides and the active
 * unit system and stores these changes. The "active" iVault is determined by listening to the `IVaultApp.viewManager.onSelectedViewportChanged` event
 * and gets the iVault from the selected viewport.
 * @beta
 */
export abstract class BaseUnitFormattingSettingsProvider implements UnitFormattingSettingsProvider {
  protected _ivaultConnection: IVaultConnection | undefined;

  /**
   * @param maintainOverridesPerIVault If maintainOverridesPerIVault is true the base class will set up listeners
   * to monitor "active" iVault changes so the overrides for the QuantityFormatter properly match the overrides set
   * up by the user. If false then the overrides are maintained only per user.
   * @beta
   */
  constructor(private _quantityFormatter: QuantityFormatter, private _maintainOverridesPerIVault?: boolean) {
    if (this._maintainOverridesPerIVault) {
      IVaultApp.viewManager.onSelectedViewportChanged.addListener(this.handleViewportChanged);
      IVaultConnection.onOpen.addListener(this.handleIVaultOpen);
      IVaultConnection.onClose.addListener(this.handleIVaultClose);
    }
  }

  public get maintainOverridesPerIVault(): boolean {
    return !!this._maintainOverridesPerIVault;
  }

  public storeFormatOverrides = async ({typeKey, overrideEntry, unitSystem}: QuantityFormatOverridesChangedArgs) => {
    if (undefined === overrideEntry) {
      // remove all overrides for quantity type
      if (undefined === unitSystem) {
        await this.remove (typeKey);
        return;
      }else {
        // remove only system specific overrides for quantity type
        const storedJson = await this.retrieve (typeKey);
        if (storedJson) {
          delete storedJson[unitSystem];
          if (Object.keys(storedJson).length) {
            await this.store (typeKey, storedJson);
          } else {
            await this.remove (typeKey);
          }
        }
      }
    } else {
      // setting a new override or set of overrides
      const storedJson = await this.retrieve (typeKey);
      const updatedFormat = {...storedJson, ...overrideEntry};
      await this.store (typeKey, updatedFormat);
    }
  };

  /** save UnitSystem for active iVault */
  public storeUnitSystemSetting = async ({system}: FormattingUnitSystemChangedArgs) => {
    await this.storeUnitSystemKey(system);
  };

  public async loadOverrides(ivault?: IVaultConnection): Promise<void> {
    await this.applyQuantityFormattingSettingsForIVault(ivault);
  }

  protected applyQuantityFormattingSettingsForIVault = async (ivault?: IVaultConnection) => {
    if (this._maintainOverridesPerIVault)
      this._ivaultConnection = ivault;
    const overrideFormatProps = await this.buildQuantityFormatOverridesMap();
    const unitSystemKey = await this.retrieveUnitSystem (this._quantityFormatter.activeUnitSystem);
    await this._quantityFormatter.reinitializeFormatAndParsingsMaps(overrideFormatProps, unitSystemKey, true, true);
  };

  private handleIVaultOpen = async (ivault: IVaultConnection) => {
    await this.applyQuantityFormattingSettingsForIVault (ivault);
  };

  private handleViewportChanged = async (args: SelectedViewportChangedArgs) => {
    if(args.current?.iVault && (args.current?.iVault?.iVaultId !== this.ivaultConnection?.iVaultId)) {
      await this.applyQuantityFormattingSettingsForIVault (args.current?.iVault);
    }
  };

  private handleIVaultClose = async () => {
    this._ivaultConnection = undefined;
  };

  protected get ivaultConnection() {
    return  this._ivaultConnection;
  }

  /** function to convert from serialized JSON format for Quantity Type overrides to build a map compatible with QuantityManager */
  protected async buildQuantityFormatOverridesMap() {
    const overrideFormatProps = new Map<UnitSystemKey, Map<QuantityTypeKey, FormatProps>>();

    // use map and await all returned promises - overrides are stored by QuantityType
    for (const quantityTypeKey of [...this._quantityFormatter.quantityTypesRegistry.keys()]) {
      const quantityTypeDef = this._quantityFormatter.quantityTypesRegistry.get(quantityTypeKey);
      if (quantityTypeDef) {
        const typeKey = quantityTypeDef.key;
        const overrideEntry = await this.retrieve (typeKey);
        if (overrideEntry) {
          // extract overrides and insert into appropriate override map entry
          Object.keys(overrideEntry).forEach ((systemKey) => {
            const unitSystemKey = systemKey as UnitSystemKey;
            const props = overrideEntry[unitSystemKey];
            if (props) {
              if (overrideFormatProps.has(unitSystemKey)) {
                // We just verified that the overrideFormatProps map has the unitSystemKey
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                overrideFormatProps.get(unitSystemKey)!.set(typeKey, props);
              } else {
                const newMap = new Map<string, FormatProps>();
                newMap.set(typeKey, props);
                overrideFormatProps.set(unitSystemKey, newMap);
              }
            }
          });
        }
      }
    }
    return overrideFormatProps;
  }

  /** Serializes JSON object containing format overrides for a specific quantity type. */
  public abstract store(quantityTypeKey: QuantityTypeKey, overrideProps: OverrideFormatEntry): Promise<boolean>;

  /** Retrieves serialized JSON object containing format overrides for a specific quantity type. */
  public abstract retrieve(quantityTypeKey: QuantityTypeKey): Promise<OverrideFormatEntry|undefined>;

  /** Removes the override formats for a specific quantity type. */
  public abstract remove(quantityTypeKey: QuantityTypeKey): Promise<boolean>;

  /** Retrieves the active unit system typically based on the "active" iVaultConnection. */
  public abstract retrieveUnitSystem(defaultKey: UnitSystemKey): Promise<UnitSystemKey>;

  /** Store the active unit system typically for the "active" iVaultConnection. */
  public abstract storeUnitSystemKey(unitSystemKey: UnitSystemKey): Promise<boolean>;
}

