/**
 * Generated Video Storage
 *
 * Persists the standalone clips produced by the composer's video output mode so
 * the library can list them next to courses. See {@link GeneratedVideoRecord}
 * for why these do not live in the stage tables.
 *
 * The provider hands back a URL on its own CDN, and those URLs expire. A card
 * that only remembered the URL would go dead within hours, so the bytes are
 * downloaded through the media proxy (the same route the slide pipeline uses for
 * generated media) and stored as a blob. Listing deliberately never loads those
 * blobs: `list` returns metadata plus a poster, and the blob is read only when a
 * clip is actually played.
 */

import { db, type GeneratedVideoRecord } from './database';
import { fetchMediaUrl } from '@/lib/media/fetch-media-url';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';

const log = createLogger('GeneratedVideoStorage');

/** Downloading a finished clip through the proxy; generous but bounded. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** Poster capture is a nicety — never let a slow decode hold up the save. */
const POSTER_TIMEOUT_MS = 8_000;

/**
 * List-view shape. Carries no video blob: a library with a dozen clips would
 * otherwise pull hundreds of megabytes into memory to draw a grid.
 */
export interface GeneratedVideoListItem {
  id: string;
  prompt: string;
  mimeType: string;
  size: number;
  poster?: Blob;
  durationSeconds?: number;
  width?: number;
  height?: number;
  providerId: string;
  modelId?: string;
  createdAt: number;
}

function toListItem(record: GeneratedVideoRecord): GeneratedVideoListItem {
  const { blob: _blob, ...rest } = record;
  return rest;
}

/**
 * Grab the first decodable frame as a poster.
 *
 * Seeking to 0 can resolve before any frame is painted in some browsers, so
 * this nudges to a fraction of a second in and waits for `seeked`. Resolves
 * `undefined` on any failure: a missing poster costs a placeholder tile, while
 * throwing here would lose an otherwise good clip.
 */
async function capturePoster(blob: Blob): Promise<Blob | undefined> {
  if (typeof document === 'undefined') return undefined;
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  try {
    return await new Promise<Blob | undefined>((resolve) => {
      const finish = (poster?: Blob) => {
        window.clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
        resolve(poster);
      };
      const timer = window.setTimeout(() => finish(undefined), POSTER_TIMEOUT_MS);

      video.muted = true;
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';

      video.onerror = () => finish(undefined);
      video.onloadeddata = () => {
        // A zero seek may land before the first frame is painted.
        video.currentTime = Math.min(0.1, (video.duration || 1) / 10);
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context || !canvas.width || !canvas.height) return finish(undefined);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((poster) => finish(poster ?? undefined), 'image/jpeg', 0.8);
      };

      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Read intrinsic dimensions and duration off the blob, best effort. */
async function readVideoMetadata(
  blob: Blob,
): Promise<{ width?: number; height?: number; durationSeconds?: number }> {
  if (typeof document === 'undefined') return {};
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  try {
    return await new Promise<{ width?: number; height?: number; durationSeconds?: number }>(
      (resolve) => {
        const finish = (value: { width?: number; height?: number; durationSeconds?: number }) => {
          window.clearTimeout(timer);
          video.removeAttribute('src');
          video.load();
          resolve(value);
        };
        const timer = window.setTimeout(() => finish({}), POSTER_TIMEOUT_MS);

        video.preload = 'metadata';
        video.onerror = () => finish({});
        video.onloadedmetadata = () =>
          finish({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
          });

        video.src = objectUrl;
      },
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Download a finished clip and store it.
 *
 * Throws when the download fails. The caller decides what that means — the
 * composer keeps the provider URL playable in place, so a failed save loses the
 * library card but not the clip the user is looking at.
 */
export async function saveGeneratedVideo(input: {
  prompt: string;
  url: string;
  providerId: string;
  modelId?: string;
  /** Duration reported by the provider; used when the blob has none. */
  durationSeconds?: number;
  width?: number;
  height?: number;
}): Promise<GeneratedVideoListItem> {
  const response = await fetchMediaUrl(input.url, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Failed to download generated video (${response.status})`);
  }
  const downloaded = await response.blob();
  if (downloaded.size === 0) {
    throw new Error('Generated video download returned an empty body');
  }

  const mimeType = downloaded.type || 'video/mp4';
  const blob = downloaded.type ? downloaded : new Blob([downloaded], { type: mimeType });

  const [poster, probed] = await Promise.all([capturePoster(blob), readVideoMetadata(blob)]);

  const record: GeneratedVideoRecord = {
    id: nanoid(),
    prompt: input.prompt.trim(),
    blob,
    mimeType,
    size: blob.size,
    poster,
    // Provider metadata wins where present; the probe fills the gaps.
    durationSeconds: input.durationSeconds ?? probed.durationSeconds,
    width: input.width ?? probed.width,
    height: input.height ?? probed.height,
    providerId: input.providerId,
    modelId: input.modelId,
    createdAt: Date.now(),
  };

  await db.generatedVideos.put(record);
  log.info(`Stored generated video ${record.id} (${record.size} bytes)`);
  return toListItem(record);
}

/** Newest first, without the video blobs. */
export async function listGeneratedVideos(): Promise<GeneratedVideoListItem[]> {
  const records = await db.generatedVideos.orderBy('createdAt').reverse().toArray();
  return records.map(toListItem);
}

/** The stored blob for playback and download. */
export async function loadGeneratedVideoBlob(id: string): Promise<Blob | undefined> {
  const record = await db.generatedVideos.get(id);
  return record?.blob;
}

export async function renameGeneratedVideo(id: string, prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error('Video title must not be empty');
  const record = await db.generatedVideos.get(id);
  if (!record) throw new Error(`Generated video not found: ${id}`);
  await db.generatedVideos.put({ ...record, prompt: trimmed });
}

export async function deleteGeneratedVideo(id: string): Promise<void> {
  await db.generatedVideos.delete(id);
  log.info(`Deleted generated video ${id}`);
}
