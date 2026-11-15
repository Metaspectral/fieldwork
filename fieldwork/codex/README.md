# Codex subscription test bridge

English | [中文](README.zh.md)

This private Cordis provider exposes the exact `gpt-6.1-sol` model through the official local Codex CLI signed in with ChatGPT. It is included by the Fieldwork source overlay and is used only when selected in the native model picker.

## Run

1. Install the official Codex CLI and run `codex login` using ChatGPT sign-in.
2. Verify `codex login status` reports ChatGPT authentication.
3. Follow [team setup](../SETUP.md), select the Fieldwork preset, then **GPT-6.1 Sol · Codex subscription**.
4. Ask: “Read my farm context. Compare 12 hectares at 1.5 bags per hectare, CAD 120 versus CAD 108 per bag. Do not save anything.” The purchase-cost difference is CAD 216.

The bridge checks local sign-in for each request and leaves credentials in Codex's own store. API-key authentication is rejected; API-key environment variables are removed from the child process. There is no model substitution and no automatic provider retry. Subscription usage and account limits apply.

## Execution boundary

Each Harness inference step invokes `codex exec` in a temporary read-only workspace with user configuration and shell, apps, plugins, browser, code mode, and MCP servers disabled. Codex returns a structured decision using only the supplied Fieldwork tool catalog. The bridge validates every requested tool name before emitting ordinary Harness tool-call chunks. Native Harness tools execute the actions and require their existing approval for mutations.

Codex receives the Harness system prompt, conversation, selected tool schemas, and tool results, including farm context returned by tools. It also has its own Codex instructions. This is a local testing adapter, not a raw model API adapter: it buffers each response, resends conversation context at each step, supports text only, and does not preserve a separate Codex thread. Requests are bounded to 120 seconds by default (`timeoutMs`), and cancellation terminates the owned CLI process. The CLI executable can be configured through `binary`.

## Evidence and checks

The real-model test reads the fictional farm and invokes the deterministic seed calculator through an actual Harness agent loop. It checks the exact model, genuine tool-call events, the final CAD 216 result, successful completion, and unchanged records. This is evidence for that workflow, not broad model or agronomic qualification.

```sh
pnpm --filter @fieldwork/codex typecheck
pnpm --filter @fieldwork/codex test
FIELDWORK_SUBSCRIPTION_TEST=1 node --test fieldwork/plugins/model.test.mjs
```

The first two checks are keyless. The opt-in check consumes the locally signed-in subscription and writes an ignored transcript to `.artifacts/model-test/result.json`. It uses an isolated temporary Harness state directory and does not copy credentials into Fieldwork.

Official references: [Codex authentication](https://learn.chatgpt.com/docs/auth#openai-authentication) and [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
