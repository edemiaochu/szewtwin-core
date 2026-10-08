/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ElectronRendererAuthorization } from "@szewtwin/electron-authorization/Renderer";
import { IVaultApp  } from "@szewtwin/core-frontend";
import { BrowserAuthorizationClient } from "@szewtwin/browser-authorization";
import { AccessToken, ProcessDetector } from "@szewtwin/core-szewec";
import { getConfigurationString } from "./DisplayTestApp";

// Wraps the signIn process
// @return Promise that resolves to true after signIn is complete
export async function signIn(): Promise<boolean> {
  const existingAuthClient = IVaultApp.authorizationClient;
  if (undefined !== existingAuthClient && (existingAuthClient instanceof BrowserAuthorizationClient || existingAuthClient instanceof ElectronRendererAuthorization)) {
    if (existingAuthClient.isAuthorized) {
      return (await existingAuthClient.getAccessToken()) !== undefined;
    }

    return new Promise<boolean>((resolve, reject) => {
      existingAuthClient.onAccessTokenChanged.addOnce((token: AccessToken) => resolve(!!token));
      existingAuthClient.signIn().catch((err: Error) => reject(err));
    });
  }

  let authClient: ElectronRendererAuthorization | BrowserAuthorizationClient | undefined;
  if (ProcessDetector.isElectronAppFrontend) {
    authClient = new ElectronRendererAuthorization({
      clientId: getConfigurationString("oidcClientId") ?? "ivaultjs-spa-test",
    });
  } else if (ProcessDetector.isMobileAppFrontend) {
    // The default auth client works on mobile
    const accessToken = await IVaultApp.authorizationClient?.getAccessToken();
    return !!accessToken;
  } else {
    const clientId = getConfigurationString("oidcClientId") ?? "ivaultjs-spa-test";
    const redirectUri = getConfigurationString("oidcRedirectUri") ?? "http://localhost:3000/signin-callback";
    const scope = getConfigurationString("oidcScope") ?? "projects:read realitydata:read ivaults:read ivaults:modify ivaultaccess:read";
    const responseType = "code";
    authClient = new BrowserAuthorizationClient({
      clientId,
      redirectUri,
      scope,
      responseType,
    });
    try {
      await authClient.signInSilent();
    } catch { }
  }

  if (typeof authClient === "undefined") {
    return false;
  } else {
    IVaultApp.authorizationClient = authClient;
    if (authClient.isAuthorized)
      return true;

    return new Promise<boolean>((resolve, reject) => {
      authClient.onAccessTokenChanged.addOnce((token: AccessToken) => resolve(!!token));
      authClient.signIn().catch((err: Error) => reject(err));
    });
  }
}

export async function signOut(): Promise<void> {
  const auth = IVaultApp.authorizationClient;
  if (auth instanceof ElectronRendererAuthorization || auth instanceof BrowserAuthorizationClient){
    await auth.signOut();
    IVaultApp.authorizationClient = undefined;
  }
}
