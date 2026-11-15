# Trust guideline: spec

Owner: Kailem. Branch: `kailem/trust-guideline`. Status: working end to end with the scripted demo model and with a real model (GPT-6.1 Sol through the Codex subscription bridge); not yet merged into `main`.

## Problem

Most farmers do not trust AI tools yet, and many trust their agronomist far more. An assistant that opens with "switch 40% of your acres to sorghum" loses them in the first minute. Fieldwork does not ask for trust up front. It answers what was asked, shows where every number came from, and offers more only as the farmer shows interest. It earns trust by being right about things the farmer can check: first the field's own history, later its own estimates against real seasons.

## What it does

1. **Nothing is locked.** The farmer can ask for anything at any time and gets it, with its evidence. What changes is how much Fieldwork *volunteers* unprompted.
2. **Volunteering follows the farmer.** The `fieldwork-trust-guide` plugin counts what the farmer chose to do (looked at the history, asked "why?", opened a source, asked what a change would cost, said no, ran a trial, recorded an outcome) and picks a stage. The stage adds one short "Trust guideline" section to the system prompt.
3. **No means no.** Turning a suggestion down drops the stage and holds new suggestions for five more actions. The farmer can also say "only answer what I ask" (quiet pace), ask "why did you suggest that?" (`trust_status`), or "forget what you noted about me" (`trust_forget`).
4. **Every number shows its work.** Numbers use the shared [evidence format](../plugins/EVIDENCE.md): unit, range, method, sources, and an `example` label for made-up values. Evidence Guard flags any number without a source.
5. **A track record the farmer can check.** Fieldwork saves its estimate before the season and checks it after harvest, misses included ("1 of 1 checked estimates landed inside its range").
6. **Someone the farmer already trusts can check it.** `agronomist_packet` writes every number's method, range and sources to a local Markdown file for the agronomist.

## Stages

| Stage | Fieldwork may volunteer | Reached when the farmer has |
|---|---|---|
| 1. Show what happened | Nothing beyond the answer | (start) |
| 2. Explain | A one-line reason with its source, and one thing worth a closer look | looked at the field history, a risk check or a source (2 times) |
| 3. Suggest a small trial | One offer of a trial on one field, made once, at the end of a reply, with dry-year dollars and blockers | asked "why?" or opened sources (2 times), and asked what a change would cost (1 time) |
| 4. Talk about a plan | A multi-year plan, approved one year at a time | saved a trial and recorded how it turned out |

The thresholds are plugin config (`rules`), not constants. The agent never mentions stages or counts unless the farmer asks why it suggested something.

### Stage 3 wording

The first version told the model it "may suggest" a trial. In a real-model run the model received the stage 3 section and never offered one: "may" is optional, and the Fieldwork persona is cautious. The current wording is a direct instruction, limited to one offer:

> If you have not offered a trial in this conversation yet, end this reply with one short offer: one small trial on one field, with its dry-year dollars (say when they are examples), its blockers and the track record. Offer it once; the rest of the farm keeps the current approach.

With this wording the same real model ended the stage 3 reply with *"If useful, we could explore a small sorghum trial on this demo field, keeping the rest unchanged: the example dry-year advantage is 35 USD/acre, but a buyer and weed-control plan need checking. No estimates have been checked against a real season yet."* After "Not this year." it answered *"I won't raise that trial again"* and did not.

## Plugins and tools

| Plugin | Tools | Approval |
|---|---|---|
| `fieldwork-trust-guide` (`trust-guide.ts`, logic in `trust.ts`) | `trust_note` (farmer asked why, accepted or declined), `trust_status`, `trust_set_pace`, `trust_forget` | `trust_forget` and going back from quiet to auto |
| `fieldwork-risk-check` (`risk-check.ts`, logic in `risk.ts`) | `risk_check` (read-only), `save_estimate`, `check_estimate` | save and check |
| `fieldwork-evidence-guard` (`evidence-guard.ts`, format in `evidence.ts`) | `show_source`, `agronomist_packet` | the packet |

- Other plugins feed the stage without code changes: their tools map to signals in the trust guide's `autoSignals` config. Defaults cover Jon's field history tools, Daniel's research, source library, corn plan, scouting and field comparison tools, and the risk check.
- Signals, pace and estimates live in `$DSH_HOME/fieldwork-native/trust.v2.json`, on this computer only. They are never shared with buyers, lenders or insurers.
- The risk check's crop table is **example data**. Every figure from it is marked `example: true`, and the model labels it ("example budgets", "made-up demo economics") without being told each time. Replace it with state extension budgets, or with the farmer's own numbers from the Rotation page, before showing farmers real numbers.

## Evidence

- Unit tests: `trust.test.ts` (stages, decline hold, quiet pace, estimates, track record, forget). End-to-end: `trust.composition.test.mjs` boots the real Harness with the preset.
- Scripted demo: `fieldwork-demo/run.sh` with the keyword demo model, recorded in `fieldwork-demo/video/fieldwork-trust-guideline.webm`.
- Screenshots and both videos: https://claude.ai/artifact/KhBVUFraSEnZeqsR4H79Jm (private until shared from its Share menu).
- Real model: `fieldwork-demo/realrun/run.mjs` runs 14 farmer lines through GPT-6.1 Sol with the full Fieldwork preset and writes `transcript.md`. The browser recording of the same story is `fieldwork-demo/video-real/fieldwork-trust-real-model.webm`.

Stage per turn in the real run (selected turns):

| Farmer | Stage |
|---|---|
| I'd like to look around the demo field. | 1 → 2 |
| How do you know 2022 was dry? | 2 |
| What would sorghum in place of the second corn year cost? | 2 |
| Where's the drought number from? | 2 → 3, trial offered once |
| Not this year. | 3 → 2, not raised again |
| Save that estimate … / After harvest … | 2, estimate saved and checked |
| Only answer what I ask from now on. | 2 → 1 |
| What would soybeans cost? | 1, numbers only, no suggestion |

## Known issues

- **Stage 2 is hard to see.** Real-model replies at stage 2 look much like stage 1. A visible cue in the UI (an input-dock button or a suggestion card with "Try it" / "Not now" that records the signal directly) would make the stages visible; not built.
- **Numbers policy.** The Rotation plugin's persona text says never to fill in a number or rank rotations, while `risk_check` compares rotations with labelled example numbers. Both in one prompt give the model opposite instructions. Proposed: at stage 3, point the farmer to the Rotation page to try the change with their own yields, prices and costs, and count the rotation tools as trust signals.
- **Cross-plugin:** `draft_field_comparison` does not recognise the field history demo field (`finney-ks-126`), and My farm still describes the barley demo farm.
- The Codex bridge sometimes repeats a sentence ("Understood… Understood…"). That is the bridge, not the trust guide.
