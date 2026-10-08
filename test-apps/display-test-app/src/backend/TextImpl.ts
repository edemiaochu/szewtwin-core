import { AnnotationTextStyle, BriefcaseDb, Drawing, IVaultDb, TextAnnotation2d, TextAnnotationUsesTextStyleByDefault, withEditTxn } from "@szewtwin/core-backend";
import { Id64, Id64String } from "@szewtwin/core-szewec";
import { Placement2d, Placement2dProps, TextAnnotation, TextAnnotationProps, TextStyleSettings, TextStyleSettingsProps } from "@szewtwin/core-common";

/**
 * Inserts a new text style into the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param name - Name of the text style.
 * @param settingProps - Properties for the text style.
 * @returns The Id of the inserted text style.
 * @throws If insertion fails, abandons changes and rethrows the error.
 */
export async function insertTextStyle(iVaultKey: string, name: string, settingProps: TextStyleSettingsProps): Promise<Id64String> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const annotationTextStyle = AnnotationTextStyle.create(
    iVault,
    {
      definitionModelId: IVaultDb.dictionaryId,
      name,
      settings: settingProps,
    }
  );

  await iVault.locks.acquireLocks({ shared: IVaultDb.dictionaryId });
  return withEditTxn(iVault, `Inserted text style '${name}'`, (txn) => annotationTextStyle.insert(txn));
}

/**
 * Updates an existing text style in the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param name - Name of the text style to update.
 * @param newSettingProps - New properties for the text style.
 * @throws If update fails, abandons changes and rethrows the error.
 */
export async function updateTextStyle(iVaultKey: string, name: string, newSettingProps: TextStyleSettingsProps): Promise<void> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const textStyle = iVault.elements.getElement<AnnotationTextStyle>(AnnotationTextStyle.createCode(iVault, IVaultDb.dictionaryId, name));
  const settings = TextStyleSettings.fromJSON(newSettingProps);
  textStyle.settings = settings;

  await iVault.locks.acquireLocks({ shared: IVaultDb.dictionaryId, exclusive: textStyle.id });
  withEditTxn(iVault, `Updated text style '${name}'`, (txn) => textStyle.update(txn));
}

/**
 * Deletes a text style from the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param name - Name of the text style to delete.
 * @throws If deletion fails, abandons changes and rethrows the error.
 */
export async function deleteTextStyle(iVaultKey: string, name: string): Promise<void> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const textStyle = iVault.elements.getElement<AnnotationTextStyle>(AnnotationTextStyle.createCode(iVault, IVaultDb.dictionaryId, name));

  await iVault.locks.acquireLocks({ shared: IVaultDb.dictionaryId, exclusive: textStyle.id });
  withEditTxn(iVault, `Deleted text style '${name}'`, (txn) => txn.deleteDefinitionElements([textStyle.id]));
}

/**
 * Inserts a new text annotation element into the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param categoryId - Category Id for the annotation.
 * @param modelId - Model Id for the annotation.
 * @param placement - Placement properties for the annotation.
 * @param textAnnotationData - Optional text annotation properties.
 * @returns The Id of the inserted annotation.
 * @throws If insertion fails, abandons changes and rethrows the error.
 */
export async function insertText(iVaultKey: string, categoryId: Id64String, modelId: Id64String, placement: Placement2dProps, defaultTextStyleId: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<Id64String> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const annotation2d = TextAnnotation2d.create(
    iVault,
    {
      category: categoryId,
      model: modelId,
      placement,
      defaultTextStyleId,
      textAnnotationProps
    }
  );

  await iVault.locks.acquireLocks({ shared: modelId });
  return withEditTxn(iVault, "Inserted annotation", (txn) => annotation2d.insert(txn));
}

/**
 * Updates an existing text annotation element in the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param elementId - Id of the annotation element to update.
 * @param categoryId - Optional new category Id.
 * @param placement - Optional new placement properties.
 * @param defaultTextStyleId - Optional new default text style Id.
 * @param textAnnotationProps - Optional new text annotation properties.
 * @throws If update fails, abandons changes and rethrows the error.
 */
export async function updateText(iVaultKey: string, elementId: Id64String, categoryId?: Id64String, placement?: Placement2dProps, defaultTextStyleId?: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<void> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const text = iVault.elements.getElement<TextAnnotation2d>(elementId);

  if (categoryId)
    text.category = categoryId;

  if (placement)
    text.placement = Placement2d.fromJSON(placement);

  if (textAnnotationProps)
    text.setAnnotation(TextAnnotation.fromJSON(textAnnotationProps));

  if (defaultTextStyleId && Id64.isValid(defaultTextStyleId)) {
    text.defaultTextStyle = new TextAnnotationUsesTextStyleByDefault(defaultTextStyleId);
  }

  await iVault.locks.acquireLocks({ shared: [text.model], exclusive: [elementId] });
  withEditTxn(iVault, "Updated annotation", (txn) => text.update(txn));
}

/**
 * Deletes a text annotation element from the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param elementId - Id of the annotation element to delete.
 * @throws If deletion fails, abandons changes and rethrows the error.
 */
export async function deleteText(iVaultKey: string, elementId: Id64String): Promise<void> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const text = iVault.elements.getElement<TextAnnotation2d>(elementId);

  await iVault.locks.acquireLocks({ shared: [text.model], exclusive: [elementId] });
  withEditTxn(iVault, "Deleted text annotation", (txn) => text.delete(txn));
}

/**
 * Sets the scale factor for a drawing element in the iVault.
 * @param iVaultKey - Key to identify the iVault.
 * @param modelId - Id of the drawing model.
 * @param scaleFactor - New scale factor to set.
 * @throws If update fails, abandons changes and rethrows the error.
 */
export async function setScaleFactor(iVaultKey: string, modelId: Id64String, scaleFactor: number): Promise<void> {
  const iVault = BriefcaseDb.findByKey(iVaultKey);

  const element = iVault.elements.getElement(modelId);
  if (element instanceof Drawing) {
    element.scaleFactor = scaleFactor;
    await iVault.locks.acquireLocks({ shared: [modelId], exclusive: [element.id] });
    withEditTxn(iVault, `Updated scale factor for drawing ${element.id}`, (txn) => element.update(txn));
  }
}