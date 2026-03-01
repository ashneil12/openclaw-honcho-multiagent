# openclaw-honcho-multiagent

Forked from `@honcho-ai/openclaw-honcho@1.1.0` with patches for MoltBot's multi-agent setup.

## Patches over upstream

### `helpers.js`
- **Session key hardening**: fallback chain for `messageProvider` (`messageProvider → messageChannel → channel → channelId → "unknown"`), fallback session key construction from `conversationId`, truncation to 100 chars
- **`unwrapMessage()`**: handles OpenClaw's `{ message: { role, content } }` wrapper format
- **Richer content parsing**: supports `text`, `input_text`, `output_text`, `content`, `value` block types

### `hooks/capture.js`
- **`message_received` hook**: captures user inbound messages at receive-time with canonical session key reconstruction (converts `channelId`/`conversationId` to match `agent_end`'s session key format)
- **`findCurrentTurnStart()`**: walks backward through `assistant`/`toolResult` messages to find the user message, fixing first-capture index that was skipping user messages
- **Rate-limit resilient**: `addPeers` errors caught as non-fatal

### `tools/session.js`
- **Default session key**: uses `buildSessionKey(toolCtx)` instead of hardcoded `"default"`

## Install

```bash
npm install github:ashneil12/openclaw-honcho-multiagent
```

## Upstream

Based on [`@honcho-ai/openclaw-honcho@1.1.0`](https://www.npmjs.com/package/@honcho-ai/openclaw-honcho)
