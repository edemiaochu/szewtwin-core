# 设计：display-test-app 新建空白 BIM 文件功能

日期：2026-09-04
状态：已确认（等待用户审阅本 spec）

## 目标

在 display-test-app（Electron 桌面端）中提供"新建 BIM 文件"功能：用户在系统保存对话框中指定路径，应用在本地创建空白可编辑的 `.dtw` 文件，并自动以读写模式打开显示。新文件自带默认 PhysicalModel、SpatialCategory 和默认空间视图，打开后编辑工具立即可用。

> **修订（2026-09-04，Task 4 验收驱动）**：初版实现的新文件无法编辑（`svt place line string` 报 "Key-in failed to run"）。根因：空白文件无 model/category，且前端 `BriefcaseEditorToolSettings` 无默认值，`CreateElementTool.isCompatibleViewport` 因此拒绝工具启动。本修订增加默认内容初始化和前端 editorToolSettings 回填，详见下文。

## 范围

- **仅 Electron 平台**（IPC 通道 `display-test-app/dta`）。Web/移动端不在本次范围内。
- 文件类型：空白本地 standalone iVault（`StandaloneDb.createEmpty`），可编辑，不能 push/pull。
- 入口：工具栏按钮 + key-in 工具（`NewIVaultTool`）。
- 创建成功后自动打开并显示。

## 数据流（前后端关系）

```
用户点击工具栏按钮 / 输入 key-in "newivault"
  ↓ 前端 (renderer 进程)
selectSaveFileName() → ElectronApp.dialogIpc.showSaveDialog 选保存路径
  ↓ IPC (channel: "display-test-app/dta")
dtaIpc.createNewIVault({ filePath })
  ↓ 后端 (Electron main 进程)
CreateNewIVaultImpl → StandaloneDb.createEmpty() → withEditTxn 插入默认
  SpatialCategory/PhysicalModel/ModelSelector/CategorySelector/DisplayStyle3d/
  OrthographicViewDefinition → setDefaultViewId → close
  ↓ 返回 { filePath, defaultModelId, defaultCategoryId }
BriefcaseConnection.openStandalone(result.filePath, OpenMode.ReadWrite)
  ↓ IPC appFunctionIpc.openStandalone → 后端 StandaloneDb.openFile
iVault.editorToolSettings.model/category 回填默认 id
Surface.createViewer() 新建 Viewer 并 Dock.Full 显示
```

## 变更文件

| 文件 | 变更 |
|---|---|
| `src/common/DtaIpcInterface.ts` | 新增 `CreateNewIVaultArgs` 接口和 `createNewIVault` 方法 |
| `src/backend/CreateNewIVaultImpl.ts` | **新文件**：创建空白 standalone iVault 的实现 |
| `src/backend/DtaElectronMain.ts` | `DtaHandler` 增加 `createNewIVault` 委托方法 |
| `src/frontend/FileOpen.ts` | 新增 `selectSaveFileName()`（Electron 保存对话框） |
| `src/frontend/Surface.ts` | 工具栏按钮、`createNewIVault()` 方法、`NewIVaultTool` |
| `src/frontend/App.ts` | 工具注册列表加入 `NewIVaultTool` |

## 接口契约

`src/common/DtaIpcInterface.ts`（与现有 `createSectionDrawing` 模式一致）：

```ts
export interface CreateNewIVaultArgs {
  /** 新 .dtw 文件的绝对路径 */
  filePath: string;
  /** 根 Subject 名称；缺省时用文件名（不含扩展名） */
  name?: string;
}

export interface CreateNewIVaultResult {
  /** 实际创建的文件绝对路径 */
  filePath: string;
  /** 默认 PhysicalModel Id（前端填入 editorToolSettings） */
  defaultModelId: Id64String;
  /** 默认 SpatialCategory Id */
  defaultCategoryId: Id64String;
}

// DtaIpcInterface 中新增：
createNewIVault(args: CreateNewIVaultArgs): Promise<CreateNewIVaultResult>;
```

## 后端实现

**`src/backend/CreateNewIVaultImpl.ts`**（仿照 `SectionDrawingImpl.ts` 模式）：

1. 规范化扩展名：路径不以 `.dtw`/`.dtw` 结尾时补 `.dtw`。
2. `fs.existsSync(filePath)` 为真时抛友好错误（文件已存在，不覆盖）。
3. `StandaloneDb.createEmpty(filePath, { rootSubject: { name }, enableTransactions: true })`
   - `enableTransactions: true` 使文件可本地编辑（`CreateStandaloneIVaultProps.enableTransactions`）。
   - `rootSubject.name` 默认取文件名（不含扩展名）。
4. `withEditTxn(db, (txn) => ...)` 内插入默认内容（原子提交/回滚）：
   - `SpatialCategory.insert(txn, IVaultDb.dictionaryId, "Default", new SubCategoryAppearance())`
   - `PhysicalModel.insert(txn, IVaultDb.rootSubjectId, "Default")`（同时插入分区）
   - `ModelSelector.insert(txn, ..., [modelId])`、`CategorySelector.insert(txn, ..., [categoryId])`、`DisplayStyle3d.insert(txn, ...)`
   - `OrthographicViewDefinition.insert(txn, IVaultDb.dictionaryId, "Default View", ...)`，Range3d ±100m，StandardViewIndex.Iso
5. **在 EditTxn 结束后**调用 `db.views.setDefaultViewId(viewId)`（该方法走 implicit txn，不能与显式 EditTxn 并存）。
6. `db.close()`（全部改动已保存；关闭后前端才能打开该文件）。
7. 返回 `{ filePath, defaultModelId, defaultCategoryId }`。

**`src/backend/DtaElectronMain.ts`**：`DtaHandler` 增加：

```ts
public async createNewIVault(args: CreateNewIVaultArgs): Promise<string> {
  return createNewIVault(args);
}
```

## 前端实现

**`src/frontend/FileOpen.ts`**：新增 `selectSaveFileName()`：

- Electron：`ElectronApp.dialogIpc.showSaveDialog({ title: "Create New iVault", defaultPath: "NewIVault.dtw", filters: [{ name: "iVaults", extensions: ["bim", "ibim"] }] })`；取消返回 undefined。
- 非 Electron：返回 undefined（调用方给出提示）。

**`src/frontend/Surface.ts`**：

- `createToolBar()` 新增按钮（tooltip "Create New iVault"，放在 "Open iVault from disk" 旁）。
- 新增 `createNewIVault(fileName?: string)` 方法：
  1. 非 Electron 平台直接 alert 提示不支持并返回。
  2. `fileName` 未提供时调用 `selectSaveFileName()`；用户取消则静默返回。
  3. `const result = await dtaIpc.createNewIVault({ filePath })` 获取实际路径与默认 id。
  4. `await BriefcaseConnection.openStandalone(result.filePath, OpenMode.ReadWrite)`。
  5. `iVault.editorToolSettings.model = result.defaultModelId; iVault.editorToolSettings.category = result.defaultCategoryId;`（第二层修复：回填默认值，编辑工具才能启动）。
  6. `setTitle(iVault)` + `createViewer` + `viewer.dock(Dock.Full)`（复用 `openIVault()` 模式）。
  7. `try/catch + alert` 处理错误（沿用现有模式）。
- 新增 `NewIVaultTool`（放在 `OpenIVaultTool` 旁）：

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

**`src/frontend/App.ts`**：把 `NewIVaultTool` 加入工具注册列表（第 367 行数组，按字母序放在 `MoveElementTool` 与 `OpenIVaultTool` 之间），并在 `./Surface` 的 import 中补充 `NewIVaultTool`。

**关于 `dtaIpc`**：`App.ts:188` 已导出 `dtaIpc = IpcApp.makeIpcProxy<DtaIpcInterface>(dtaChannel)`。`Surface.ts` 已从 `./App` 导入 `DisplayTestApp`，沿用该导入语句补上 `dtaIpc` 即可（App ↔ Surface 的循环导入已存在且正常工作）。

## 错误处理

| 场景 | 行为 |
|---|---|
| 用户取消保存对话框 | 静默返回 |
| 文件已存在 | 后端抛错，前端 alert 显示 |
| 非 Electron 平台点击按钮 | alert 提示不支持 |
| 创建/打开失败 | try/catch + alert（沿用 `openIVault()` 模式） |

## 验证

- `cd test-apps/display-test-app && rushx build` 编译通过。
- `rushx start` 手动验证：
  1. 点击工具栏新按钮 → 弹出保存对话框 → 选择路径保存。
  2. 新文件自动以读写模式打开并显示默认视图。
  3. key-in `svt editing session` 进入编辑会话（本 app 的 key-in 命名空间是 `svt`，不是上游的 `dta`）。
  4. key-in `svt place line string` → 点击放置点 → Reset 完成，元素出现在视图中。
  5. 保存后关闭，用 "Open iVault from disk" 重新打开该文件，元素仍存在。
  6. key-in 输入 `newivault <路径>` 可直接按路径创建；`newivault` 弹对话框。
- 本 app 无测试框架（package.json `test` script 为空），不写自动化测试。

## 不在本次范围

- Web / 移动端创建（无本地文件对话框，需另行设计通道）。
- 云端 iVault 新建（需要 iVaultHub 集成）。
- 模板/种子文件创建（`createFrom`）。
- 默认内容初始化（默认视图、地理坐标等）。
