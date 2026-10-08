# 新建空白 BIM 文件功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 display-test-app（Electron）中通过工具栏按钮 / key-in 创建空白可编辑 .dtw 文件并自动打开显示。

**Architecture:** 前端（renderer）通过 IPC channel `display-test-app/dta` 调用后端（Electron main）的 `createNewIVault`，后端用 `StandaloneDb.createEmpty` 创建空白 standalone iVault 并关闭，前端再用 `BriefcaseConnection.openStandalone` 以读写模式打开并在新 Viewer 中显示。平台仅限 Electron。

**Tech Stack:** TypeScript、Rush monorepo（@szewtwin 定制分叉）、Electron IPC（`IpcHandler`/`makeIpcProxy`）、`@szewtwin/core-backend` StandaloneDb、`@szewtwin/core-frontend` BriefcaseConnection。

**Spec:** `docs/superpowers/specs/2026-09-04-create-new-ivault-design.md`

## Global Constraints

- **非 git 仓库**（`git rev-parse` 在 szewtwinjs-core 下失败）：所有 commit 步骤省略，改为构建验证检查点。
- **无测试框架**：display-test-app 的 package.json `test` script 为空，不写自动化测试；验证 = `rushx build` 编译 + `rushx start` 手动检查。
- **Rush monorepo**：只在 `test-apps/display-test-app` 内用 `rushx`，绝不用 `npm`/`pnpm` 直接操作（CLAUDE.md）。
- 平台范围仅 Electron；文件扩展名 `.dtw`/`.dtw`；新文件必须 `enableTransactions: true`。
- 术语沿用分叉命名：iVault（不是 iVault）、IVaultApp、IVaultConnection。
- 前端错误处理沿用 `try/catch + alert` 模式；后端抛 `Error`，错误信息经 IPC 传回前端显示。
- 本仓库 lint 使用 `eslint.config.js`；如 build/lint 报错按仓库现有风格修复。

## File Structure

| 文件 | 责任 |
|---|---|
| `test-apps/display-test-app/src/common/DtaIpcInterface.ts` | IPC 契约：`CreateNewIVaultArgs` + `createNewIVault` 方法声明 |
| `test-apps/display-test-app/src/backend/CreateNewIVaultImpl.ts` | **新建**：创建空白 standalone iVault 的纯函数实现 |
| `test-apps/display-test-app/src/backend/DtaElectronMain.ts` | `DtaHandler` 增加 `createNewIVault` 委托方法 |
| `test-apps/display-test-app/src/frontend/FileOpen.ts` | **新建函数** `selectSaveFileName()`：Electron 保存对话框 |
| `test-apps/display-test-app/src/frontend/Surface.ts` | 工具栏按钮、`createNewIVault()` 方法、`NewIVaultTool` |
| `test-apps/display-test-app/src/frontend/App.ts` | 注册 `NewIVaultTool` |

---

### Task 0: 环境准备（前置检查）

**Files:**
- 无文件变更

**Interfaces:**
- Consumes: 无
- Produces: 可编译运行的 display-test-app（node_modules 就绪）

- [ ] **Step 1: 安装依赖**

display-test-app 的 node_modules 当前不存在（本会话早前已确认），必须先安装：

```bash
cd D:/01Work/NameReplaceTest/szewtwinjs-core
rush install
```

预期：命令成功完成，`test-apps/display-test-app/node_modules/.bin/cross-env` 存在。

- [ ] **Step 2: 确认基线可编译**

```bash
cd test-apps/display-test-app
rushx build
```

预期：build 成功（若基线本身有错误，先记录并与用户确认后再继续）。

- [ ] **Step 3: 记录基线**

运行 `rushx start` 确认应用可启动（第一次启动 Electron 可能较慢）。此时不要求功能验证，仅确认基线可用。

---

### Task 1: 后端 — IPC 契约与创建实现

**Files:**
- Modify: `test-apps/display-test-app/src/common/DtaIpcInterface.ts`
- Create: `test-apps/display-test-app/src/backend/CreateNewIVaultImpl.ts`
- Modify: `test-apps/display-test-app/src/backend/DtaElectronMain.ts`

**Interfaces:**
- Consumes: `StandaloneDb.createEmpty(filePath: string, args: CreateEmptyStandaloneIVaultProps)` from `@szewtwin/core-backend`（`rootSubject.name`、`enableTransactions` 字段已在 `core/common/src/IVault.ts:209-228` 定义；`LocalHub.ts:117` 有 `rootSubject: { name }` 用法先例）
- Produces:
  - `interface CreateNewIVaultArgs { filePath: string; name?: string }`（`src/common/DtaIpcInterface.ts` 导出）
  - `createNewIVault(args: CreateNewIVaultArgs): Promise<string>` — IPC 方法；返回规范化后的绝对路径（无 `.dtw`/`.dtw` 扩展名时补 `.dtw`）

- [ ] **Step 1: 在 DtaIpcInterface.ts 声明契约**

在 `DtaIpcInterface.ts` 的 `CreateSectionDrawingViewResult` 接口之后（约第 33 行）插入：

```ts
/** Arguments for DtaIpcInterface.createNewIVault. */
export interface CreateNewIVaultArgs {
  /** The absolute path of the new .dtw file. A ".dtw" extension is appended if the path has no ".dtw"/".dtw" extension. */
  filePath: string;
  /** Name for the root Subject of the new iVault. Defaults to the file name (without extension). */
  name?: string;
}
```

并在 `DtaIpcInterface` 接口内、`sayHello` 方法之后（约第 37 行）插入：

```ts
  /** Creates a new empty standalone iVault (.dtw) file on disk, then closes it so the frontend can open it.
   * Returns the (possibly normalized) absolute path of the created file.
   */
  createNewIVault(args: CreateNewIVaultArgs): Promise<string>;
```

- [ ] **Step 2: 新建 CreateNewIVaultImpl.ts**

创建 `test-apps/display-test-app/src/backend/CreateNewIVaultImpl.ts`（文件头注释仿照 `SectionDrawingImpl.ts`）：

```ts
/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { StandaloneDb } from "@szewtwin/core-backend";
import { CreateNewIVaultArgs } from "../common/DtaIpcInterface";

/** Appends a ".dtw" extension to `filePath` if it does not already end in ".dtw" or ".dtw". */
function normalizeFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ".dtw" === ext || ".dtw" === ext ? filePath : `${filePath}.dtw`;
}

/** Creates a new, empty, editable standalone iVault (.dtw) file on disk. */
export function createNewIVault(args: CreateNewIVaultArgs): string {
  const filePath = normalizeFilePath(args.filePath);
  if (fs.existsSync(filePath))
    throw new Error(`File already exists: ${filePath}`);

  const name = args.name ?? path.basename(filePath, path.extname(filePath));
  const db = StandaloneDb.createEmpty(filePath, {
    rootSubject: { name },
    enableTransactions: true,
  });
  db.close(); // createEmpty has already saved the file to disk; close it so the frontend can open it.

  return filePath;
}
```

- [ ] **Step 3: DtaHandler 增加委托方法**

`DtaElectronMain.ts`：

1. 扩展第 8 行 import，加入 `CreateNewIVaultArgs`：

```ts
import { CreateNewIVaultArgs, CreateSectionDrawingViewArgs, CreateSectionDrawingViewResult, dtaChannel, DtaIpcInterface } from "../common/DtaIpcInterface";
```

2. 在第 14 行 import 区域新增：

```ts
import { createNewIVault } from "./CreateNewIVaultImpl";
```

3. 在 `DtaHandler` 类内、`sayHello` 方法之后插入：

```ts
  public async createNewIVault(args: CreateNewIVaultArgs): Promise<string> {
    return createNewIVault(args);
  }
```

- [ ] **Step 4: 构建验证**

```bash
cd D:/01Work/NameReplaceTest/szewtwinjs-core/test-apps/display-test-app
rushx build
```

预期：build 成功。若失败，按错误信息修复（注意：`CreateEmptyStandaloneIVaultProps` 类型来自 `@szewtwin/core-common` 的 re-export，无需显式 import）。

---

### Task 2: 前端 — 保存对话框 selectSaveFileName

**Files:**
- Modify: `test-apps/display-test-app/src/frontend/FileOpen.ts`

**Interfaces:**
- Consumes: `ElectronApp.dialogIpc`（`Electron.Dialog` 的完整 IPC 代理，`core/electron/src/frontend/ElectronApp.ts:84` 定义，`showSaveDialog` 可用）
- Produces: `selectSaveFileName(): Promise<string | undefined>` — 取消返回 undefined；非 Electron 平台返回 undefined

- [ ] **Step 1: 修改 electron 类型导入**

`FileOpen.ts` 第 8 行：

```ts
import { OpenDialogOptions } from "electron";
```

改为：

```ts
import { OpenDialogOptions, SaveDialogOptions } from "electron";
```

- [ ] **Step 2: 新增 selectSaveFileName 函数**

在 `FileOpen.ts` 的 `selectFileName` 函数之后（约第 113 行）插入：

```ts
export async function selectSaveFileName(): Promise<string | undefined> {
  if (ProcessDetector.isElectronAppFrontend) {
    const opts: SaveDialogOptions = {
      title: "Create New iVault",
      defaultPath: "NewIVault.dtw",
      filters: [{ name: "iVaults", extensions: ["bim", "ibim"] }],
    };
    const val = await ElectronApp.dialogIpc.showSaveDialog(opts);
    return val.canceled ? undefined : val.filePath;
  }

  return undefined; // Creating new iVault files is only supported in Electron.
}
```

- [ ] **Step 3: 构建验证**

```bash
cd D:/01Work/NameReplaceTest/szewtwinjs-core/test-apps/display-test-app
rushx build
```

预期：build 成功（该函数暂无人调用，导出函数不会被 no-unused-vars 报错）。

---

### Task 3: 前端 — Surface 接线与工具注册

**Files:**
- Modify: `test-apps/display-test-app/src/frontend/Surface.ts`
- Modify: `test-apps/display-test-app/src/frontend/App.ts`

**Interfaces:**
- Consumes:
  - `createNewIVault(args: CreateNewIVaultArgs): Promise<string>`（Task 1）
  - `selectSaveFileName(): Promise<string | undefined>`（Task 2）
  - `dtaIpc`（`App.ts:188` 导出：`IpcApp.makeIpcProxy<DtaIpcInterface>(dtaChannel)`）
  - `BriefcaseConnection.openStandalone(filePath: string, openMode: OpenMode, opts?: StandaloneOpenOptions): Promise<BriefcaseConnection>`（`core/frontend/src/BriefcaseConnection.ts:333`）
- Produces:
  - `Surface.createNewIVault(fileName?: string): Promise<void>` — public，供 `NewIVaultTool` 调用
  - `NewIVaultTool`（toolId "NewIVault"，0~1 参数）

- [ ] **Step 1: Surface.ts 补充 import**

1. 第 8 行 `@szewtwin/core-frontend` 的 import 加入 `BriefcaseConnection`：

```ts
import { BlankConnection, BlankConnectionProps, BriefcaseConnection, IVaultApp, Tool } from "@szewtwin/core-frontend";
```

2. 第 6 行 `@szewtwin/core-geometry` import 附近新增 `ProcessDetector` 与 `OpenMode` import（插在第 6 行之前）：

```ts
import { OpenMode, ProcessDetector } from "@szewtwin/core-szewec";
```

3. 第 10 行 FileOpen import 加入 `selectSaveFileName`：

```ts
import { BrowserFileSelector, selectFileName, selectJsonConfigFilename, selectSaveFileName } from "./FileOpen";
```

4. 第 9 行 App import 加入 `dtaIpc`：

```ts
import { DisplayTestApp, dtaIpc } from "./App";
```

说明：App ↔ Surface 循环导入已存在且工作正常（`dtaIpc` 只在运行时于方法内解引用，无模块初始化 TDZ 问题）。

- [ ] **Step 2: 工具栏新增按钮**

在 `createToolBar()` 中、"Open iVault from disk" 按钮（第 126-132 行）之后插入：

```ts
    tb.addItem(createToolButton({
      iconUnicode: "\ue942", // "file-empty"
      tooltip: "Create New iVault",
      click: async () => {
        await this.createNewIVault();
      },
    }));
```

- [ ] **Step 3: 新增 createNewIVault 方法**

在 `openFileIVault` 方法（约第 195 行）之后插入：

```ts
  public async createNewIVault(fileName?: string): Promise<void> {
    if (!ProcessDetector.isElectronAppFrontend) {
      alert("Creating new iVault files is only supported in Electron.");
      return;
    }

    const filePath = fileName ?? await selectSaveFileName();
    if (undefined === filePath)
      return;

    try {
      const createdPath = await dtaIpc.createNewIVault({ filePath });
      const iVault = await BriefcaseConnection.openStandalone(createdPath, OpenMode.ReadWrite);
      setTitle(iVault);
      const viewer = await this.createViewer({ iVault, configuration: this.configuration });
      viewer.dock(Dock.Full);
    } catch (err: any) {
      alert(`Error creating iVault: ${err.toString()}`);
    }
  }
```

- [ ] **Step 4: 新增 NewIVaultTool**

在 `OpenIVaultTool` 类（约第 630-643 行）之后、`CloseIVaultTool` 之前插入：

```ts
export class NewIVaultTool extends Tool {
  public static override toolId = "NewIVault";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override async run(filePath?: string): Promise<boolean> {
    await Surface.instance.createNewIVault(filePath);
    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    return this.run(args[0]);
  }
}
```

- [ ] **Step 5: App.ts 注册工具**

1. 第 50 行 `./Surface` 的 import 中，在 `MaximizeWindowTool` 与 `OpenIVaultTool` 之间加入 `NewIVaultTool`：

```ts
  CloneViewportTool, CloseIVaultTool, CloseWindowTool, CreateWindowTool, DockWindowTool, FocusWindowTool, MaximizeWindowTool, NewIVaultTool, OpenIVaultTool,
```

2. 第 367 行起的工具注册数组中，在 `MoveElementTool,`（第 397 行）与 `OpenIVaultTool,`（第 398 行）之间加入 `NewIVaultTool,`。

- [ ] **Step 6: 构建验证**

```bash
cd D:/01Work/NameReplaceTest/szewtwinjs-core/test-apps/display-test-app
rushx build
```

预期：build 成功。若 eslint 报错，按仓库现有风格修复（例如错误信息字符串、`any` 用法与 `Surface.ts` 现有 `catch (err: any)` 保持一致）。

---

### Task 4: 端到端手动验收

**Files:**
- 无文件变更

**Interfaces:**
- Consumes: Task 1-3 的全部产物

- [ ] **Step 1: 启动应用**

```bash
cd D:/01Work/NameReplaceTest/szewtwinjs-core/test-apps/display-test-app
rushx start
```

- [ ] **Step 2: 验证工具栏按钮流程**

1. 点击工具栏新按钮（file-empty 图标，tooltip "Create New iVault"）。
2. 弹出系统保存对话框（标题 "Create New iVault"，默认文件名 NewIVault.dtw）。
3. 选择路径并保存（可故意不写扩展名，验证自动补 `.dtw`）。
4. 新文件自动以读写模式打开并显示在新 Viewer 中。
5. 验证文件可编辑：例如用 key-in `editing scope` 进入编辑会话插入元素并保存。
6. 关闭该 Viewer 后，用 "Open iVault from disk" 按钮重新打开该文件，确认文件有效。

- [ ] **Step 3: 验证 key-in 流程**

1. key-in 输入 `newivault` → 弹出保存对话框，行为同 Step 2。
2. key-in 输入 `newivault C:\temp\test-keyin`（不存在扩展名）→ 直接创建 `C:\temp\test-keyin.dtw` 并打开。
3. 对已存在的路径再次 `newivault C:\temp\test-keyin.dtw` → 弹出 alert 提示文件已存在，且不覆盖原文件。

- [ ] **Step 4: 验证取消与错误路径**

1. 保存对话框中点击取消 → 静默返回，无错误弹窗。
2. key-in `newivault Z:\不存在目录\x.dtw` → alert 显示创建失败错误。

- [ ] **Step 5: 验收结论**

全部通过后在计划下方勾选本任务完成；任何失败回到对应 Task 修复后重新验证。验收完成后向用户汇报结果。
