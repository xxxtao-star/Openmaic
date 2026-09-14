import { describe, expect, it } from 'vitest';

import { findModelById, getCanonicalModelId, modelIdsMatch } from '@/lib/ai/model-aliases';

describe('model aliases', () => {
  // The catalogue no longer renames any ID, so canonicalization is the identity
  // for every provider and ID shape — including IDs the registry does not serve.
  it('leaves model IDs unchanged for every provider', () => {
    expect(getCanonicalModelId('openai', 'qwen3.7-plus')).toBe('qwen3.7-plus');
    expect(getCanonicalModelId('openai', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(getCanonicalModelId('openrouter', 'qwen3.7-plus')).toBe('qwen3.7-plus');
  });

  it('compares IDs by exact value', () => {
    expect(modelIdsMatch('openai', 'glm-5.3', 'glm-5.3')).toBe(true);
    expect(modelIdsMatch('openai', 'glm-5.3', 'glm-5.3-flash')).toBe(false);
  });

  it('finds a model by its exact ID and reports unknown IDs as missing', () => {
    const models = [
      { id: 'glm-5.3', vision: false },
      { id: 'glm-5.3-flash', vision: true },
    ];

    expect(findModelById('openai', models, 'glm-5.3-flash')).toBe(models[1]);
    expect(findModelById('openai', models, 'gpt-5.6-sol')).toBeUndefined();
    expect(findModelById('openai', undefined, 'glm-5.3')).toBeUndefined();
  });
});
