/**
 * Resolves the credentials a media capability (image/video) sends to its
 * generation route.
 *
 * Media providers used to be a closed world: each carried its own key, and a
 * user who had configured only the language-model channel could not generate
 * media at all. That stopped matching how the app is actually configured. The
 * shipped channel points at an aggregator endpoint whose single key covers
 * chat, image and video alike, and the settings dialog now exposes only that
 * one channel (see the header comment in `components/settings/index.tsx`), so
 * there is no UI left in which to type a separate media key.
 *
 * So the language-model credential is the fallback: when a media provider has
 * no key of its own, the request goes out with the selected LLM provider's.
 *
 * Two invariants keep that from becoming a credential leak:
 *
 * - Key and endpoint travel as a **pair**. A borrowed key is only ever paired
 *   with the baseUrl of the config it came from, so it cannot be pointed at a
 *   third-party endpoint configured elsewhere. If the LLM config has a key but
 *   no resolvable endpoint, the fallback declines rather than guessing.
 * - Server-managed providers borrow nothing. `isServerConfigured` means the
 *   route resolves the key from server config and ignores client headers, so
 *   sending one would be pointless as well as wrong.
 */

/** The media-provider config fields this resolver reads. */
export interface MediaCredentialConfigLike {
  apiKey?: string;
  baseUrl?: string;
  isServerConfigured?: boolean;
}

/** The language-model provider config fields this resolver reads. */
export interface LLMCredentialConfigLike {
  apiKey?: string;
  baseUrl?: string;
  defaultBaseUrl?: string;
  isServerConfigured?: boolean;
}

export interface ResolvedMediaCredentials {
  /** Empty when nothing is available to send, or when the server owns the key. */
  apiKey: string;
  /** Empty means "let the adapter's own default endpoint win". */
  baseUrl: string;
  /** Where the credential came from. Diagnostic only — never sent upstream. */
  source: 'provider' | 'language-model' | 'server' | 'none';
}

const NOTHING_TO_SEND = { apiKey: '', baseUrl: '' } as const;

/**
 * Picks the credential pair for one media request.
 *
 * @param providerConfig config of the media provider being called
 * @param llmConfig config of the currently selected language-model provider
 */
export function resolveMediaCredentials(
  providerConfig: MediaCredentialConfigLike | undefined | null,
  llmConfig: LLMCredentialConfigLike | undefined | null,
): ResolvedMediaCredentials {
  // The route resolves server-managed keys itself and ignores client headers.
  if (providerConfig?.isServerConfigured) {
    return { ...NOTHING_TO_SEND, source: 'server' };
  }

  const ownKey = providerConfig?.apiKey?.trim();
  if (ownKey) {
    // An empty baseUrl is meaningful: it defers to the adapter's default.
    return { apiKey: ownKey, baseUrl: providerConfig?.baseUrl?.trim() || '', source: 'provider' };
  }

  // Borrow from the language-model channel — key and endpoint together. A
  // server-configured LLM provider holds no client-side key, so there is
  // nothing here to borrow and this falls through to 'none'.
  const borrowedKey = llmConfig?.apiKey?.trim();
  const borrowedBaseUrl = llmConfig?.baseUrl?.trim() || llmConfig?.defaultBaseUrl?.trim() || '';
  if (borrowedKey && borrowedBaseUrl) {
    return { apiKey: borrowedKey, baseUrl: borrowedBaseUrl, source: 'language-model' };
  }

  return { ...NOTHING_TO_SEND, source: 'none' };
}

/** The settings slice {@link resolveMediaCredentialsFromSettings} reads. */
export interface MediaCredentialSettingsLike {
  providerId?: string;
  providersConfig?: Record<string, LLMCredentialConfigLike> | null;
  imageProviderId?: string;
  imageProvidersConfig?: Record<string, MediaCredentialConfigLike> | null;
  videoProviderId?: string;
  videoProvidersConfig?: Record<string, MediaCredentialConfigLike> | null;
}

/**
 * Store-shaped convenience wrapper over {@link resolveMediaCredentials}.
 *
 * @param providerId overrides the capability's selected provider — used by
 *   call sites that pin a provider instead of reading the user's selection.
 */
export function resolveMediaCredentialsFromSettings(
  settings: MediaCredentialSettingsLike,
  capability: 'image' | 'video',
  providerId?: string,
): ResolvedMediaCredentials {
  const configs =
    capability === 'image' ? settings.imageProvidersConfig : settings.videoProvidersConfig;
  const selectedId =
    providerId ?? (capability === 'image' ? settings.imageProviderId : settings.videoProviderId);

  const providerConfig = selectedId ? configs?.[selectedId] : undefined;
  const llmConfig = settings.providerId
    ? settings.providersConfig?.[settings.providerId]
    : undefined;

  return resolveMediaCredentials(providerConfig, llmConfig);
}
