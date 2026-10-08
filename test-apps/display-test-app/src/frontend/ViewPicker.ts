/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BeEvent, compareBooleans, compareStrings, Id64, Id64String, SortedArray } from "@szewtwin/core-szewec";
import { ColorDef, QueryBinder, RenderMode } from "@szewtwin/core-common";
import { IVaultConnection, SpatialViewState, ViewState } from "@szewtwin/core-frontend";

interface ViewSpec extends IVaultConnection.ViewSpec {
  isPrivate: boolean;
}

export class ViewList extends SortedArray<ViewSpec> {
  private _defaultViewId = Id64.invalid;
  private readonly _views = new Map<Id64String, ViewState>();

  private constructor() {
    super((lhs, rhs) => {
      // Every entry has a unique Id, but we want to sort in the UI based on other criteria first.
      let cmp = compareBooleans(lhs.isPrivate, rhs.isPrivate);
      if (0 === cmp) {
        cmp = compareStrings(lhs.name, rhs.name);
        if (0 === cmp)
          cmp = compareStrings(lhs.id, rhs.id);
      }

      return cmp;
    });
  }

  public get defaultViewId(): Id64String { return this._defaultViewId; }

  public async getView(id: Id64String, iVault: IVaultConnection): Promise<ViewState> {
    let view = this._views.get(id);
    if (undefined === view) {
      try {
        view = await iVault.views.load(id);
      } catch {
        // The view probably refers to a nonexistent display style or model/category selector. Replace with a default spatial view.
        // Or, we've opened a blank connection and `id` is intentionally invalid.
        // The viewport's title bar will display "UNNAMED" instead of the bad view's name.
        view = this.manufactureSpatialView(iVault);
      }

      this._views.set(id, view);
    }

    // NB: We clone so that if user switches back to this view, it is shown in its initial (persistent) state.
    return view.clone();
  }

  public async getDefaultView(iVault: IVaultConnection): Promise<ViewState> {
    return this.getView(this.defaultViewId, iVault);
  }

  public static async create(iVault: IVaultConnection, viewName?: string): Promise<ViewList> {
    const viewList = new ViewList();
    await viewList.populate(iVault, viewName);
    return viewList;
  }

  public override clear(): void {
    super.clear();
    this._defaultViewId = Id64.invalid;
    this._views.clear();
  }

  public async populate(iVault: IVaultConnection, viewName?: string): Promise<void> {
    this.clear();

    // Query all non-private views. They sort first in list.
    let specs = await iVault.views.getViewList({ wantPrivate: false });
    for (const spec of specs)
      this.insert({ ...spec, isPrivate: false });

    // Query private views. They sort to end of list.
    const nSpecs = specs.length;
    specs = await iVault.views.getViewList({ wantPrivate: true });
    if (specs.length > nSpecs) {
      for (const spec of specs) {
        const entry = { ...spec, isPrivate: false };
        if (!this.findEqual(entry)) {
          entry.isPrivate = true;
          this.insert(entry);
        }
      }
    }

    if (undefined !== viewName) {
      for (const spec of this) {
        if (spec.name === viewName) {
          this._defaultViewId = spec.id;
          break;
        }
      }
    }

    // This is not efficiently done, but should be fine.
    const unnamedViews = this._array.filter((spec) => spec.name === "");
    if (unnamedViews.length > 0) {
      // If it's a 2d view and unnamed, it maps the baseModel name to the view's.
      // Otherwise, it uses the element id as the name.
      const unnamedViewsIds = unnamedViews.map((e) => e.id);
      const query = `
          SELECT
            v.DMInstanceId AS ViewId,
            d.DMInstanceId AS DocumentId,
            COALESCE(v.CodeValue, v.UserLabel,  CONCAT('2dView: ', COALESCE(d.CodeValue, d.UserLabel, v.DMInstanceId))) AS ViewName
          FROM bis.ViewDefinition2d v
          JOIN bis.Document d ON v.baseModel.Id = d.DMInstanceId
          WHERE InVirtualSet(:[unnamedViewsIds], v.DMInstanceId)
      `;
      const reader = iVault.createQueryReader(query, QueryBinder.from({ unnamedViewsIds }));
      for await (const row of reader) {
        const unnamedView = this._array.find((entry) => entry.id === row[0]);
        if (unnamedView) {
          // Remove the entry from unnamedViews
          unnamedViews.splice(unnamedViews.indexOf(unnamedView), 1);
          unnamedView.name = row[2];
        }
      }
      // for any remaining, use the id
      unnamedViews.forEach((entry) => entry.name = entry.id);
    }

    if (Id64.isInvalid(this._defaultViewId) && 0 < this._array.length) {
      this._defaultViewId = this._array[0].id;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const defaultViewId = await iVault.views.queryDefaultViewId();
      for (const spec of this) {
        if (spec.id === defaultViewId) {
          this._defaultViewId = defaultViewId;
          break;
        }
      }
    }

    if (Id64.isInvalid(this._defaultViewId))
      this.insert({ id: Id64.invalid, name: "Spatial View", class: SpatialViewState.classFullName, isPrivate: false });

    // Ensure default view is selected and loaded.
    await this.getView(this._defaultViewId, iVault);
  }

  // create a new spatial view initialized to show the project extents from top view. Model and
  // category selectors are empty, so this is really only useful for testing backgroundMaps and
  // reality models.
  private manufactureSpatialView(iVault: IVaultConnection): SpatialViewState {
    const ext = iVault.projectExtents;

    // start with a new "blank" spatial view to show the extents of the project, from top view
    const blankView = SpatialViewState.createBlank(iVault, ext.low, ext.high.minus(ext.low), undefined);

    // turn on the background map
    const style = blankView.displayStyle;
    style.viewFlags = style.viewFlags.copy({
      backgroundMap: true,
      lighting: true,
      renderMode: RenderMode.SmoothShade,
    });

    style.backgroundColor = ColorDef.white;

    // turn on the skybox in the environment
    style.environment = style.environment.withDisplay({ sky: true });

    return blankView;
  }
}

export class ViewPicker {
  private readonly _select: HTMLSelectElement;
  public readonly onSelectedViewChanged = new BeEvent<(viewId: Id64String) => void>();

  public get element(): HTMLElement { return this._select; }

  public constructor(parent: HTMLElement, views: ViewList) {
    this._select = document.createElement("select");
    this._select.className = "viewList";
    this._select.onchange = () => this.onSelectedViewChanged.raiseEvent(this._select.value);

    parent.appendChild(this._select);

    this.populate(views);
  }

  public populate(views: ViewList): void {
    while (this._select.hasChildNodes())
      this._select.removeChild(this._select.firstChild!);

    let index = 0;
    for (const spec of views) {
      const option = document.createElement("option");
      option.innerText = spec.name;
      option.value = spec.id;
      this._select.appendChild(option);
      if (spec.id === views.defaultViewId)
        this._select.selectedIndex = index;
      index++;
    }
  }
}
