/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IpcApp } from "@szewtwin/core-frontend";
import { RulesetVariable } from "@szewtwin/presentation-common";
import { PRESENTATION_IPC_CHANNEL_NAME, PresentationIpcInterface } from "@szewtwin/presentation-common/internal";

interface SetRulesetVariableParams {
  rulesetId: string;
  variable: RulesetVariable;
}

interface UnsetRulesetVariableParams {
  rulesetId: string;
  variableId: string;
}

/** @internal */
export class IpcRequestsHandler {
  private _ipcProxy = IpcApp.makeIpcProxy<PresentationIpcInterface>(PRESENTATION_IPC_CHANNEL_NAME);
  public readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  public async setRulesetVariable(params: SetRulesetVariableParams) {
    return this._ipcProxy.setRulesetVariable({
      ...params,
      clientId: this.clientId,
      variable: RulesetVariable.toJSON(params.variable),
    });
  }

  public async unsetRulesetVariable(params: UnsetRulesetVariableParams) {
    return this._ipcProxy.unsetRulesetVariable({
      ...params,
      clientId: this.clientId,
    });
  }
}
