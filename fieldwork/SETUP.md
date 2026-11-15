# Team setup

## Install and build

Use Git, Node.js 24.9 or newer, and Corepack. The root package pins pnpm 11.28.5. Native dependencies may need platform build tools.

```sh
git clone https://github.com/Metaspectral/fieldwork.git
cd fieldwork
corepack enable
pnpm install --frozen-lockfile
pnpm run fieldwork:build
pnpm run fieldwork:start --no-open
```

The build prepares upstream packages and the native Fieldwork UI bundle. Open the authenticated URL printed by the server; keep its credential private. The launcher uses `.fieldwork/native` for local state unless `DSH_HOME` is already set. Runtime data is ignored by Git.

Click **My farm**, **Community**, or **Experiments** in the Harness sidebar. These are native plugin panels. Use **Fieldwork** in the new-session preset selector to chat with the farm tools. The Fieldwork preset includes no shell or arbitrary filesystem tools. Read-only page use needs no model account.

## Subscription model testing

Install the official Codex CLI, run `codex login`, and choose ChatGPT sign-in. Verify with `codex login status`. In the Harness model picker choose **GPT-6.1 Sol · Codex subscription**. The exact model ID is `gpt-6.1-sol`; the bridge does not substitute another model or use an API key.

The [Codex bridge guide](codex/README.md) explains the opt-in test, limits, and context sent to Codex. Your subscription limits apply. Other Harness model providers can be configured separately.

## Local records and phone access

Records live in `$DSH_HOME/fieldwork-native/records.v1.json`. Missing records start a fictional demonstration farm. See the [plugin guide](plugins/README.md) for approval, sharing, and data boundaries.

The server listens locally. Phone pairing and hosted cloud execution are not implemented. Same-network access requires explicit listener and HTTPS/proxy configuration using the upstream remote-access guide. Community is currently a local demonstration feed.
