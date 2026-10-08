/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ProcessDetector } from "@szewtwin/core-szewec";
import { createButton, createTextBox, TextBoxProps } from "@szewtwin/frontend-devtools";
import { getConfigurationString } from "./DisplayTestApp";
import { ToolBarDropDown } from "./ToolBar";

export class HubPicker extends ToolBarDropDown {
  private readonly _parent: HTMLElement;
  private readonly _element: HTMLElement;
  private _iVaultIdInput: HTMLInputElement | undefined;
  private _szewTwinIdInput: HTMLInputElement | undefined;
  private _onOpenIVault: (iVaultId: string, szewTwinId: string) => void;
  private static _lastSZEWTwinId: string | undefined;
  private static _lastIVaultId: string | undefined;
  private _inputWidth = 300;
  private _totalWidth = this._inputWidth + 95;

  public constructor(parent: HTMLElement, onOpenIVault: (iVaultId: string, szewTwinId: string) => void) {
    super();
    if (ProcessDetector.isIOSAppFrontend) {
      this._inputWidth = 255;
      this._totalWidth = this._inputWidth + 110;
    }
    this._parent = parent;
    this._onOpenIVault = onOpenIVault;
    this._element = document.createElement("div");
    this._element.className = "debugPanel";
    this._element.style.width = `${this._totalWidth}px`;
    parent.appendChild(this._element);
    if (HubPicker._lastSZEWTwinId === undefined) {
      HubPicker._lastSZEWTwinId = getConfigurationString("szewTwinId");
    }
    if (HubPicker._lastIVaultId === undefined) {
      HubPicker._lastIVaultId = getConfigurationString("iVaultId");
    }
  }

  protected _open(): void { this._element.style.display = "block"; }
  protected _close(): void { this._element.style.display = "none"; }
  public get isOpen(): boolean { return "none" !== this._element.style.display; }

  private _createTextBox(props: TextBoxProps, defaultValue: string | undefined) {
    const div = this._element.appendChild(document.createElement("div"));
    div.className = "inputDiv";
    const textbox = createTextBox({
      ...props,
      parent: div,
      inline: true,
    }).textbox;
    textbox.defaultValue = defaultValue ?? "";
    textbox.style.width = `${this._inputWidth}px`;
    textbox.style.fontFamily = "monospace";
    return textbox;
  }

  private openIVault() {
    const iVaultId = this._iVaultIdInput?.value;
    const szewTwinId = this._szewTwinIdInput?.value;
    // Note: below checks for undefined OR empty.
    if (iVaultId && szewTwinId) {
      HubPicker._lastSZEWTwinId = szewTwinId;
      HubPicker._lastIVaultId = iVaultId;
      this._onOpenIVault(iVaultId, szewTwinId);
    } else {
      alert("You must enter an szewTwinId and an iVaultId");
    }
  }

  public async populate(): Promise<void> {
    this._szewTwinIdInput = this._createTextBox({
      label: "szewTwin Id: ",
      id: "HubPicker_szewTwinId",
      tooltip: "Enter the szewTwin Id of the iVault to load",
    }, HubPicker._lastSZEWTwinId);
    this._iVaultIdInput = this._createTextBox({
      label: "iVault Id: ",
      id: "HubPicker_iVaultId",
      tooltip: "Enter the iVault Id of the iVault to load",
    }, HubPicker._lastIVaultId);
    const openIVaultDiv = this._element.appendChild(document.createElement("div"));
    openIVaultDiv.className = "inputDiv";
    createButton({
      parent: openIVaultDiv,
      value: "Open hub iVault",
      inline: true,
      handler: () => this.openIVault(),
      tooltip: "Download and open hub iVault",
    });
  }
}
