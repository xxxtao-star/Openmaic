'use client';

/**
 * Output-mode toggle.
 *
 * Picks what the composer's primary action produces: the slide course (the
 * existing pipeline, driven by whichever model the model selector names) or a
 * single video from the pinned video provider.
 *
 * The two branches share nothing downstream — one ingests materials, builds a
 * generation session and navigates, the other posts the prompt to the video API
 * and plays the result in place — so this reads as a choice of destination
 * rather than a modifier on one flow, and both options stay visible instead of
 * one label that cycles.
 */

import { Film, Presentation } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { PINNED_VIDEO_PROVIDER_NAME } from '@/lib/media/pinned-video';
import { labelPillCls } from '@/components/generation/control-styles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type OutputMode = 'slides' | 'video';

/** Inner segment: shorter than the wrapper pill so it nests inside its border. */
const segmentCls =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-all cursor-pointer select-none whitespace-nowrap';

const segmentActive = 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200';

const segmentIdle = 'text-muted-foreground/70 dark:text-muted-foreground hover:text-foreground';

export function OutputModeToggle({
  value,
  onChange,
  className,
}: {
  value: OutputMode;
  onChange: (next: OutputMode) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label={t('toolbar.outputMode')}
      // The wrapper owns the height and border of the neighbouring pills so the
      // two segments read as one control on that row.
      className={cn(labelPillCls, 'gap-1 border-border/50 px-1 dark:border-border', className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'slides'}
        onClick={() => onChange('slides')}
        className={cn(segmentCls, value === 'slides' ? segmentActive : segmentIdle)}
      >
        <Presentation className="size-4 shrink-0" />
        <span className="hidden whitespace-nowrap sm:inline">{t('toolbar.outputSlides')}</span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="radio"
            aria-checked={value === 'video'}
            onClick={() => onChange('video')}
            className={cn(segmentCls, value === 'video' ? segmentActive : segmentIdle)}
          >
            <Film className="size-4 shrink-0" />
            <span className="hidden whitespace-nowrap sm:inline">{t('toolbar.outputVideo')}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {PINNED_VIDEO_PROVIDER_NAME}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default OutputModeToggle;
