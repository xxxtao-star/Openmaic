import { describe, expect, it } from 'vitest';

import { getProvider } from '@/lib/ai/providers';
import {
  getThinkingConfigKey,
  getDefaultThinkingConfig,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';
import type { ProviderId } from '@/lib/types/provider';

function getThinking(providerId: ProviderId, modelId: string) {
  const model = getProvider(providerId)?.models.find((item) => item.id === modelId);
  return model?.capabilities?.thinking;
}

describe('thinking config metadata', () => {
  it('marks configurable models with adapter-backed thinking capabilities', () => {
    const thinking = getThinking('qwen', 'qwen3.6-plus');

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.control).toBe('toggle-budget');
    expect(thinking?.requestAdapter).toBe('qwen');
  });

  it('does not expose fixed thinking models as configurable', () => {
    const thinking = getThinking('grok', 'grok-4.20-reasoning');
    const minimaxM27Thinking = getThinking('minimax', 'MiniMax-M2.7');
    const kimiK27CodeThinking = getThinking('kimi', 'kimi-k2.7-code');
    const kimiK27CodeHighSpeedThinking = getThinking('kimi', 'kimi-k2.7-code-highspeed');

    expect(thinking?.control).toBe('none');
    expect(supportsConfigurableThinking(thinking)).toBe(false);
    expect(minimaxM27Thinking?.control).toBe('none');
    expect(supportsConfigurableThinking(minimaxM27Thinking)).toBe(false);
    expect(kimiK27CodeThinking?.control).toBe('none');
    expect(supportsConfigurableThinking(kimiK27CodeThinking)).toBe(false);
    expect(kimiK27CodeHighSpeedThinking?.control).toBe('none');
    expect(supportsConfigurableThinking(kimiK27CodeHighSpeedThinking)).toBe(false);
  });

  it('exposes MiniMax M3 thinking as a toggle through the Anthropic adapter', () => {
    const thinking = getThinking('minimax', 'MiniMax-M3');

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.control).toBe('toggle');
    expect(thinking?.requestAdapter).toBe('anthropic');
    expect(getDefaultThinkingConfig(thinking)).toEqual({ mode: 'disabled' });
  });

  it('removes deprecated and legacy models from the built-in catalog', () => {
    const openaiModels = getProvider('openai')?.models.map((item) => item.id);
    const glmModels = getProvider('glm')?.models.map((item) => item.id);
    const deepseekModels = getProvider('deepseek')?.models.map((item) => item.id);
    const hunyuanModels = getProvider('tencent-hunyuan')?.models.map((item) => item.id);
    const minimaxModels = getProvider('minimax')?.models.map((item) => item.id);
    const siliconflowModels = getProvider('siliconflow')?.models.map((item) => item.id);

    expect(openaiModels).not.toContain('o3-mini');
    expect(openaiModels).not.toContain('o3');
    expect(openaiModels).not.toContain('o4-mini');
    expect(openaiModels).not.toContain('gpt-5.2');
    expect(openaiModels).not.toContain('gpt-5.1');
    expect(openaiModels).not.toContain('gpt-5');
    expect(openaiModels).not.toContain('gpt-4o');
    expect(glmModels).not.toContain('glm-4.5-air');
    expect(glmModels).not.toContain('glm-4.5-airx');
    expect(glmModels).not.toContain('glm-4.5-flash');
    expect(deepseekModels).toEqual([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-flash-vision-exp',
    ]);
    // Pin the vision model's capabilities so a regression to vision: false
    // (silently dropping document images during generation) fails this test.
    const visionModel = getProvider('deepseek')?.models.find(
      (m) => m.id === 'deepseek-v4-flash-vision-exp',
    );
    expect(visionModel?.capabilities).toMatchObject({
      streaming: true,
      tools: true,
      vision: true,
    });
    expect(hunyuanModels).toEqual(['hy3-preview']);
    expect(minimaxModels).toEqual(['MiniMax-M3', 'MiniMax-M2.7']);
    expect(siliconflowModels).not.toContain('MiniMaxAI/MiniMax-M2');
  });
});

describe('thinking config normalization', () => {
  it('keys settings by provider and the exact model ID, with no alias collapsing', () => {
    expect(getThinkingConfigKey('openai', 'qwen3.7-plus')).toBe('openai:qwen3.7-plus');
    expect(getThinkingConfigKey('openai', 'qwen3.7-max')).toBe('openai:qwen3.7-max');
  });

  it('normalizes OpenAI-channel budget defaults and selected values', () => {
    const thinking = getThinking('openai', 'qwen3.7-plus');

    // The declared range bounds the control; the default stays unset until the
    // user picks a value, so thinking works with or without a budget.
    expect(thinking?.budgetRange).toEqual({ min: 0, max: 81920, step: 1024, disableValue: 0 });
    expect(getDefaultThinkingConfig(thinking)).toEqual({ mode: 'enabled' });
    expect(normalizeThinkingConfig(thinking, { budgetTokens: 8192 })).toEqual({
      mode: 'enabled',
      budgetTokens: 8192,
    });
  });

  it.each(['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'])(
    'normalizes %s with a high default and max effort',
    (modelId) => {
      const thinking = getThinking('openai', modelId);

      expect(getDefaultThinkingConfig(thinking)).toEqual({
        mode: 'enabled',
        effort: 'high',
      });
      expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
        mode: 'disabled',
        effort: 'none',
      });
      expect(normalizeThinkingConfig(thinking, { effort: 'max' })).toEqual({
        mode: 'enabled',
        effort: 'max',
      });
      expect(thinking?.effortValues).toEqual(['none', 'high', 'max']);
    },
  );

  it('normalizes GLM-5.3 as non-toggleable effort levels', () => {
    const thinking = getThinking('openai', 'glm-5.3');

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
      effort: 'max',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
      mode: 'enabled',
      effort: 'low',
    });
    expect(thinking?.effortValues).toEqual(['low', 'high', 'max']);
  });

  it('models the latest Kimi and Grok reasoning controls', () => {
    const kimiThinking = getThinking('kimi', 'kimi-k3');
    const grokThinking = getThinking('grok', 'grok-4.5');

    expect(getDefaultThinkingConfig(kimiThinking)).toEqual({
      mode: 'enabled',
      effort: 'max',
    });
    expect(normalizeThinkingConfig(kimiThinking, { mode: 'disabled' })).toEqual({
      mode: 'enabled',
      effort: 'low',
    });
    expect(getDefaultThinkingConfig(grokThinking)).toEqual({
      mode: 'enabled',
      effort: 'high',
    });
  });

  it('models Grok 4.6 thinking as non-toggleable effort including xhigh', () => {
    const thinking = getThinking('grok', 'grok-4.6');

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.control).toBe('effort');
    expect(thinking?.requestAdapter).toBe('openai');
    expect(thinking?.toggleable).toBe(false);
    expect(thinking?.effortValues).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
      effort: 'high',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
      mode: 'enabled',
      effort: 'low',
    });
    expect(normalizeThinkingConfig(thinking, { effort: 'xhigh' })).toEqual({
      mode: 'enabled',
      effort: 'xhigh',
    });
  });

  it('normalizes DeepSeek V4 thinking as high/max effort levels', () => {
    const thinking = getThinking('deepseek', 'deepseek-v4-pro');

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
      effort: 'high',
    });
    expect(normalizeThinkingConfig(thinking, { effort: 'max' })).toEqual({
      mode: 'enabled',
      effort: 'max',
    });
  });

  it('normalizes GLM-5.2 thinking as official reasoning effort levels', () => {
    const thinking = getThinking('glm', 'glm-5.2');

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.control).toBe('effort');
    expect(thinking?.requestAdapter).toBe('glm');
    expect(thinking?.effortValues).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
      effort: 'max',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
      mode: 'disabled',
      effort: 'none',
    });
    expect(normalizeThinkingConfig(thinking, { effort: 'minimal' })).toEqual({
      mode: 'enabled',
      effort: 'minimal',
    });
  });

  it('normalizes GLM-5.3 thinking as forced low/high/max effort levels', () => {
    for (const modelId of ['glm-5.3', 'glm-5.3-flash']) {
      const thinking = getThinking('glm', modelId);

      expect(supportsConfigurableThinking(thinking)).toBe(true);
      expect(thinking?.control).toBe('effort');
      expect(thinking?.requestAdapter).toBe('glm');
      expect(thinking?.toggleable).toBe(false);
      expect(thinking?.effortValues).toEqual(['low', 'high', 'max']);
      expect(getDefaultThinkingConfig(thinking)).toEqual({
        mode: 'enabled',
        effort: 'max',
      });
    }
  });

  it('normalizes Tencent HY3 thinking as no_think/low/high effort levels', () => {
    const thinking = getThinking('tencent-hunyuan', 'hy3-preview');

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'disabled',
      effort: 'none',
    });
    expect(normalizeThinkingConfig(thinking, { effort: 'high' })).toEqual({
      mode: 'enabled',
      effort: 'high',
    });
    expect(thinking?.effortValues).toEqual(['none', 'low', 'high']);
  });

  it('normalizes Lemonade reasoning models as disabled-by-default token budgets', () => {
    const thinking = getThinking('lemonade', 'Gemma-4-26B-A4B-it-GGUF');

    expect(supportsConfigurableThinking(thinking)).toBe(true);
    expect(thinking?.requestAdapter).toBe('lemonade');
    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'disabled',
      budgetTokens: undefined,
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'enabled', budgetTokens: 4096 })).toEqual({
      mode: 'enabled',
      budgetTokens: 4096,
    });
  });

  it('normalizes Doubao Seed 2.0 thinking as reasoning effort levels', () => {
    const thinking = getThinking('doubao', 'doubao-seed-2-0-pro-260215');
    const seed21Thinking = getThinking('doubao', 'doubao-seed-2-1-pro-260628');
    const seed21TurboThinking = getThinking('doubao', 'doubao-seed-2-1-turbo-260628');
    const evolvingThinking = getThinking('doubao', 'doubao-seed-evolving');

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
      effort: 'medium',
    });
    expect(normalizeThinkingConfig(thinking, { effort: 'high' })).toEqual({
      mode: 'enabled',
      effort: 'high',
    });
    expect(thinking?.effortValues).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(seed21Thinking?.effortValues).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(seed21TurboThinking?.effortValues).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(evolvingThinking?.effortValues).toEqual(['minimal', 'low', 'medium', 'high']);
  });

  it('normalizes Doubao Seed Character thinking as a mode toggle', () => {
    const thinking = getThinking('doubao', 'doubao-seed-character-260628');

    expect(getDefaultThinkingConfig(thinking)).toEqual({
      mode: 'enabled',
    });
    expect(normalizeThinkingConfig(thinking, { mode: 'disabled' })).toEqual({
      mode: 'disabled',
    });
    expect(thinking?.control).toBe('toggle');
  });
});
