/**
 * Shared class strings for the composer's inline controls.
 *
 * The composer toolbar mixes controls that live in different files
 * (generation-toolbar, media-popover, agent-bar) but has to read as one row of
 * uniform buttons. Keeping the class strings here stops the copies from
 * drifting apart. These strings fix size and shape only — colors stay on the
 * existing tokens each control already used.
 *
 * One exception: the alpha modifiers below carry `dark:` variants that drop back
 * to full opacity. Over the dark `--background` (near-black) a 70% foreground
 * tops out around 5:1 no matter how bright the token gets, so on that side the
 * alpha has to go rather than be tuned.
 */

/** Icon-only control: a fixed 36px box so every glyph lines up on one row. */
export const iconControlCls =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-[13px] transition-all cursor-pointer select-none';

export const iconControlMuted = `${iconControlCls} border-border/50 dark:border-border text-muted-foreground/70 dark:text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted`;

export const iconControlActive = `${iconControlCls} border-violet-200/60 bg-violet-100 text-violet-700 dark:border-violet-500/45 dark:bg-violet-500/15 dark:text-violet-200`;

/** Label-bearing pill (智能体 / 深度思考): same 36px height, auto width. */
export const labelPillCls =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-all cursor-pointer select-none whitespace-nowrap';

export const labelPillMuted = `${labelPillCls} border-border/50 dark:border-border text-muted-foreground/70 dark:text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted`;

export const labelPillActive = `${labelPillCls} border-violet-200/60 bg-violet-100 text-violet-700 dark:border-violet-500/45 dark:bg-violet-500/15 dark:text-violet-200`;
