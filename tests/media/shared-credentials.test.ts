import { describe, it, expect } from 'vitest';
import {
  resolveMediaCredentials,
  resolveMediaCredentialsFromSettings,
} from '@/lib/media/shared-credentials';

const llm = {
  apiKey: 'llm-key',
  baseUrl: 'https://aggregator.example/v1',
};

describe('resolveMediaCredentials', () => {
  it("prefers the media provider's own key", () => {
    expect(
      resolveMediaCredentials({ apiKey: 'own-key', baseUrl: 'https://vendor.example' }, llm),
    ).toEqual({
      apiKey: 'own-key',
      baseUrl: 'https://vendor.example',
      source: 'provider',
    });
  });

  it('keeps an own key with an empty baseUrl so the adapter default wins', () => {
    expect(resolveMediaCredentials({ apiKey: 'own-key' }, llm)).toEqual({
      apiKey: 'own-key',
      baseUrl: '',
      source: 'provider',
    });
  });

  it('borrows the language-model credential when the provider has no key', () => {
    expect(resolveMediaCredentials({ apiKey: '' }, llm)).toEqual({
      apiKey: 'llm-key',
      baseUrl: 'https://aggregator.example/v1',
      source: 'language-model',
    });
  });

  it('borrows for a missing provider config too', () => {
    expect(resolveMediaCredentials(undefined, llm).source).toBe('language-model');
  });

  it('falls back to the LLM defaultBaseUrl when no explicit baseUrl is set', () => {
    expect(
      resolveMediaCredentials(null, {
        apiKey: 'llm-key',
        defaultBaseUrl: 'https://default.example/v1',
      }),
    ).toEqual({
      apiKey: 'llm-key',
      baseUrl: 'https://default.example/v1',
      source: 'language-model',
    });
  });

  it('sends nothing for a server-managed media provider', () => {
    expect(resolveMediaCredentials({ isServerConfigured: true }, llm)).toEqual({
      apiKey: '',
      baseUrl: '',
      source: 'server',
    });
  });

  it('never borrows a key without its paired endpoint', () => {
    expect(resolveMediaCredentials(null, { apiKey: 'llm-key' })).toEqual({
      apiKey: '',
      baseUrl: '',
      source: 'none',
    });
  });

  it('cannot borrow from a server-configured LLM provider', () => {
    expect(
      resolveMediaCredentials(null, { isServerConfigured: true, baseUrl: 'https://x.example' })
        .source,
    ).toBe('none');
  });

  it('declines when neither side has a key', () => {
    expect(resolveMediaCredentials({ apiKey: '   ' }, { apiKey: '' })).toEqual({
      apiKey: '',
      baseUrl: '',
      source: 'none',
    });
  });
});

describe('resolveMediaCredentialsFromSettings', () => {
  const settings = {
    providerId: 'chat',
    providersConfig: { chat: llm },
    videoProviderId: 'video-a',
    videoProvidersConfig: { 'video-a': { apiKey: '' }, 'video-b': { apiKey: 'b-key' } },
    imageProviderId: 'image-a',
    imageProvidersConfig: { 'image-a': { apiKey: 'image-key' } },
  };

  it('borrows for the selected video provider', () => {
    expect(resolveMediaCredentialsFromSettings(settings, 'video')).toEqual({
      apiKey: 'llm-key',
      baseUrl: 'https://aggregator.example/v1',
      source: 'language-model',
    });
  });

  it('honours a pinned provider over the selection', () => {
    expect(resolveMediaCredentialsFromSettings(settings, 'video', 'video-b')).toEqual({
      apiKey: 'b-key',
      baseUrl: '',
      source: 'provider',
    });
  });

  it('reads the image capability independently', () => {
    expect(resolveMediaCredentialsFromSettings(settings, 'image').apiKey).toBe('image-key');
  });

  it('survives an empty settings object', () => {
    expect(resolveMediaCredentialsFromSettings({}, 'video').source).toBe('none');
  });
});
