/**
 * The pinned provider behind the composer's video output mode.
 *
 * That mode does not go through the model selector: it sends the prompt from the
 * textarea to one provider directly. The provider is fixed here rather than read
 * from settings, so neither the selected LLM nor the video provider the slide
 * pipeline's own media tools use can change what this mode produces.
 *
 * The catalog stays the source of truth for the model id and display name, so a
 * rename there does not have to be mirrored into the composer.
 */

import { VIDEO_PROVIDERS } from './video-providers';
import type { VideoProviderId } from './types';

export const PINNED_VIDEO_PROVIDER_ID: VideoProviderId = 'wan3-video';

const pinned = VIDEO_PROVIDERS[PINNED_VIDEO_PROVIDER_ID];

/** The provider publishes a single model; an empty id lets the server default win. */
export const PINNED_VIDEO_MODEL_ID = pinned.models[0]?.id ?? '';

export const PINNED_VIDEO_PROVIDER_NAME = pinned.name;
