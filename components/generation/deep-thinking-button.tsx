'use client';

/**
 * Deep-thinking pill.
 *
 * A compact, self-contained entry point to the current model's reasoning
 * setting — the same `ThinkingConfig` the model popover edits, just surfaced
 * next to the send button where it is seen before you hit generate rather
 * than after opening a popover.
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
import type { ThinkingConfig, ThinkingEffort, ThinkingLevel } from '@/lib/types/provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  // Level-based models (Gemini 3 style) pick from `levelValues`; effort-based
  // ones (OpenAI/OpenRouter style) from `effortValues`. Both collapse into the
  // same single dropdown.
  const levelOptions = (thinking?.levelValues ?? thinking?.effortValues ?? []) as string[];
  const levelValue =
    (effective?.level ?? effective?.effort ?? thinking?.defaultLevel ?? thinking?.defaultEffort) ??
    levelOptions[0];

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border border-border/50 pl-2 pr-0.5 text-xs font-medium transition-colors',
        mode === 'disabled'
          ? 'text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground'
          : 'border-violet-200/60 bg-violet-100 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-300',
        className,
      )}
    >
      <Brain className="size-3.5 shrink-0" />
      <span className="hidden whitespace-nowrap sm:inline">{t('toolbar.deepThinking')}</span>

      {levelOptions.length > 0 && mode !== 'disabled' ? (
        // Level-based models (e.g. low / medium / high) pick the level here;
        // the pill still reads as one control.
        <Select
          value={levelValue}
          onValueChange={(level) =>
            setThinkingConfig(
              providerId,
              modelId,
              normalizeThinkingConfig(thinking, {
                ...effective,
                mode: 'enabled',
                enabled: true,
                ...(thinking?.levelValues?.length
                  ? { level: level as ThinkingLevel }
                  : { effort: level as ThinkingEffort }),
              }),
            )
          }
        >
          <SelectTrigger
            size="sm"
            className="h-5 min-w-[52px] rounded-full border-0 bg-transparent px-1 !text-[10px] leading-none shadow-none focus-visible:ring-0 [&_svg]:size-3"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-[88px]">
            {levelOptions.map((level) => (
              <SelectItem key={level} value={level} className="py-1 text-xs">
                {level}
              </SelectItem>
            ))}
          </SelectContent>        </Select>
      ) : (
        <Select value={mode} onValueChange={(next) => apply(next as SimpleMode)}>
          <SelectTrigger
            size="sm"
            className="h-5 min-w-[44px] rounded-full border-0 bg-transparent px-1 !text-[10px] leading-none shadow-none focus-visible:ring-0 [&_svg]:size-3"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-[88px]">
            <SelectItem value="disabled" className="py-1 text-xs">
              {t('toolbar.off')}
            </SelectItem>
            <SelectItem value="enabled" className="py-1 text-xs">
              {t('toolbar.on')}
            </SelectItem>
            {thinking?.budgetRange?.allowDynamic && (
              <SelectItem value="auto" className="py-1 text-xs">
                {t('toolbar.auto')}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default DeepThinkingButton;
