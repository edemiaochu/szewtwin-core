# 变更整理：新建空白 BIM 文件功能（display-test-app）

日期：2026-09-04
关联：spec 见 `2026-09-04-create-new-ivault-design.md`，计划见 `../plans/2026-09-04-create-new-ivault.md`

## 变更清单

| # | 文件（相对 test-apps/display-test-app） | 类型 | 内容 |
|---|---|---|---|
| 1 | `src/common/DtaIpcInterface.ts` | 修改 | 新增 `CreateNewIVaultArgs`、`CreateNewIVaultResult` 接口和 `createNewIVault` IPC 方法 |
| 2 | `src/backend/CreateNewIVaultImpl.ts` | **新增** | 创建空白 standalone iVault，并初始化默认类别/模型/视图 |
| 3 | `src/backend/DtaElectronMain.ts` | 修改 | `DtaHandler` 增加 `createNewIVault` 委托方法 |
| 4 | `src/frontend/FileOpen.ts` | 修改 | 新增 `selectSaveFileName()` 保存对话框 |
| 5 | `src/frontend/Surface.ts` | 修改 | 工具栏按钮、`createNewIVault()` 方法、`NewIVaultTool` |
| 6 | `src/frontend/App.ts` | 修改 | 注册 `NewIVaultTool` |

---

## 1. src/common/DtaIpcInterface.ts（修改）

在 `CreateSectionDrawingViewResult` 接口之后新增两个接口：

```ts
/** Arguments for DtaIpcInterface.createNewIVault. */
export interface CreateNewIVaultArgs {
  /** The absolute path of the new .dtw file. A ".dtw" extension is appended if the path has no ".dtw"/".dtw" extension. */
  filePath: string;
  /** Name for the root Subject of the new iVault. Defaults to the file name (without extension). */
  name?: string;
}

/** Result of DtaIpcInterface.createNewIVault. */
export interface CreateNewIVaultResult {
  /** The absolute path of the created file. */
  filePath: string;
  /** The Id of the default PhysicalModel initialized in the new iVault. */
  defaultModelId: Id64String;
  /** The Id of the default SpatialCategory initialized in the new iVault. */
  defaultCategoryId: Id64String;
}
```

在 `DtaIpcInterface` 接口内、`sayHello` 之后新增方法：

```ts
  /** Creates a new empty standalone iVault (.dtw) file on disk, then closes it so the frontend can open it.
   * Returns the created file path along with the Ids of the default model and category initialized in the new file.
   */
  createNewIVault(args: CreateNewIVaultArgs): Promise<CreateNewIVaultResult>;
```

## 2. src/backend/CreateNewIVaultImpl.ts（新增文件，全文）

```ts
/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { CategorySelector, DisplayStyle3d, IVaultDb, ModelSelector, OrthographicViewDefinition, PhysicalModel, SpatialCategory, StandaloneDb, withEditTxn } from "@szewtwin/core-backend";
import { SubCategoryAppearance } from "@szewtwin/core-common";
import { Range3d, StandardViewIndex } from "@szewtwin/core-geometry";
import { CreateNewIVaultArgs, CreateNewIVaultResult } from "../common/DtaIpcInterface";

/** Appends a ".dtw" extension to `filePath` if it does not already end in ".dtw" or ".dtw". */
function normalizeFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ".dtw" === ext || ".dtw" === ext ? filePath : `${filePath}.dtw`;
}

/** Creates a new, empty, editable standalone iVault (.dtw) file on disk, initialized with a default
 * PhysicalModel, SpatialCategory, and spatial view so that editing tools work immediately after opening.
 */
export function createNewIVault(args: CreateNewIVaultArgs): CreateNewIVaultResult {
  const filePath = normalizeFilePath(args.filePath);
  if (fs.existsSync(filePath))
    throw new Error(`File already exists: ${filePath}`);

  const name = args.name ?? path.basename(filePath, path.extname(filePath));
  const db = StandaloneDb.createEmpty(filePath, {
    rootSubject: { name },
    enableTransactions: true,
  });

  const { defaultModelId, defaultCategoryId, defaultViewId } = withEditTxn(db, (txn) => {
    const defaultCategoryId = SpatialCategory.insert(txn, IVaultDb.dictionaryId, "Default", new SubCategoryAppearance());
    const defaultModelId = PhysicalModel.insert(txn, IVaultDb.rootSubjectId, "Default");

    // Create a default spatial view that displays the new model and category.
    const modelSelectorId = ModelSelector.insert(txn, IVaultDb.dictionaryId, "Default", [defaultModelId]);
    const categorySelectorId = CategorySelector.insert(txn, IVaultDb.dictionaryId, "Default", [defaultCategoryId]);
    const displayStyleId = DisplayStyle3d.insert(txn, IVaultDb.dictionaryId, "Default");
    const defaultViewId = OrthographicViewDefinition.insert(txn, IVaultDb.dictionaryId, "Default View", modelSelectorId, categorySelectorId, displayStyleId, new Range3d(-100, -100, -100, 100, 100, 100), StandardViewIndex.Iso);

    return { defaultModelId, defaultCategoryId, defaultViewId };
  });

  // setDefaultViewId writes via the implicit txn, so it must be called outside the EditTxn above.
  db.views.setDefaultViewId(defaultViewId);

  db.close(); // All changes are saved; close it so the frontend can open it.

  return { filePath, defaultModelId, defaultCategoryId };
}
```

## 3. src/backend/DtaElectronMain.ts（修改）

1. import 扩展（第 8 行）与新增 import（第 13 行附近）：

```ts
import { CreateNewIVaultArgs, CreateNewIVaultResult, CreateSectionDrawingViewArgs, CreateSectionDrawingViewResult, dtaChannel, DtaIpcInterface } from "../common/DtaIpcInterface";
// ...
import { createNewIVault } from "./CreateNewIVaultImpl";
```

2. `DtaHandler` 类内、`sayHello` 之后新增委托方法：

```ts
  public async createNewIVault(args: CreateNewIVaultArgs): Promise<CreateNewIVaultResult> {
    return createNewIVault(args);
  }
```

## 4. src/frontend/FileOpen.ts（修改）

1. 第 8 行：`import { OpenDialogOptions } from "electron";` → `import { OpenDialogOptions, SaveDialogOptions } from "electron";`

2. `selectFileName` 函数之后新增：

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

## 5. src/frontend/Surface.ts（修改）

1. import 变更：

```ts
import { OpenMode, ProcessDetector } from "@szewtwin/core-szewec";           // 新增
import { BlankConnection, BlankConnectionProps, BriefcaseConnection, IVaultApp, Tool } from "@szewtwin/core-frontend";  // 加入 BriefcaseConnection
import { DisplayTestApp, dtaIpc } from "./App";                              // 加入 dtaIpc
import { BrowserFileSelector, selectFileName, selectJsonConfigFilename, selectSaveFileName } from "./FileOpen";  // 加入 selectSaveFileName
```

2. `createToolBar()` 中、"Open iVault from disk" 按钮之后新增：

```ts
    tb.addItem(createToolButton({
      iconUnicode: "\ue942", // "file-empty"
      tooltip: "Create New iVault",
      click: async () => {
        await this.createNewIVault();
      },
    }));
```

3. `openFileIVault` 方法之后新增：

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
      const result = await dtaIpc.createNewIVault({ filePath });
      const iVault = await BriefcaseConnection.openStandalone(result.filePath, OpenMode.ReadWrite);
      iVault.editorToolSettings.model = result.defaultModelId;
      iVault.editorToolSettings.category = result.defaultCategoryId;
      setTitle(iVault);
      const viewer = await this.createViewer({ iVault, configuration: this.configuration });
      viewer.dock(Dock.Full);
    } catch (err: any) {
      alert(`Error creating iVault: ${err.toString()}`);
    }
  }
```

4. `OpenIVaultTool` 类之后、`CloseIVaultTool` 之前新增：

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

## 6. src/frontend/App.ts（修改）

1. `./Surface` 的 import 中 `MaximizeWindowTool` 与 `OpenIVaultTool` 之间加入 `NewIVaultTool`。
2. 工具注册数组（约第 395 行）中 `MoveElementTool,` 与 `OpenIVaultTool,` 之间加入 `NewIVaultTool,`。

---

## 附：验证记录

- 每个任务后 `rushx build` 均通过；5 次任务评审 + 1 次全量评审（opus）通过。
- 手动验收（用户）：新建 → `svt editing session` → `svt place line string` → 放置元素 → 保存 → 重开验证，全部通过。
- 完整过程记录（ledger/brief/report/评审包）：`szewtwinjs-core/.superpowers/sdd/2026-09-04-create-new-ivault/`。
