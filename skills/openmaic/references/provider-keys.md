# Provider Keys

## Critical Boundary

OpenMAIC generation does not automatically reuse the OpenClaw agent's current model or API key.

OpenMAIC server APIs resolve their own model and provider keys from OpenMAIC server-side config.

This skill does not rely on runtime overrides for model, provider, API key, base URL, or provider type.

If the user wants to change any of those, they must edit OpenMAIC server-side config files.

## Interaction Flow

1. Recommend one provider path first (see "Recommendation Paths" below). Do not start by asking for an API key.
2. Ask whether the user wants to configure it in `.env.local` (recommended for most users) or `server-providers.yml`.
3. Tell the user exactly which variables or YAML fields to edit — they edit the file themselves. Do not offer to write the key for them, do not ask for the literal key in chat, and do not suggest temporary request-time overrides.
4. Wait for the user to confirm they finished editing before continuing.
5. If generation later fails because of auth, provider, or model selection, direct the user back to the same server-side config files and wait for confirmation before retrying.

## Recommendation Paths

### 1. Lowest-Friction Setup

Recommended when the user wants the smallest amount of configuration.

Set:

```env
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=openai:qwen3.7-plus
```

Why:

- The `openai` slot is a generic OpenAI-compatible channel that ships the built-in
  domestic catalogue (Qwen, DeepSeek, GLM, Kimi), so one key covers the widest choice
  of models.
- OpenMAIC has **no hardcoded model fallback**. If `DEFAULT_MODEL` is unset (and no client model is sent), generation **fails with an error** rather than silently picking a default. So the user must always set `DEFAULT_MODEL` explicitly to match whichever provider key they configured.
- With only `OPENAI_API_KEY` set, the user must also set `DEFAULT_MODEL=openai:<model>` — otherwise generation cannot start.

### 2. Direct Vendor Endpoint

Recommended when the user prefers to call a vendor's own endpoint instead of the shared channel, or already has one of these keys.

Set:

```env
DEEPSEEK_API_KEY=...
DEFAULT_MODEL=deepseek:deepseek-v4-pro
```

```env
QWEN_API_KEY=...
DEFAULT_MODEL=qwen:qwen3.7-plus
```

Why:

- The vendor's own endpoint and quota, with the same model family
- The `deepseek:` / `qwen:` prefix is important. Without a provider prefix, model parsing defaults to OpenAI.
- Keys never leave the server: they live in `.env.local` or `server-providers.yml`, both read server-side only.

### 3. Existing Provider Reuse

Use when the user already has a provider key configured and wants to stick with it. The same `provider:model-id` form applies to every built-in slot — `glm:`, `kimi:`, `minimax:`, `grok:`, `doubao:`, `siliconflow:`, `openrouter:`, `tencent-hunyuan:`, `xiaomi:`, `ollama:`, `lemonade:`.

## Model String Rule

When recommending or showing `DEFAULT_MODEL`, always include the provider prefix:

- `openai:qwen3.7-plus`
- `deepseek:deepseek-v4-pro`
- `glm:glm-5.3`
- `kimi:kimi-k3`

Do not recommend bare model IDs such as `qwen3.7-plus` by themselves, because OpenMAIC will otherwise parse them as OpenAI models.

The exact model IDs above are examples. Model names change as providers release new versions — if a recommended ID is rejected, direct the user to check the provider's official docs for the current model name and keep the `provider:` prefix.

Do not work around a wrong `DEFAULT_MODEL` by changing request parameters. The user should fix the server-side config instead.

## Preferred Config Method

For first setup, prefer `.env.local`:

```bash
cp .env.example .env.local
```

Then fill the chosen keys.

Alternative: `server-providers.yml`

```yaml
providers:
  deepseek:
    apiKey: sk-...

  qwen:
    apiKey: sk-...

  openai:
    apiKey: sk-...
```

If using a non-default provider for classroom generation, also set the model selection explicitly:

```env
DEFAULT_MODEL=deepseek:deepseek-v4-pro
```

## Recommended Prompts To The User

Example phrasing the agent can adapt:

- "I recommend configuring OpenMAIC through `.env.local` first. Please edit that file locally and tell me when you're done."
- "For the simplest setup, I recommend the built-in `openai` channel plus a `DEFAULT_MODEL` like `openai:qwen3.7-plus` — that one key reaches the whole built-in domestic catalogue. If you'd rather call a vendor's own endpoint, `deepseek:` or `qwen:` works the same way. Which path do you want?"

The "do not ask for the key in chat / do not offer to write it" rules are covered in [Interaction Flow](#interaction-flow) above — do not open by requesting the key.

## Optional Features

These features require additional provider keys beyond the core LLM provider. Ask the user if they want to enable any of these after the core LLM key is configured.

| Feature | Env Variable(s) | Description |
|---------|-----------------|-------------|
| Web Search | `TAVILY_API_KEY`, `EXA_API_KEY` | Enriches outlines with real-time web research (either provider suffices) |
| Image Generation | `IMAGE_SEEDREAM_API_KEY`, `IMAGE_QWEN_IMAGE_API_KEY`, `IMAGE_NANO_BANANA_API_KEY` | Generates images for slides (any one suffices) |
| Video Generation | `VIDEO_SEEDANCE_API_KEY`, `VIDEO_KLING_API_KEY`, `VIDEO_VEO_API_KEY`, `VIDEO_SORA_API_KEY` | Generates short videos (any one suffices) |
| TTS | `TTS_OPENAI_API_KEY`, `TTS_AZURE_API_KEY`, `TTS_GLM_API_KEY`, `TTS_QWEN_API_KEY` | Text-to-speech narration (any one suffices) |

These are all optional. The classroom generation works without them — they only unlock richer content.

Alternatively, configure via `server-providers.yml`:

```yaml
web-search:
  tavily:
    apiKey: tvly-...
  # Or use Exa:
  # exa:
  #   apiKey: ...

image:
  seedream:
    apiKey: ...

video:
  seedance:
    apiKey: ...

tts:
  openai-tts:
    apiKey: sk-...
```
