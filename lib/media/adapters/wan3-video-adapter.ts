/**
 * Wan 3.0 Video Generation Adapter
 *
 * Async task pattern: submit -> poll -> return video URL.
 *
 * REST endpoints:
 * - Submit: POST /videos
 * - Poll:   GET  /videos/{task_id}
 *
 * Supported models:
 * - wan3.0-video
 *
 * Authentication: Bearer token via Authorization header
 *
 * NOTE: the submit contract below is taken from a working operator script
 * (payload shape `{ model, prompt, input: { media }, parameters }`). The poll
 * endpoint and its terminal status vocabulary were NOT verifiable against
 * published docs, so the poll handler accepts the OpenAI `/v1/videos` status
 * vocabulary plus the common synonyms and searches the whole envelope for the
 * asset URL. Narrow this once the response shape is confirmed.
 *
 * A terminal status with no URL anywhere in the body is a normal outcome for
 * the OpenAI `/v1/videos` contract this gateway mirrors: there, completion
 * yields a bare status object and the bytes come from GET /videos/{id}/content.
 * That endpoint needs the API key, which the browser-side media proxy does not
 * attach, so those bytes are inlined as a data URL server-side rather than
 * handing the client a URL it cannot fetch.
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import { createLogger } from '@/lib/logger';
import { probeAuth } from '../probe-auth';
import { runPolledTask } from '../polled-task';
import { requireModel } from '../require-model';

const log = createLogger('Wan 3.0 Video');

const DEFAULT_MODEL = 'wan3.0-video';
const DEFAULT_BASE_URL = 'https://yibuapi.com/v1';
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max
const DEFAULT_DURATION_SECONDS = 5;
const CONTENT_FETCH_TIMEOUT_MS = 60_000;

/**
 * The submit payload carries a resolution tier rather than pixel dimensions, so
 * the reported frame size is derived from that tier at 16:9 — the only aspect
 * ratio this payload can express.
 */
function getDimensions(resolution?: string): { width: number; height: number } {
  return resolution === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}

/** The API spells resolution tiers in upper case ("720P"), unlike our option type. */
function toApiResolution(resolution?: string): string {
  return (resolution ?? '720p').toUpperCase();
}

function apiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

// ---------------------------------------------------------------------------
// REST types
// ---------------------------------------------------------------------------

interface Wan3SubmitResponse {
  id?: string;
  task_id?: string;
}

/**
 * Poll payload. Every field is optional because the response shape is not
 * pinned by docs — `readTerminalState` decides what a given body means.
 */
interface Wan3PollResponse {
  status?: string;
  progress?: number;
  error?: { code?: string; message?: string } | string | null;
  // Asset URL has been observed in several shapes across sibling gateways.
  url?: string;
  video?: { url?: string; duration?: number };
  output?: { url?: string; video_url?: string; duration?: number };
  data?: { url?: string; video_url?: string };
}

const SUCCESS_STATUSES = new Set(['completed', 'succeeded', 'success', 'done', 'finished']);
const FAILURE_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled', 'rejected']);

/** Field names that name the clip itself, so they outrank a bare `url`. */
const VIDEO_KEY_HINT = /video|mp4|movie|clip/i;
/** Companion assets and error payloads that must never be mistaken for the clip. */
const SKIP_KEY_HINT = /thumb|poster|cover|preview|image|snapshot|first_frame|error/i;
const VIDEO_EXTENSION = /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i;

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

/**
 * Collect every http(s) URL in the envelope, tagged with the field that held it.
 * Bounded in depth, visits and cycles: this walks a body whose shape was never
 * confirmed, so it must not be able to run away on a hostile or odd response.
 */
function collectUrls(
  node: unknown,
  key: string,
  depth: number,
  found: { key: string; url: string }[],
  seen: Set<object>,
): void {
  if (found.length >= 32 || depth > 6) return;
  if (isHttpUrl(node)) {
    found.push({ key, url: node });
    return;
  }
  if (typeof node !== 'object' || node === null || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    // Array entries inherit the field name, so `data: [{ url }]` still reads as `url`.
    for (const item of node) collectUrls(item, key, depth + 1, found, seen);
    return;
  }
  for (const [childKey, value] of Object.entries(node)) {
    if (SKIP_KEY_HINT.test(childKey)) continue;
    collectUrls(value, childKey, depth + 1, found, seen);
  }
}

/**
 * Pull the asset URL out of whichever envelope the gateway used.
 *
 * `requireHint` decides what happens when nothing in the body looks especially
 * like a clip. On a terminal success the only URL present is almost certainly
 * the asset, so a bare `url` is accepted. Before the task is terminal it is
 * not: a pending body may carry a callback or docs link, and treating that as
 * the result would hand the user a broken clip. So a non-terminal poll only
 * accepts a URL that names a video or ends in a video extension.
 */
function readVideoUrl(body: unknown, requireHint = false): string | undefined {
  const found: { key: string; url: string }[] = [];
  collectUrls(body, '', 0, found, new Set());
  const preferred = found.find(
    (entry) => VIDEO_KEY_HINT.test(entry.key) || VIDEO_EXTENSION.test(entry.url),
  );
  if (preferred) return preferred.url;
  return requireHint ? undefined : found[0]?.url;
}

function readDuration(body: Wan3PollResponse): number | undefined {
  return body.video?.duration ?? body.output?.duration;
}

/** Bounded rendering of a response body for logs and error messages. */
function describeBody(body: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(body) ?? String(body);
  } catch {
    return '<unserializable response body>';
  }
  return text.length > 600 ? `${text.slice(0, 600)}…(truncated)` : text;
}

function readErrorMessage(body: Wan3PollResponse): string {
  if (typeof body.error === 'string') return body.error;
  if (body.error?.message) return body.error.message;
  return describeBody(body);
}

// ---------------------------------------------------------------------------
// Connectivity test
// ---------------------------------------------------------------------------

/**
 * Lightweight connectivity test — validates the API key by making a minimal
 * request that triggers the auth check. 401/403 means the key is invalid.
 */
export async function testWan3VideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  return probeAuth({
    providerName: 'Wan 3.0 Video',
    request: () =>
      fetch(`${baseUrl}/videos`, {
        method: 'POST',
        redirect: 'manual',
        headers: apiHeaders(config.apiKey),
        body: JSON.stringify({
          model: config.model || DEFAULT_MODEL,
          prompt: '',
        }),
      }),
  });
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function submitVideoGeneration(
  baseUrl: string,
  apiKey: string,
  model: string,
  options: VideoGenerationOptions,
): Promise<string> {
  const body = {
    model,
    prompt: options.prompt,
    // Text-to-video only: the API accepts a `reference_image` entry here for
    // image-to-video, but VideoGenerationOptions carries no image input yet.
    input: { media: [] as unknown[] },
    parameters: {
      resolution: toApiResolution(options.resolution),
      duration: options.duration ?? DEFAULT_DURATION_SECONDS,
    },
  };

  const response = await fetch(`${baseUrl}/videos`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wan 3.0 video submit failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as Wan3SubmitResponse;
  const taskId = data.id || data.task_id;
  if (!taskId) {
    throw new Error('Wan 3.0 video returned empty task id');
  }

  return taskId;
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

async function pollVideoStatus(
  baseUrl: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<Wan3PollResponse> {
  const response = await fetch(`${baseUrl}/videos/${taskId}`, {
    method: 'GET',
    headers: apiHeaders(apiKey),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wan 3.0 video poll failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<Wan3PollResponse>;
}

/**
 * Cap on bytes inlined as a data URL, decoded. Base64 inflates by ~4/3 and the
 * result travels inside a JSON response, so this bounds a pathological clip
 * rather than sizing for a typical one (a few MB at 720p/5s).
 */
const MAX_INLINE_CONTENT_BYTES = 24 * 1024 * 1024;

/**
 * Retrieve the clip from the OpenAI-style `GET /videos/{id}/content` endpoint
 * and inline it as a data URL.
 *
 * On the OpenAI Videos API a `completed` task object carries no asset URL at
 * all — the bytes live behind a separate content route that requires the API
 * key. Handing the browser that bare URL cannot work: `saveGeneratedVideo`
 * downloads through the same-origin media proxy, which does not carry provider
 * credentials. So the bytes are fetched here, server-side, and returned inline;
 * `fetchMediaUrl` sends `data:` URLs straight to `fetch` without the proxy.
 * Same approach as the ComfyUI image adapter, which base64-encodes `/view`.
 */
async function fetchVideoContentAsDataUrl(
  baseUrl: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<string> {
  // Bound the download on its own, but keep honouring an upstream cancel: the
  // poll loop's signal has no deadline of its own for this leg.
  const timeout = AbortSignal.timeout(CONTENT_FETCH_TIMEOUT_MS);
  const response = await fetch(`${baseUrl}/videos/${taskId}/content`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Wan 3.0 video content fetch failed (${response.status})${text ? `: ${text}` : ''}`,
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('Wan 3.0 video content endpoint returned an empty body');
  }
  if (buffer.byteLength > MAX_INLINE_CONTENT_BYTES) {
    throw new Error(
      `Wan 3.0 video content is ${Math.round(buffer.byteLength / 1024 / 1024)}MB, ` +
        `over the ${MAX_INLINE_CONTENT_BYTES / 1024 / 1024}MB inline limit`,
    );
  }

  // A content-type header from the gateway is preferred, but it commonly comes
  // back as octet-stream; mp4 is the only format this submit payload requests.
  const headerType = response.headers.get('content-type')?.split(';')[0]?.trim();
  const mime = headerType && headerType.startsWith('video/') ? headerType : 'video/mp4';
  const base64 = Buffer.from(buffer).toString('base64');
  log.info(
    `Inlined clip from /content: ${Math.round(buffer.byteLength / 1024)}KB, mime=${mime}, task=${taskId}`,
  );
  return `data:${mime};base64,${base64}`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateWithWan3Video(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const model = requireModel(config.model, 'Wan 3.0 Video');
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  return runPolledTask<VideoGenerationResult>({
    submit: async () => ({
      status: 'submitted',
      taskId: await submitVideoGeneration(baseUrl, config.apiKey, model, options),
    }),
    poll: async (taskId) => {
      const body = await pollVideoStatus(baseUrl, config.apiKey, taskId, options.signal);
      const status = (body.status ?? '').toLowerCase();

      if (FAILURE_STATUSES.has(status)) {
        return {
          status: 'failed',
          message: `Wan 3.0 video generation failed: ${readErrorMessage(body)}`,
        };
      }

      // Before the task is terminal, only a clearly video-shaped URL counts;
      // afterwards any single URL in the envelope is taken as the asset.
      let url = readVideoUrl(body, !SUCCESS_STATUSES.has(status));

      if (SUCCESS_STATUSES.has(status)) {
        // A terminal success with no URL anywhere in the envelope is what the
        // OpenAI Videos API does by design: the task object describes the clip
        // and the bytes live at /videos/{id}/content. Try that before treating
        // the response as broken.
        if (!url) {
          log.info(
            `Terminal status "${status}" carried no asset URL; trying /content. Body: ${describeBody(body)}`,
          );
          try {
            url = await fetchVideoContentAsDataUrl(baseUrl, config.apiKey, taskId, options.signal);
          } catch (contentErr) {
            const detail = contentErr instanceof Error ? contentErr.message : String(contentErr);
            // Carry the body: without it there is no way to tell a changed
            // envelope from a gateway that simply has no content route.
            throw new Error(
              `Wan 3.0 video task completed but no video URL returned, and the ` +
                `/content fallback failed (${detail}). Poll response: ${describeBody(body)}`,
            );
          }
        }
      } else if (!url) {
        return {
          status: 'pending',
          detail: status || (body.progress !== undefined ? `${body.progress}%` : undefined),
        };
      }

      const { width, height } = getDimensions(options.resolution);
      return {
        status: 'done',
        result: {
          url: url as string,
          duration: readDuration(body) || options.duration || DEFAULT_DURATION_SECONDS,
          width,
          height,
        },
      };
    },
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    label: 'Wan 3.0 video generation',
    formatTimeout: ({ taskId, elapsedMs, lastPendingDetail }) =>
      `Wan 3.0 video generation timed out after ${elapsedMs / 1000}s (task: ${taskId}` +
      `${lastPendingDetail ? `, last status: ${lastPendingDetail}` : ''})`,
  });
}
