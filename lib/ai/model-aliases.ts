/**
 * Resolve the ID used for local catalog, settings, capability, and usage lookups.
 *
 * The catalogue used to carry per-provider renames (a shipped id that later
 * resolved to a different catalogue entry, e.g. the Sol alias for GPT-5.6).
 * Every entry was for a model the `openai` slot no longer serves, so the
 * mapping is gone and an ID is now its own canonical form. The seam stays: it
 * is the single place callers go through, so a future rename only has to be
 * taught here.
 */
export function getCanonicalModelId(_providerId: string, modelId: string): string {
  return modelId;
}

export function modelIdsMatch(providerId: string, left: string, right: string): boolean {
  return getCanonicalModelId(providerId, left) === getCanonicalModelId(providerId, right);
}

/** Find a model using canonical IDs without changing the model ID sent on the wire. */
export function findModelById<T extends { id: string }>(
  providerId: string,
  models: readonly T[] | undefined,
  modelId: string,
): T | undefined {
  const canonicalModelId = getCanonicalModelId(providerId, modelId);
  return (
    models?.find((model) => model.id === canonicalModelId) ??
    models?.find((model) => modelIdsMatch(providerId, model.id, modelId))
  );
}
