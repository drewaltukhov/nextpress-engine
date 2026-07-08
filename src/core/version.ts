import pkg from "../../package.json" with { type: "json" };

/**
 * The current NextPress engine version. For downstream consumers that set
 * `engineVersion` in their package.json, that value is used so the UI
 * shows the pinned engine release rather than the product's own version
 * tag. Falls back to `version` for the engine itself.
 */
export const ENGINE_VERSION: string =
  (pkg as unknown as { engineVersion?: string }).engineVersion ?? pkg.version;
