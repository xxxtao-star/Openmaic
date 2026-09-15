'use client';

/**
 * Card for a standalone clip from the composer's video output mode.
 *
 * Shares the ClassroomCard footprint — same border, padding, title row and
 * footer metrics — so the two kinds sit in one grid without a seam. What differs
 * is what the tile does: a course card navigates to the classroom, and there is
 * nowhere for a bare clip to navigate to, so clicking plays it in place.
 *
 * The video blob is read from IndexedDB on first play, not on mount: a grid of
 * clips would otherwise pull every blob into memory to draw thumbnails. Until
 * then the tile shows the stored poster.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Download, Film, Pencil, Play, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GeneratedVideoListItem } from '@/lib/utils/generated-video-storage';
import { loadGeneratedVideoBlob } from '@/lib/utils/generated-video-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('GeneratedVideoCard');

function formatDuration(seconds?: number): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A filename the OS will accept, derived from the prompt. */
function downloadName(prompt: string, mimeType: string): string {
  const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
  const stem =
    prompt
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .slice(0, 60) || 'video';
  return `${stem}.${extension}`;
}

export function GeneratedVideoCard({
  video,
  formatDate,
  onRename,
  onDelete,
  confirmingDelete,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  video: GeneratedVideoListItem;
  formatDate: (ts: number) => string;
  onRename: (id: string, prompt: string) => void;
  onDelete: (id: string) => void;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [loadingBlob, setLoadingBlob] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  // Poster is already in hand from the list query — just needs a URL.
  useEffect(() => {
    if (!video.poster) return;
    const url = URL.createObjectURL(video.poster);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video.poster]);

  // Revoke the playback URL when the card goes away, so closing the library
  // does not leak a blob URL per clip.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const play = async () => {
    if (objectUrl) {
      void videoRef.current?.play();
      return;
    }
    if (loadingBlob) return;
    setLoadingBlob(true);
    try {
      const blob = await loadGeneratedVideoBlob(video.id);
      if (!blob) throw new Error('Stored video blob is missing');
      setObjectUrl(URL.createObjectURL(blob));
    } catch (err) {
      log.error('Failed to load stored video:', err);
    } finally {
      setLoadingBlob(false);
    }
  };

  const download = async () => {
    try {
      const blob = await loadGeneratedVideoBlob(video.id);
      if (!blob) throw new Error('Stored video blob is missing');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName(video.prompt, video.mimeType);
      anchor.click();
      // Revoke on the next tick: revoking synchronously can cancel the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      log.error('Failed to download stored video:', err);
    }
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(video.prompt);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== video.prompt) onRename(video.id, trimmed);
    setEditing(false);
  };

  const duration = formatDuration(video.durationSeconds);

  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-indigo-400/15 bg-white/70 backdrop-blur-xl',
        'p-3.5 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-indigo-400/35 hover:shadow-lg hover:shadow-indigo-500/10',
        'dark:border-indigo-400/15 dark:bg-slate-900/60 dark:hover:shadow-black/30',
      )}
    >
      {/* Preview tile — poster until first play, then the real element. */}
      <div
        className="relative w-full aspect-[16/9] overflow-hidden rounded-xl bg-black/90"
        onClick={objectUrl ? undefined : play}
        role={objectUrl ? undefined : 'button'}
        tabIndex={objectUrl ? undefined : 0}
        aria-label={objectUrl ? undefined : t('classroom.videoPlay')}
        onKeyDown={(e) => {
          if (objectUrl) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void play();
          }
        }}
      >
        {objectUrl ? (
          <video
            ref={videoRef}
            src={objectUrl}
            poster={posterUrl ?? undefined}
            controls
            autoPlay
            playsInline
            className="size-full object-contain"
          />
        ) : (
          <>
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-900/40 to-blue-900/40">
                <Film className="size-8 text-white/70" />
              </div>
            )}
            {/* Play affordance — the tile itself is the button. */}
            <div className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-white/85 text-violet-700 shadow-lg backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
                <Play className={cn('size-5 translate-x-px', loadingBlob && 'animate-pulse')} />
              </span>
            </div>
          </>
        )}

        {duration && (
          <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {duration}
          </span>
        )}
      </div>

      {/* Title row — matches the course card: disc, title, hover actions. */}
      <div className="mt-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-sm">
          <Film className="size-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={200}
              className="w-full border-b border-violet-400/60 bg-transparent text-[14px] font-semibold text-foreground/90 outline-none"
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className="truncate text-[14px] font-semibold text-foreground/90 cursor-text"
                  onDoubleClick={startRename}
                >
                  {video.prompt}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={4}
                className="!max-w-[min(90vw,32rem)] whitespace-normal break-words"
              >
                <span className="break-all">{video.prompt}</span>
              </TooltipContent>
            </Tooltip>
          )}

          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/60">
            {t('classroom.videoBadge')}
          </p>
        </div>

        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('toolbar.videoDownload')}
                className="size-6 text-muted-foreground/50 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  void download();
                }}
              >
                <Download className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('classroom.rename')}
                className="size-6 text-muted-foreground/50 hover:text-foreground"
                onClick={startRename}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('classroom.delete')}
                className="size-6 text-muted-foreground/50 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete();
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — mirrors the course card's pill + timestamp row. */}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/55">
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100/70 px-2 py-0.5 font-medium text-violet-600/90 dark:bg-violet-900/25 dark:text-violet-300/90">
          <Film className="size-3" />
          {t('toolbar.outputVideo')}
        </span>
        <div className="flex-1" />
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Clock className="size-3" />
          {formatDate(video.createdAt)}
        </span>
      </div>

      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/50 backdrop-blur-[6px]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[13px] font-medium text-white/90">
              {t('classroom.videoDeleteConfirmTitle')}?
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-white/15 px-3.5 py-1 text-[12px] font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/25"
                onClick={onCancelDelete}
              >
                {t('common.cancel')}
              </button>
              <button
                className="rounded-lg bg-red-500/90 px-3.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-red-500"
                onClick={() => {
                  onConfirmDelete();
                  onDelete(video.id);
                }}
              >
                {t('classroom.delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default GeneratedVideoCard;
