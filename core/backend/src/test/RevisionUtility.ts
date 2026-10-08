/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SzewecStatus } from "@szewtwin/core-szewec";
import { IVaultNative } from "../internal/NativePlatform";
import { IVaultJsFs } from "../IVaultJsFs";

export interface LzmaParams {
  dictSize?: number;
  level?: number;
  lc?: number;
  lp?: number;
  pb?: number;
  fb?: number;
  numHashBytes?: number;
  mc?: number;
  writeEndMark?: number;
  btMode?: number;
  numThreads?: number;
  blockSize?: number;
  numBlockThreads?: number;
  numTotalThreads?: number;
  algo?: number;
}

export interface ChangesetSizeInfo {
  compressSize?: number;
  uncompressSize?: number;
  prefixSize?: number;
}

export class RevisionUtility {
  public static readonly DEFAULT: LzmaParams = {
    algo: 1,
    blockSize: 67108864,
    btMode: 1,
    dictSize: 16777216,
    fb: 64,
    lc: 3,
    level: 7,
    lp: 0,
    mc: 48,
    numBlockThreads: 4,
    numHashBytes: 4,
    numThreads: 2,
    numTotalThreads: 8,
    pb: 2,
    writeEndMark: 0,
  };

  public static recompressRevision(sourceFile: string, targetFile: string, lzmaProps?: LzmaParams): SzewecStatus {
    if (!IVaultJsFs.existsSync(sourceFile))
      throw new Error("SourceFile does not exists");
    return IVaultNative.platform.RevisionUtility.recompressRevision(sourceFile, targetFile, lzmaProps ? JSON.stringify(lzmaProps) : undefined);
  }
  public static disassembleRevision(sourceFile: string, targetDir: string): SzewecStatus {
    if (!IVaultJsFs.existsSync(sourceFile))
      throw new Error("SourceFile does not exists");
    return IVaultNative.platform.RevisionUtility.disassembleRevision(sourceFile, targetDir);
  }
  public static assembleRevision(targetFile: string, rawChangesetFile: string, prefixFile?: string, lzmaProps?: LzmaParams): SzewecStatus {
    if (!IVaultJsFs.existsSync(rawChangesetFile))
      throw new Error("RawChangesetFile does not exists");
    if (prefixFile && !IVaultJsFs.existsSync(prefixFile))
      throw new Error("prefixFile does not exists");
    return IVaultNative.platform.RevisionUtility.assembleRevision(targetFile, rawChangesetFile, prefixFile, lzmaProps ? JSON.stringify(lzmaProps) : undefined);
  }
  public static normalizeLzmaParams(lzmaProps?: LzmaParams): LzmaParams {
    return JSON.parse(IVaultNative.platform.RevisionUtility.normalizeLzmaParams(lzmaProps ? JSON.stringify(lzmaProps) : undefined)) as LzmaParams;
  }
  public static computeStatistics(sourceFile: string, addPrefix: boolean = true): any {
    if (!IVaultJsFs.existsSync(sourceFile))
      throw new Error("SourceFile does not exists");
    return JSON.parse(IVaultNative.platform.RevisionUtility.computeStatistics(sourceFile, addPrefix));
  }
  public static getUncompressSize(sourceFile: string): ChangesetSizeInfo {
    if (!IVaultJsFs.existsSync(sourceFile))
      throw new Error("SourceFile does not exists");
    return JSON.parse(IVaultNative.platform.RevisionUtility.getUncompressSize(sourceFile)) as ChangesetSizeInfo;
  }
}
