import type {
  ProviderConfig,
  ProviderId,
  ThinkingCapability,
  ThinkingEffort,
  ThinkingRequestAdapter,
} from '@/lib/types/provider';
import { getCanonicalModelId } from './model-aliases';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function effortCapability(
  requestAdapter: ThinkingRequestAdapter,
  effortValues: ThinkingEffort[],
  defaultEffort: ThinkingEffort,
): ThinkingCapability {
  return {
    control: 'effort',
    requestAdapter,
    effortValues,
    defaultEffort,
    defaultMode: effortValues.includes('none') ? 'disabled' : 'enabled',
    toggleable: effortValues.includes('none'),
    budgetAdjustable: true,
    defaultEnabled: !effortValues.includes('none'),
  };
}

function toggleCapability(
  requestAdapter: ThinkingRequestAdapter,
  defaultEnabled = true,
): ThinkingCapability {
  return {
    control: 'toggle',
    requestAdapter,
    defaultMode: defaultEnabled ? 'enabled' : 'disabled',
    toggleable: true,
    budgetAdjustable: false,
    defaultEnabled,
  };
}

function toggleBudgetCapability(
  requestAdapter: ThinkingRequestAdapter,
  range: { min: number; max: number; step?: number; allowDynamic?: boolean; disableValue?: number },
  defaultEnabled = false,
  defaultBudgetTokens?: number,
): ThinkingCapability {
  return {
    control: 'toggle-budget',
    requestAdapter,
    budgetRange: range,
    defaultBudgetTokens,
    defaultMode: defaultEnabled ? 'enabled' : 'disabled',
    toggleable: true,
    budgetAdjustable: true,
    defaultEnabled,
  };
}

function budgetOnlyCapability(
  requestAdapter: ThinkingRequestAdapter,
  range: { min: number; max: number; step?: number; allowDynamic?: boolean },
  defaultBudgetTokens?: number,
): ThinkingCapability {
  return {
    control: 'budget-only',
    requestAdapter,
    budgetRange: range,
    defaultBudgetTokens,
    defaultMode: 'enabled',
    toggleable: false,
    budgetAdjustable: true,
    defaultEnabled: true,
  };
}

const fixedThinkingCapability: ThinkingCapability = {
  control: 'none',
  requestAdapter: 'none',
  defaultMode: 'enabled',
  toggleable: false,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const kimiK3Effort = effortCapability('openai', ['low', 'high', 'max'], 'max');
const grok46Effort = effortCapability('openai', ['low', 'medium', 'high', 'xhigh'], 'high');
const grok45Effort = effortCapability('openai', ['low', 'medium', 'high'], 'high');
const grok43Effort = effortCapability('openai', ['none', 'low', 'medium', 'high'], 'none');

const deepseekEffort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'deepseek',
  effortValues: ['none', 'high', 'max'],
  defaultEffort: 'high',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const glm52Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'glm',
  effortValues: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'max',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

// GLM-5.3 / GLM-5.3-Flash always think; depth is controlled by effort only
// (the API rejects thinking.type "disabled": "该模型始终思考,不支持关闭思考").
const glm53Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'glm',
  effortValues: ['low', 'high', 'max'],
  defaultEffort: 'max',
  defaultMode: 'enabled',
  toggleable: false,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const hunyuanHy3Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'hunyuan',
  effortValues: ['none', 'low', 'high'],
  defaultEffort: 'none',
  defaultMode: 'disabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: false,
};

const lemonadeToggleBudget = toggleBudgetCapability(
  'lemonade',
  { min: 0, max: 81920, step: 1024, disableValue: 0 },
  false,
);

const qwenBudgetEnabled = toggleBudgetCapability(
  'qwen',
  { min: 0, max: 81920, step: 1024, disableValue: 0 },
  true,
);

const qwenBudgetDisabled = toggleBudgetCapability(
  'qwen',
  { min: 0, max: 81920, step: 1024, disableValue: 0 },
  false,
);

const siliconflowBudget = budgetOnlyCapability(
  'siliconflow',
  { min: 128, max: 32768, step: 1024 },
  4096,
);

const siliconflowToggleBudget = toggleBudgetCapability(
  'siliconflow',
  { min: 128, max: 32768, step: 1024, disableValue: 0 },
  true,
  4096,
);

const doubaoMode: ThinkingCapability = {
  control: 'mode',
  requestAdapter: 'doubao',
  defaultMode: 'auto',
  toggleable: true,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const doubaoSeed20Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'doubao',
  effortValues: ['minimal', 'low', 'medium', 'high'],
  defaultEffort: 'medium',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const minimaxM3Thinking = toggleCapability('anthropic', false);

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  // Domestic (国模) models served through the shared `openai` channel. The
  // transport is the vendor's own OpenAI-compatible protocol, so each one
  // reuses the capability of its native provider block below — without an
  // explicit entry here the shared slot would leave them with no thinking
  // control at all, since getCatalogThinkingCapability has no generic fallback.
  [getModelMetadataKey('openai', 'qwen3.7-plus')]: qwenBudgetEnabled,
  [getModelMetadataKey('openai', 'qwen3.7-max')]: qwenBudgetEnabled,
  [getModelMetadataKey('openai', 'qwen3.6-max-preview')]: qwenBudgetDisabled,
  [getModelMetadataKey('openai', 'qwen3.6-plus')]: qwenBudgetEnabled,
  [getModelMetadataKey('openai', 'qwen3.6-flash')]: qwenBudgetEnabled,
  [getModelMetadataKey('openai', 'qwen3-max')]: qwenBudgetDisabled,
  [getModelMetadataKey('openai', 'qwen3-vl-plus')]: qwenBudgetDisabled,

  [getModelMetadataKey('openai', 'deepseek-v4-pro')]: deepseekEffort,
  [getModelMetadataKey('openai', 'deepseek-v4-flash')]: deepseekEffort,
  [getModelMetadataKey('openai', 'deepseek-v4-flash-vision-exp')]: deepseekEffort,

  [getModelMetadataKey('openai', 'glm-5.3')]: glm53Effort,
  [getModelMetadataKey('openai', 'glm-5.3-flash')]: glm53Effort,
  [getModelMetadataKey('openai', 'glm-5.2')]: glm52Effort,
  [getModelMetadataKey('openai', 'glm-5.1')]: toggleCapability('glm'),
  [getModelMetadataKey('openai', 'glm-5v-turbo')]: toggleCapability('glm'),
  [getModelMetadataKey('openai', 'glm-5')]: toggleCapability('glm'),
  [getModelMetadataKey('openai', 'glm-4.7')]: toggleCapability('glm'),
  [getModelMetadataKey('openai', 'glm-4.6')]: toggleCapability('glm'),
  [getModelMetadataKey('openai', 'glm-4.6v')]: toggleCapability('glm'),

  [getModelMetadataKey('openai', 'kimi-k3')]: kimiK3Effort,
  [getModelMetadataKey('openai', 'kimi-k2.7-code')]: fixedThinkingCapability,
  [getModelMetadataKey('openai', 'kimi-k2.7-code-highspeed')]: fixedThinkingCapability,
  [getModelMetadataKey('openai', 'kimi-k2.6')]: toggleCapability('kimi'),
  [getModelMetadataKey('openai', 'kimi-k2.5')]: toggleCapability('kimi'),
  [getModelMetadataKey('openai', 'kimi-k2-thinking')]: toggleCapability('kimi'),

  [getModelMetadataKey('glm', 'glm-5.3')]: glm53Effort,
  [getModelMetadataKey('glm', 'glm-5.3-flash')]: glm53Effort,
  [getModelMetadataKey('glm', 'glm-5.2')]: glm52Effort,
  [getModelMetadataKey('glm', 'glm-5.1')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-5v-turbo')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-5')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.7')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.7-flashx')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.7-flash')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.6')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.6v')]: toggleCapability('glm'),
  [getModelMetadataKey('glm', 'glm-4.6v-flash')]: toggleCapability('glm'),

  [getModelMetadataKey('qwen', 'qwen3.7-plus')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.7-max')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.6-max-preview')]: qwenBudgetDisabled,
  [getModelMetadataKey('qwen', 'qwen3.6-plus')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.6-plus-2026-04-02')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.6-flash')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.6-flash-2026-04-16')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.6-35b-a3b')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.5-flash')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3.5-plus')]: qwenBudgetEnabled,
  [getModelMetadataKey('qwen', 'qwen3-max')]: qwenBudgetDisabled,
  [getModelMetadataKey('qwen', 'qwen3-vl-plus')]: qwenBudgetDisabled,

  [getModelMetadataKey('deepseek', 'deepseek-v4-pro')]: deepseekEffort,
  [getModelMetadataKey('deepseek', 'deepseek-v4-flash')]: deepseekEffort,
  [getModelMetadataKey('deepseek', 'deepseek-v4-flash-vision-exp')]: deepseekEffort,
  [getModelMetadataKey('atlascloud', 'deepseek-ai/deepseek-v4-pro')]: deepseekEffort,

  [getModelMetadataKey('kimi', 'kimi-k3')]: kimiK3Effort,
  [getModelMetadataKey('kimi', 'kimi-k2.7-code')]: fixedThinkingCapability,
  [getModelMetadataKey('kimi', 'kimi-k2.7-code-highspeed')]: fixedThinkingCapability,
  [getModelMetadataKey('kimi', 'kimi-k2.6')]: toggleCapability('kimi'),
  [getModelMetadataKey('kimi', 'kimi-k2.5')]: toggleCapability('kimi'),
  [getModelMetadataKey('kimi', 'kimi-k2-thinking')]: toggleCapability('kimi'),

  [getModelMetadataKey('siliconflow', 'deepseek-ai/DeepSeek-V3.2')]: siliconflowToggleBudget,
  [getModelMetadataKey('siliconflow', 'deepseek-ai/DeepSeek-R1')]: siliconflowBudget,
  [getModelMetadataKey('siliconflow', 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B')]:
    siliconflowBudget,
  [getModelMetadataKey('siliconflow', 'Qwen/Qwen3-VL-32B-Instruct')]: siliconflowToggleBudget,
  [getModelMetadataKey('siliconflow', 'THUDM/GLM-4.1V-9B-Thinking')]: siliconflowBudget,
  [getModelMetadataKey('siliconflow', 'THUDM/GLM-Z1-Rumination-32B-0414')]: siliconflowBudget,

  [getModelMetadataKey('doubao', 'doubao-seed-2-1-pro-260628')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2-1-turbo-260628')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-evolving')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-character-260628')]: toggleCapability('doubao'),
  [getModelMetadataKey('doubao', 'doubao-seed-2-0-pro-260215')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2-0-lite-260215')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2-0-mini-260215')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-1-8-251228')]: doubaoMode,
  // Volcengine Ark Agent Plan exposes the Seed 2.0 family under dotted aliases
  // (the token-plan preset seeds these). They're the same native Doubao models
  // as the catalog ids above, served from the plan's own endpoint, so they
  // carry the identical doubao thinking control. (Cross-vendor models the plan
  // also serves — deepseek/minimax/glm/kimi via ark's OpenAI-compatible path —
  // are intentionally NOT mapped here: their native thinking transport doesn't
  // apply through that gateway.)
  [getModelMetadataKey('doubao', 'doubao-seed-2.0-pro')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2.0-code')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2.0-lite')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'doubao-seed-2.0-mini')]: doubaoSeed20Effort,
  // Cross-vendor models the Ark Agent Plan also serves through its
  // OpenAI-compatible endpoint (all under the `doubao` provider id). Verified
  // against a live plan key: each accepts the gateway's unified `reasoning_effort`
  // field (low/medium/high) and actually reasons, so they share the doubao
  // effort adapter — which sends `minimal` (not `none`) to disable, matching
  // what the plan endpoint accepts. The token-plan preset seeds these aliases.
  [getModelMetadataKey('doubao', 'deepseek-v4-pro')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'deepseek-v4-flash')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'glm-5.2')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'kimi-k2.7-code')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'kimi-k2.6')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'minimax-m3')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'minimax-m2.7')]: doubaoSeed20Effort,
  [getModelMetadataKey('doubao', 'ark-code-latest')]: doubaoSeed20Effort,

  [getModelMetadataKey('openrouter', 'deepseek/deepseek-v4-pro')]: effortCapability(
    'openrouter',
    ['low', 'medium', 'high'],
    'medium',
  ),
  [getModelMetadataKey('openrouter', 'deepseek/deepseek-v4-flash')]: effortCapability(
    'openrouter',
    ['low', 'medium', 'high'],
    'medium',
  ),

  [getModelMetadataKey('grok', 'grok-4.6')]: grok46Effort,
  [getModelMetadataKey('grok', 'grok-4.5')]: grok45Effort,
  [getModelMetadataKey('grok', 'grok-4.3')]: grok43Effort,
  [getModelMetadataKey('grok', 'grok-build-0.1')]: fixedThinkingCapability,
  [getModelMetadataKey('grok', 'grok-4.20-reasoning')]: fixedThinkingCapability,
  [getModelMetadataKey('grok', 'grok-4.20-multi-agent')]: fixedThinkingCapability,
  [getModelMetadataKey('grok', 'grok-4-1-fast-reasoning')]: fixedThinkingCapability,

  [getModelMetadataKey('minimax', 'MiniMax-M3')]: minimaxM3Thinking,
  [getModelMetadataKey('minimax', 'MiniMax-M2.7')]: fixedThinkingCapability,

  [getModelMetadataKey('tencent-hunyuan', 'hy3-preview')]: hunyuanHy3Effort,

  [getModelMetadataKey('xiaomi', 'mimo-v2.5-pro')]: toggleCapability('xiaomi'),
  [getModelMetadataKey('xiaomi', 'mimo-v2-pro')]: toggleCapability('xiaomi'),
  [getModelMetadataKey('xiaomi', 'mimo-v2.5')]: toggleCapability('xiaomi'),
  [getModelMetadataKey('xiaomi', 'mimo-v2-omni')]: toggleCapability('xiaomi'),
  [getModelMetadataKey('xiaomi', 'mimo-v2-flash')]: toggleCapability('xiaomi'),

  [getModelMetadataKey('lemonade', 'Qwen3-4B-GGUF')]: lemonadeToggleBudget,
  [getModelMetadataKey('lemonade', 'Qwen3.5-4B-GGUF')]: lemonadeToggleBudget,
  [getModelMetadataKey('lemonade', 'Gemma-4-26B-A4B-it-GGUF')]: lemonadeToggleBudget,
  [getModelMetadataKey('lemonade', 'gpt-oss-20b')]: lemonadeToggleBudget,
  [getModelMetadataKey('lemonade', 'GPT-OSS-20B-GGUF')]: lemonadeToggleBudget,
};

export function getCatalogThinkingCapability(
  providerId: string,
  modelId: string,
): ThinkingCapability | undefined {
  const canonicalModelId = getCanonicalModelId(providerId, modelId);
  const exact = THINKING_CAPABILITIES[getModelMetadataKey(providerId, canonicalModelId)];
  if (exact) return exact;

  if (providerId === 'lemonade') {
    return lemonadeToggleBudget;
  }

  return undefined;
}

export function applyModelMetadata(providers: Record<ProviderId, ProviderConfig>): void {
  for (const provider of Object.values(providers)) {
    for (const model of provider.models) {
      const thinking = getCatalogThinkingCapability(provider.id, model.id);
      if (thinking) {
        model.capabilities = {
          ...model.capabilities,
          thinking,
        };
      }
    }
  }
}
