# Trust guideline

Most farmers do not trust AI tools yet, and many trust their agronomist far more. Fieldwork does not ask for trust up front. It is useful first, shows its evidence, and earns trust by being right about things the farmer can check: first the field's own history, later its own estimates against real seasons.

This is a guideline for every Fieldwork plugin, not a gate. Nothing is locked: a farmer can ask for anything at any time and gets it, with the evidence beside it. What changes is how much Fieldwork **volunteers** unprompted.

## Checklist for a plugin

1. Does every number carry its unit, where it came from, and how sure it is? Use the [evidence format](EVIDENCE.md) and the onboarding labels ("seen on your field", "estimated for your field", "true for your region").
2. Is a made-up or missing value said plainly ("example", "no reading"), never filled with a guess?
3. Does it start from what the farmer does today, and keep that as the baseline?
4. Can the farmer say no or skip without being asked again?
5. Can someone the farmer already trusts check it? Numbers shown through the evidence format go into `agronomist_packet`.
6. Does anything it estimates get saved so it can be checked after the season?

## How much Fieldwork volunteers

The `fieldwork-trust-guide` plugin adds a short "Trust guideline" section to the system prompt. Its stage follows what the farmer chose to look at and ask:

| Stage | Fieldwork may volunteer | Reached when the farmer has |
|---|---|---|
| 1. Show what happened | Nothing beyond the answer | (start) |
| 2. Explain | A one-line reason with its source, and one thing worth a closer look | looked at the field history, a risk check or a source |
| 3. Suggest a small trial | One trial on one field, once per conversation, with dry-year dollars and blockers | asked "why?" or opened sources, and asked what a change would cost |
| 4. Talk about a plan | A multi-year plan, one year at a time | saved a trial and recorded how it turned out |

- After the farmer turns a suggestion down, new suggestions wait for five more actions.
- "Only answer what I ask" sets the pace to quiet: stage 1 until the farmer approves going back to auto.
- The agent never mentions stages or counts unless the farmer asks why it suggested something (`trust_status`).

## Track record

`risk_check` saves each result as an estimate. When the farmer reports how a trial or season turned out, `check_estimate` compares the result with the range given for a normal or dry year, through native approval. The track record ("2 of 3 checked estimates landed inside their range") appears in later risk checks and in the agronomist packet, misses included.

## Hooking in a plugin

- Return numbers in the [evidence format](EVIDENCE.md).
- If using your tool means the farmer engaged, map it in the trust guide's `autoSignals` config. Defaults cover Jon's field history tools, `risk_check`, `show_source`, `plan_crop_trial` and `record_crop_observation`.
- Signals, pace and estimates are stored in `$DSH_HOME/fieldwork-native/trust.v2.json`, on this computer only. They are never shared with buyers, lenders or insurers. `trust_forget` deletes them through native approval.
