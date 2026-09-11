'use client';

/**
 * Deep-thinking pill.
 *
 * A compact on/off toggle over the current model's reasoning setting — the
 * same `ThinkingConfig` the model popover edits, just surfaced next to the send
 * button where it is seen before you hit generate rather than after opening a
 * popover. Level, budget and `auto` stay in the model popover so this reads as
 * one button rather than a button with a dropdown glued to it.
 *
 * Renders nothing when the current model exposes no configurable thinking,
 * so models without reasoning support don't grow a dead control.
 */

import { Brain } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { findModelById } from '@/lib/ai/model-aliases';
import {
  getDefaultThinkingConfig,
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';
import type { ThinkingConfig, ThinkingLevel } from '@/lib/types/provider';
import { labelPillActive, labelPillMuted } from '@/components/generation/control-styles';
import { cn } from '@/lib/utils';

/** Models may expose their reasoning knob as a plain toggle, a toggle plus a
 *  dynamic-budget option, a budget slider, a named level, or a mode enum.
 *  Every one of them reduces to a three-way "off / on / auto" here; the
 *  budget and level details stay in the model popover. */
type SimpleMode = 'disabled' | 'enabled' | 'auto';

export function DeepThinkingButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const providerId = useSettingsStore((s) => s.providerId);
  const modelId = useSettingsStore((s) => s.modelId);
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const thinkingConfigs = useSettingsStore((s) => s.thinkingConfigs);
  const setThinkingConfig = useSettingsStore((s) => s.setThinkingConfig);

  const providerConfig = providersConfig?.[providerId];
  const model =
    findModelById(providerId, providerConfig?.models, modelId) ??
    providerConfig?.models?.find((m) => m.id === modelId);

  const thinking = model?.capabilities?.thinking;
  if (!supportsConfigurableThinking(thinking)) return null;

  const config = thinkingConfigs[getThinkingConfigKey(providerId, modelId)];
  const effective = normalizeThinkingConfig(thinking, config) ?? getDefaultThinkingConfig(thinking);

  const mode: SimpleMode =
    effective?.mode === 'disabled'
      ? 'disabled'
      : effective?.mode === 'auto' || effective?.budgetTokens === -1
        ? 'auto'
        : 'enabled';

  const apply = (next: SimpleMode) => {
    if (next === 'auto') {
      setThinkingConfig(
        providerId,
        modelId,
        normalizeThinkingConfig(thinking, {
          ...effective,
          mode: 'auto',
          enabled: undefined,
          budgetTokens: -1,
        }),
      );
      return;
    }

    const enabledBudget =
      typeof thinking?.defaultBudgetTokens === 'number' && thinking.defaultBudgetTokens > 0
        ? thinking.defaultBudgetTokens
        : (thinking?.budgetRange?.min ?? undefined);

    setThinkingConfig(
      providerId,
      modelId,
      normalizeThinkingConfig(thinking, {
        ...effective,
        mode: next,
        enabled: next === 'enabled',
        // Coming back from `auto` leaves -1 behind, which the budget slider
        // reads as "dynamic" — restore a concrete default when re-enabling.
        budgetTokens: effective?.budgetTokens === -1 ? enabledBudget : effective?.budgetTokens,
      } as ThinkingConfig & { level?: ThinkingLevel }),
    );
  };

  const active = mode !== 'disabled';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => apply(active ? 'disabled' : 'enabled')}
      className={cn(active ? labelPillActive : labelPillMuted, className)}
    >
      <Brain className="size-4 shrink-0" />
      <span className="hidden whitespace-nowrap sm:inline">{t('toolbar.deepThinking')}</span>
    </button>
  );
}

export default DeepThinkingButton;
