/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Logging
 */

/**
 * Logger categories used by this package
 * @note All logger categories in this package start with the `presentation-backend` prefix.
 * @see [Logger]($szewec)
 * @public
 */
export enum PresentationBackendLoggerCategory {
  Package = "presentation-backend",

  /** The logger category used by the [[PresentationManager]] class and other related classes. */
  PresentationManager = "presentation-backend.PresentationManager",

  /** The logger category used by Presentation RPC implementation. */
  Rpc = "presentation-backend.Rpc",

  /** The logger category used by Presentation IPC implementation. */
  Ipc = "presentation-backend.Ipc",
}

/**
 * Logger categories used by this package
 * @note Logger categories used by the [[PresentationManager]] native addon.
 * @see [Logger]($szewec)
 * @public
 */
export enum PresentationBackendNativeLoggerCategory {
  DMObjects = "DMObjects",
  DMObjects_DMExpressions = "DMObjects.DMExpressions",
  DMObjects_DMExpressions_Parse = "DMObjects.DMExpressions.Parse",
  DMObjects_DMExpressions_Evaluate = "DMObjects.DMExpressions.Evaluate",

  DMPresentation = "DMPresentation",
  DMPresentation_Connections = "DMPresentation.Connections",
  DMPresentation_Tasks = "DMPresentation.Tasks",
  DMPresentation_Hierarchies = "DMPresentation.Navigation",
  DMPresentation_Hierarchies_Cache = "DMPresentation.Navigation.Cache",
  DMPresentation_Content = "DMPresentation.Content",
  DMPresentation_Update = "DMPresentation.Update",
  DMPresentation_Update_Hierarchies = "DMPresentation.Update.Hierarchies",
  DMPresentation_Update_Content = "DMPresentation.Update.Content",
  DMPresentation_Rules = "DMPresentation.Rules",
  DMPresentation_RulesetVariables = "DMPresentation.RulesetVariables",
  DMPresentation_DMExpressions = "DMPresentation.DMExpressions",
  DMPresentation_Serialization = "DMPresentation.Serialization",

  /* eslint-disable @typescript-eslint/no-duplicate-enum-values */
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. The logging namespace is not used anymore. */
  DMPresentation_Localization = "DMPresentation.Localization",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation]] */
  DMPresentation_RulesEngine = "DMPresentation.RulesEngine",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_Content]] */
  DMPresentation_RulesEngine_Content = "DMPresentation.Content",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. The logging namespace is not used anymore. */
  DMPresentation_RulesEngine_Localization = "DMPresentation.Localization",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_Hierarchies]] */
  DMPresentation_RulesEngine_Navigation = "DMPresentation.Navigation",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_Hierarchies_Cache]] */
  DMPresentation_RulesEngine_Navigation_Cache = "DMPresentation.Navigation.Cache",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_Tasks]] */
  DMPresentation_RulesEngine_Threads = "DMPresentation.Tasks",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_Update]] */
  DMPresentation_RulesEngine_Update = "DMPresentation.Update",
  /** @deprecated in 4.0 - will not be removed until after 2026-06-13. Use [[DMPresentation_RulesetVariables]] */
  DMPresentation_RulesEngine_RulesetVariables = "DMPresentation.RulesetVariables",
}
