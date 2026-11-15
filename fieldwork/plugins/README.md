# Native Fieldwork plugins

English | [中文](README.zh.md)

Fieldwork extends the actual DeepSeek Harness application. It registers independent My Farm, Community, Crop Experiments, Seed Costs, Risk Check, Evidence Guard, and Trust Guide Cordis plugins in a Fieldwork agent preset, with Host-owned private-record and trust-record services. The [UI plugin](../ui/README.md) adds native My farm, Community, and Experiments panels. Their authenticated JSON transport shares the same record owner; the Harness retains its shell and navigation.

## Run

Follow the [team setup](../SETUP.md), then run from the repository root:

```sh
pnpm run fieldwork:build
pnpm run fieldwork:start --no-open
```

Open the authenticated URL printed by the server. The **Fieldwork** preset is the default for new conversations. First launch opens the built-in [farm setup](../onboarding/README.md), which waits for a connected model before starting. For subscription testing, sign into the local Codex CLI with ChatGPT and select **GPT-6.1 Sol · Codex subscription** in the native model picker. Other providers remain configurable through Harness settings. The preset mounts separate Cordis components. Capability enable/disable is configured in the source composition for this POC; there is no custom toggle UI. Keyless tests use the actual Loader and native executor. An opt-in real-model test also exercises the [Codex subscription bridge](../codex/README.md).

## Try a conversation

1. “Read my current farm context. Help me capture why I plant this way.” Review the proposed update in the native approval dialog.
2. “Compare seed quotes: 12 hectares, 1.5 bags per hectare, CAD 120 versus CAD 108 per bag.” The deterministic result is CAD 216 less in purchase costs; it does not imply better yield or profit. Saving is a separate approved action.
3. “Browse community knowledge. Adapt the cover-crop method privately.” Review the draft, edit its baseline, then separately approve observation tracking.
4. “Record that the lower strip remained wet. Keep this observation private.” The observation is stored against the tracked method.
5. “Preview an inconclusive result summary, without my raw observations.” Publication requires a valid preview and native approval showing the selected content. Removing a shared summary preserves private records.

The preset includes no shell or arbitrary filesystem tools. Read-only operations do not prompt. Every model-requested mutation is gated by the Harness tool pipeline, not an `approved` argument or model promise. Missing approval support fails closed. A configured model receives context returned by tools.

## Trust guideline

Fieldwork follows the [trust guideline](TRUST.md): be useful first and earn trust by being right about things the farmer can check. The Trust Guide never blocks a tool. It sets how much the agent volunteers, from showing what happened up to suggesting one small trial, based on what the farmer chose to look at and ask, and it steps back after a turned-down suggestion. Risk Check gives one change on one field in USD/acre for normal and dry years, using the field history's dry-year count. Its crop table is example data and every figure says so. With the farmer's approval, `save_estimate` keeps a result that `check_estimate` later compares with the farmer's real season; the track record appears in later checks and in the `agronomist_packet` review file. Evidence Guard flags numbers without a method, range or source ([format](EVIDENCE.md)). Trust signals and estimates are stored in `$DSH_HOME/fieldwork-native/trust.v2.json` and never leave the runtime. Risk checks are read-only. Saving or checking an estimate, writing a packet, going back to the auto pace, and deleting trust data each require native approval.

## Local records and limits

Records are saved in `$DSH_HOME/fieldwork-native/records.v1.json`; they are independent of the deleted mockup data. The file now contains schema v2; valid v1 files receive a `.v1.backup` before migration. Built-in onboarding corrections and field notes use this same record owner. Original source bytes live in the adjacent `originals` directory. See the [migration guide](../../docs/upgrade-guide/v0.2.2-rc.3/fieldwork-shared-records/guide.md). Run one process per record file. Changes are serialized and committed by atomic replacement. Missing files start a clearly fictional demo farm; invalid existing files fail rather than reset. Tracking does not approve agronomic treatment or schedule physical work.

Community is a local feed shared by devices accessing this owner runtime. There is no online audience, live weather, Sentinel-2 execution, hosted runtime, or phone pairing. Preview text is not automatically anonymized. Summary construction does not attach raw observations or the farm-record object. It includes the selected title, takeaway, baseline, change, author, and method source; copied method text can contain farm details and needs review. Reviewed previews are immutable and expire on restart or when the in-memory preview limit is reached.

The [learning method guide](../methods/README.md) describes the file-backed method packages, public Sentinel-2 checker, and linked scouting and comparison tools.

## Checks

```sh
pnpm --filter @fieldwork/plugins typecheck
pnpm --filter @fieldwork/plugins test
node --test fieldwork/plugins/composition.test.mjs fieldwork/plugins/trust.composition.test.mjs
```

The composition test boots a real Harness profile, mounts the actual Fieldwork preset, and exercises native tools. A test-only answerer explicitly rejects then permits approval requests; the test checks that denial changes nothing, calculations are deterministic, private observations stay out of summaries, withdrawal retains experiments, and crop planning preserves the farmer's baseline. The trust composition test checks that a requested trial is never blocked, that stages follow history views, questions and risk checks, and that a saved and checked estimate reaches the agronomist packet. Neither simulates a real-model conversation.
