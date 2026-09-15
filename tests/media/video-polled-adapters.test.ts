import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateWithGrokVideo } from '@/lib/media/adapters/grok-video-adapter';
import { generateWithHappyHorse } from '@/lib/media/adapters/happyhorse-adapter';
import { generateWithKling } from '@/lib/media/adapters/kling-adapter';
import { generateWithMiniMaxVideo } from '@/lib/media/adapters/minimax-video-adapter';
import { generateWithSeedance } from '@/lib/media/adapters/seedance-adapter';
import { generateWithVeo } from '@/lib/media/adapters/veo-adapter';
import { generateWithWan3Video } from '@/lib/media/adapters/wan3-video-adapter';

const fetchMock = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function binaryResponse(bytes: Uint8Array, contentType = 'video/mp4', status = 200): Response {
  // BodyInit does not accept a Uint8Array under this lib target; its backing
  // buffer is an equivalent body.
  return new Response(bytes.buffer as ArrayBuffer, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

const WAN3_CONFIG = {
  providerId: 'wan3-video' as const,
  apiKey: 'wan3-key',
  baseUrl: 'https://wan3.example/v1',
  model: 'wan3.0-video',
};

describe('polled video adapter compatibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps Seedance task routing and success extraction unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'seed-task' })).mockResolvedValueOnce(
      jsonResponse({
        id: 'seed-task',
        model: 'doubao-seedance-2-0-260128',
        status: 'succeeded',
        content: { video_url: 'https://cdn.example.com/seed.mp4' },
        resolution: '720p',
        ratio: '16:9',
        duration: 5,
      }),
    );

    const promise = generateWithSeedance(
      { providerId: 'seedance', apiKey: 'seed-key', model: 'doubao-seedance-2-0-260128' },
      { prompt: 'a paper city', aspectRatio: '16:9', resolution: '720p', duration: 5 },
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({
      url: 'https://cdn.example.com/seed.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/seed-task',
    );
  });

  it('preserves the Seedance timeout message and exact poll count', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'seed-timeout' })).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          id: 'seed-timeout',
          model: 'doubao-seedance-2-0-260128',
          status: 'running',
        }),
      ),
    );
    const promise = generateWithSeedance(
      { providerId: 'seedance', apiKey: 'seed-key', model: 'doubao-seedance-2-0-260128' },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Seedance video generation timed out after 300s (task: seed-timeout)',
    );

    await vi.advanceTimersByTimeAsync(300_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(61);
  });

  it('keeps Kling task routing and success extraction unchanged', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: { task_id: 'kling-task', task_status: 'submitted' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            task_id: 'kling-task',
            task_status: 'succeed',
            task_result: {
              videos: [
                {
                  id: 'video-1',
                  url: 'https://cdn.example.com/kling.mp4',
                  duration: '5',
                },
              ],
            },
          },
        }),
      );

    const promise = generateWithKling(
      {
        providerId: 'kling',
        apiKey: 'access:secret',
        baseUrl: 'https://kling.example',
        model: 'kling-v2-6',
      },
      { prompt: 'a paper city', aspectRatio: '16:9', duration: 5 },
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({
      url: 'https://cdn.example.com/kling.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://kling.example/v1/videos/text2video/kling-task',
    );
  });

  it('preserves the Kling timeout message and exact poll count', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: { task_id: 'kling-timeout', task_status: 'submitted' },
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 0,
            message: 'success',
            data: { task_id: 'kling-timeout', task_status: 'processing' },
          }),
        ),
      );
    const promise = generateWithKling(
      {
        providerId: 'kling',
        apiKey: 'access:secret',
        baseUrl: 'https://kling.example',
        model: 'kling-v2-6',
      },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Kling video generation timed out after 600s (task: kling-timeout)',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(121);
  });

  it('preserves the Kling terminal failure message', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: { task_id: 'kling-failed', task_status: 'submitted' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            task_id: 'kling-failed',
            task_status: 'failed',
            task_status_msg: 'content rejected',
          },
        }),
      );
    const promise = generateWithKling(
      {
        providerId: 'kling',
        apiKey: 'access:secret',
        baseUrl: 'https://kling.example',
        model: 'kling-v2-6',
      },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Kling video generation failed: content rejected',
    );

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps Grok task routing and success extraction unchanged', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'grok-request' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'done',
          video: { url: 'https://cdn.example.com/grok.mp4', duration: 6 },
          model: 'grok-imagine-video',
        }),
      );

    const promise = generateWithGrokVideo(
      {
        providerId: 'grok-video',
        apiKey: 'grok-key',
        baseUrl: 'https://grok.example/v1',
        model: 'grok-imagine-video',
      },
      { prompt: 'a paper city', aspectRatio: '16:9', duration: 6 },
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({
      url: 'https://cdn.example.com/grok.mp4',
      duration: 6,
      width: 1280,
      height: 720,
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://grok.example/v1/videos/grok-request');
  });

  it('preserves the Grok timeout message and exact poll count', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'grok-timeout' }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ status: 'pending', progress: 50 })));
    const promise = generateWithGrokVideo(
      {
        providerId: 'grok-video',
        apiKey: 'grok-key',
        baseUrl: 'https://grok.example/v1',
        model: 'grok-imagine-video',
      },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Grok video generation timed out after 600s (request: grok-timeout)',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(61);
  });

  it('preserves the Grok terminal failure message', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'grok-failed' }))
      .mockResolvedValueOnce(
        jsonResponse({ status: 'failed', progress: 42, model: 'grok-imagine-video' }),
      );
    const promise = generateWithGrokVideo(
      {
        providerId: 'grok-video',
        apiKey: 'grok-key',
        baseUrl: 'https://grok.example/v1',
        model: 'grok-imagine-video',
      },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Grok video generation failed: {"status":"failed","progress":42,"model":"grok-imagine-video"}',
    );

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps HappyHorse task routing and success extraction unchanged', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          output: { task_id: 'horse-task', task_status: 'PENDING' },
          request_id: 'request-1',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_id: 'horse-task',
            task_status: 'SUCCEEDED',
            video_url: 'https://cdn.example.com/horse.mp4',
          },
          usage: { duration: 5, SR: 720, ratio: '16:9' },
        }),
      );

    const promise = generateWithHappyHorse(
      { providerId: 'happyhorse', apiKey: 'horse-key', model: 'happyhorse-1.0-t2v' },
      { prompt: 'a paper city', aspectRatio: '16:9', resolution: '720p', duration: 5 },
    );

    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({
      url: 'https://cdn.example.com/horse.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://dashscope.aliyuncs.com/api/v1/tasks/horse-task',
    );
  });

  it('preserves the HappyHorse timeout message and exact poll count', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ output: { task_id: 'horse-timeout', task_status: 'PENDING' } }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ output: { task_id: 'horse-timeout', task_status: 'RUNNING' } }),
        ),
      );
    const promise = generateWithHappyHorse(
      { providerId: 'happyhorse', apiKey: 'horse-key', model: 'happyhorse-1.0-t2v' },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'HappyHorse video generation timed out after 600s (task: horse-timeout)',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(41);
  });

  it('returns an immediately completed Veo operation without waiting or polling', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: 'operations/veo-immediate',
        done: true,
        response: {
          videos: [{ bytesBase64Encoded: 'dmlkZW8=', mimeType: 'video/mp4' }],
        },
      }),
    );

    const result = await generateWithVeo(
      {
        providerId: 'veo',
        apiKey: 'veo-key',
        baseUrl: 'https://veo.example',
        model: 'veo-3.0-generate-001',
      },
      { prompt: 'a paper city', aspectRatio: '16:9', duration: 8 },
    );

    expect(result).toEqual({
      url: 'data:video/mp4;base64,dmlkZW8=',
      duration: 8,
      width: 1280,
      height: 720,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an immediately failed Veo operation without waiting or polling', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: 'operations/veo-failed',
        done: true,
        error: { code: 13, message: 'render failed', status: 'INTERNAL' },
      }),
    );

    await expect(
      generateWithVeo(
        {
          providerId: 'veo',
          apiKey: 'veo-key',
          baseUrl: 'https://veo.example',
          model: 'veo-3.0-generate-001',
        },
        { prompt: 'a paper city' },
      ),
    ).rejects.toThrow('Veo generation failed: 13 - render failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps Veo operation routing and polled success extraction unchanged', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ name: 'operations/veo-task' }))
      .mockResolvedValueOnce(
        jsonResponse({
          name: 'operations/veo-task',
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: 'cG9sbGVk', mimeType: 'video/webm' }],
          },
        }),
      );

    const promise = generateWithVeo(
      {
        providerId: 'veo',
        apiKey: 'veo-key',
        baseUrl: 'https://veo.example',
        model: 'veo-3.0-generate-001',
      },
      { prompt: 'a paper city', aspectRatio: '9:16', duration: 8 },
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({
      url: 'data:video/webm;base64,cG9sbGVk',
      duration: 8,
      width: 720,
      height: 1280,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      operationName: 'operations/veo-task',
    });
  });

  it('preserves the Veo timeout message and exact poll count', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ name: 'operations/veo-timeout' }))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ name: 'operations/veo-timeout', done: false })),
      );
    const promise = generateWithVeo(
      {
        providerId: 'veo',
        apiKey: 'veo-key',
        baseUrl: 'https://veo.example',
        model: 'veo-3.0-generate-001',
      },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'Veo video generation timed out after 10 minutes',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(61);
  });

  it('preserves the MiniMax terminal failure message', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ task_id: 'minimax-failed', base_resp: { status_code: 0, status_msg: '' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          task_id: 'minimax-failed',
          status: 'Fail',
          base_resp: { status_code: 1008, status_msg: 'quota exceeded' },
        }),
      );
    const promise = generateWithMiniMaxVideo(
      { providerId: 'minimax-video', apiKey: 'minimax-key', model: 'MiniMax-Hailuo-2.3' },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'MiniMax Video generation failed: quota exceeded',
    );

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves the MiniMax timeout message with the last status and exact poll count', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ task_id: 'minimax-timeout', base_resp: { status_code: 0, status_msg: '' } }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            task_id: 'minimax-timeout',
            status: 'Processing',
            base_resp: { status_code: 0, status_msg: '' },
          }),
        ),
      );
    const promise = generateWithMiniMaxVideo(
      { providerId: 'minimax-video', apiKey: 'minimax-key', model: 'MiniMax-Hailuo-2.3' },
      { prompt: 'a paper city' },
    );
    const rejection = expect(promise).rejects.toThrow(
      'MiniMax Video: timeout after 120 polls, last status: Processing',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(121);
  });

  it('reads the Wan 3.0 asset URL out of a nested array envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'wan3-nested' })).mockResolvedValueOnce(
      jsonResponse({
        id: 'wan3-nested',
        status: 'completed',
        data: [{ video_url: 'https://cdn.example.com/wan3.mp4', duration: 7 }],
      }),
    );

    const promise = generateWithWan3Video(WAN3_CONFIG, {
      prompt: 'a paper city',
      resolution: '720p',
      duration: 5,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toEqual({
      url: 'https://cdn.example.com/wan3.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://wan3.example/v1/videos/wan3-nested');
  });

  it('prefers the clip over a companion thumbnail on the same Wan 3.0 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'wan3-thumb' })).mockResolvedValueOnce(
      jsonResponse({
        id: 'wan3-thumb',
        status: 'succeeded',
        thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        output: { video_url: 'https://cdn.example.com/clip.mp4' },
      }),
    );

    const promise = generateWithWan3Video(WAN3_CONFIG, { prompt: 'a paper city' });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toMatchObject({ url: 'https://cdn.example.com/clip.mp4' });
  });

  it('inlines Wan 3.0 bytes from /content when a completed task carries no URL', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'wan3-content' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'wan3-content', status: 'completed' }))
      .mockResolvedValueOnce(binaryResponse(bytes));

    const promise = generateWithWan3Video(WAN3_CONFIG, {
      prompt: 'a paper city',
      resolution: '1080p',
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toEqual({
      url: `data:video/mp4;base64,${Buffer.from(bytes).toString('base64')}`,
      duration: 5,
      width: 1920,
      height: 1080,
    });
    expect(fetchMock.mock.calls[2][0]).toBe('https://wan3.example/v1/videos/wan3-content/content');
  });

  it('carries the Wan 3.0 poll body when the /content fallback also fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'wan3-broken' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'wan3-broken', status: 'completed', progress: 100 }),
      )
      .mockResolvedValueOnce(new Response('no such route', { status: 404 }));

    const promise = generateWithWan3Video(WAN3_CONFIG, { prompt: 'a paper city' });
    const rejection = expect(promise).rejects.toThrow(
      /no video URL returned[\s\S]*\/content fallback failed \([\s\S]*404[\s\S]*\)[\s\S]*"status":"completed","progress":100/,
    );

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
  });

  it('does not mistake an unrelated URL on a pending Wan 3.0 body for the clip', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'wan3-pending' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'wan3-pending',
          status: 'processing',
          callback_url: 'https://hooks.example.com/notify',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'wan3-pending',
          status: 'completed',
          video: { url: 'https://cdn.example.com/late.mp4' },
        }),
      );

    const promise = generateWithWan3Video(WAN3_CONFIG, { prompt: 'a paper city' });

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toMatchObject({ url: 'https://cdn.example.com/late.mp4' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves the Wan 3.0 timeout message with the last status', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'wan3-timeout' }))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ id: 'wan3-timeout', status: 'processing' })),
      );

    const promise = generateWithWan3Video(WAN3_CONFIG, { prompt: 'a paper city' });
    const rejection = expect(promise).rejects.toThrow(
      'Wan 3.0 video generation timed out after 600s (task: wan3-timeout, last status: processing)',
    );

    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(61);
  });
});
