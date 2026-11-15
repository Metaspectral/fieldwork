# Built-in farm setup

English | [中文](README.zh.md)

Farmer onboarding is a built-in Cordis plugin. The default Fieldwork launcher loads Jon’s six field-history tools, their skill, and a separate progress coordinator. The native Harness still owns conversations, model selection, questions, and approvals.

## First launch

1. Run `pnpm run fieldwork:build`, then `pnpm run fieldwork:start`.
2. Fieldwork opens one saved setup conversation with the Fieldwork preset and a registered farm workspace.
3. Choose a connected model in the native model picker. When its route is available, the conversation starts automatically. A deployment that already provides a configured model skips this selection step. Authentication or provider failures remain visible through native errors and retry controls.
4. The agent loads the onboarding skill and asks whether to explore the fictional corn demo or describe the farmer’s own farm. It does not look up a field before this choice.
5. Use **Setup** in the conversation header to choose **Do this later** or **Finish setup for now**. **Farm setup** in the sidebar reopens the same conversation. Finishing is the farmer’s decision, not a claim that their records have been verified.

The coordinator starts the greeting once, even across reloads and multiple browser tabs. Pausing cancels the pending setup turn and retains its conversation. Resuming reopens that history without automatically sending a second greeting; the farmer can continue in chat. Deferred or completed setup does not force navigation on later launches.

## Data and execution

The built-in history plugin explicitly uses invented demo values. It never substitutes the fictional Kansas field for the farmer’s actual farm. The agent can separately capture actual farm context with the approved My farm tools. Corrections and notes now pass through native approval.

Setup status is saved in `$DSH_HOME/fieldwork-native/onboarding.v1.json`. The conversation uses native Session storage. Field-history corrections still use the plugin’s separate `fieldwork/onboarding.json` store; linking them into My farm is future work. Invalid progress files fail visibly rather than resetting. One Host process owns each progress file.

The coordinator uses whichever model the native picker selects. Codex subscription access remains a separate provider plugin. A cloud deployment can supply native model configuration, but cloud hosting, farmer accounts, and credential provisioning are not implemented here.

## Development

The default source composition loads `fieldwork-onboarding` and `fieldwork-onboarding-progress` separately, preserving the tool plugin’s independent implementation. Do not also pass `fieldwork/onboarding/dev.patch.yml` to `fieldwork:start`: that overlay is for a standalone upstream Harness launch. The built-in composition forces demo mode; real-data developer runs remain separate and retain the [handoff’s limitations](HANDOFF.md).

```sh
pnpm --filter fieldwork-onboarding test
pnpm --filter @fieldwork/plugins test
node --test fieldwork/plugins/composition.test.mjs
FIELDWORK_BROWSER_CHANNEL=chrome node --test fieldwork/ui/onboarding.browser.test.mjs
```

Keyless checks cover durable transitions, duplicate-start prevention, native correction approval, model setup, preconfigured models, pause/resume, completion, and multiple tabs. A real `gpt-6.1-sol` conversation also verified automatic skill loading and the initial native question; the entire onboarding conversation and agronomic rules remain unqualified.
