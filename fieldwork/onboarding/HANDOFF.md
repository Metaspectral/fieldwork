# Field history and onboarding: handoff

Written 14 November 2026, against commit `a7aabb23dc` on `main`. Nothing in `fieldwork/onboarding/` is committed yet.

## What this is

One DeepSeek Harness plugin, `fieldwork-onboarding`. It gives an agent six tools and one conversation script so it can:

1. find a farmer's field,
2. ask "Is this your field?",
3. show the crop grown each year for the last ten years, a mark for each of five problems, and the field's risks in ranked order,
4. ask "Sound right?" and save corrections.

It stops there. Suggesting rotations, and the questions about equipment, leases and money, are other people's parts.

**It is a working skeleton, not a finished product.** The rules and the plumbing are real and tested. Much of the data is either invented or not connected. The section "Everything that is fake, assumed or cut short" lists all of it.

## What has been checked, and what has not

Checked:

- 46 tests pass (`test/rules.test.js`, `test/tools.test.js`). They use stand-in data sources and never touch the network.
- One manual run against the live services, for a cropland point in Finney County, Kansas (38.0575, -100.9512) with an invented size of 126 acres. Crops, drought and heat, topsoil and salt came back. A first visit took about 12 seconds; a second took about 10 milliseconds.
- The harness starts with the plugin loaded and prints `[fieldwork-onboarding] loaded: 6 tools and the farmer-onboarding skill (pretend data)`.

Not checked:

- **No model has ever called these tools.** Nobody has set up a model, so the agent has never run the conversation. Whether `/farmer-onboarding` finds the skill is unknown.
- Installing the package with `dsh plugin add`. Only loading it from this checkout has been tried.
- Anything after the pull of `a7aabb23dc`. The harness was not rebuilt, so it is unknown whether this plugin and the new `fieldwork/plugins` and `fieldwork/ui` packages load together.
- Any field outside Kansas. Any field in Alaska or Hawaii.

## How to run it

Needs Node 24.9 or newer. On Jon's machine Node 24.22.3 is installed beside the default Node 22 and is not the default.

```sh
pnpm install
pnpm run build

# tests
pnpm --filter fieldwork-onboarding test

# the harness with this plugin, pretend data on
DSH_HOME="$PWD/.fieldwork/dev-runtime" DSH_TELEMETRY_DISABLED=1 \
  pnpm dsh --profile web --patch fieldwork/onboarding/dev.patch.yml --no-open
```

To use real data, set `FIELDWORK_PRETEND=0` before starting, or add `config: { pretend: false }` to the row in `dev.patch.yml`. Real data sends the field's latitude and longitude to four outside services (listed below).

## The files

| File | What it holds |
|---|---|
| `index.js` | The plugin: the six tools, their output shapes, the text the model reads, saved answers |
| `history.js` | The rules: levels for each problem, rotation, ranking. No network code |
| `sources.js` | Fetching from outside services, and the four sources that are not connected |
| `settings.js` | Every threshold |
| `crops.js` | The hand-entered crop table |
| `pretend-data.js` | Every invented value |
| `skills/farmer-onboarding/SKILL.md` | The conversation order and wording rules |
| `cordis.patch.yml`, `dev.patch.yml` | How the harness loads the plugin (installed, and from this checkout) |

The tools: `find_field`, `field_history`, `year_detail`, `field_risks`, `correct_year`, `save_field_note`.

---

## Everything that is fake, assumed or cut short

### 1. Invented data

All of it lives in `pretend-data.js` and is returned whenever the pretend switch is on. **The switch is on by default** (`index.js` line 345).

| What is invented | Where | What a real version needs |
|---|---|---|
| The field: 126 acres, Finney County, Kansas, irrigated, "Richfield silt loam", 1% slope | `FIELD`, line 17 | Nothing; real mode already replaces it |
| The ten-year grid of crops and marks, 2016 to 2025 | `GRID`, line 37 | Real mode replaces it, as far as sources are connected |
| The "how sure" label for each problem | `SURE`, line 14 | In real mode the label comes from which data was actually used |
| Readings for 2022 only (9 inches of rain, 41 hot days, 24 inches of water, 6.4 tons of soil, $171 an acre) | `READINGS`, line 53 | Real mode works these out. The other nine pretend years have no readings at all |
| "Low" salt as a word, not a number | `READINGS` | Real mode gives a number in deciSiemens per metre |
| `windNotCounted: true` | line 88 | Real mode works it out from rainfall |

Behaviour that is fake while the switch is on:

- `find_field` ignores the point it is given and always returns the same field (`index.js` line 390).
- A corrected crop changes the crop only. Water, topsoil and costs are **not** worked out again, because there is nothing to work them out from.
- The years are fixed at 2016 to 2025 whatever today's date is.

Two pretend notes were changed from the mockup on purpose, because no listed source can support them: 2022 water no longer says "groundwater down 2.1 feet", and 2022 topsoil no longer says "mostly wind". **The mockup screens still say both and need changing.**

### 2. Data sources that are not connected

These four are stubs that return nothing (`sources.js` lines 140 to 143). The rules that use them are written and tested with stand-in numbers; only the fetching is missing.

| Source | Needs | What is empty until it is connected | Shape the rules expect |
|---|---|---|---|
| Crop greenness (NASA's Harmonized Landsat and Sentinel-2 images) | NASA Earthdata login, plus code to read images inside the field edge | The "crop hit" part of drought and heat. Without it, drought and heat can only ever be "true for your region" | `{ 2022: 0.71 }`: peak greenness per year, 0 to 1 |
| Water the crop used (OpenET) | Account key | Water is "no reading" every year | `{ "2022-7": 6.2 }`: inches per year-month |
| The region's stored water (NASA GRACE and GRACE-FO) | NASA Earthdata login | Water is "no reading" every year | `{ 2022: -3.1 }`: change that year; below zero means it fell |
| Fertilizer prices (USDA price records) | Free key | Costs is "no reading" every year | `{ 2022: 0.62 }`: dollars per pound |

So today, on real data, **only drought and heat, topsoil and salt ever get a reading.** Water and costs never do.

Known limits to handle when connecting them (from the spec): GRACE has a gap from mid-2017 to mid-2018 and covers regions hundreds of kilometres wide; OpenET covers the western United States only; nobody has checked which years OpenET has.

### 3. Sources that are connected, and their shortcuts

| Source | Used for | Shortcut taken |
|---|---|---|
| US Census geocoder | County, state, and whether the point is in the United States | "In the United States" simply means the Census found a county |
| USDA Cropland Data Layer, through a point lookup hosted at George Mason University | Crop each year | See "The field and its crops" below |
| NASA POWER | Daily rain and hottest temperature, 31 years | It is for an area about 50 kilometres across, not the field. Fetched once and never refreshed unless the year range changes |
| USDA soil survey | Soil name, slope, tolerable soil loss, erodibility, salt | One lookup at the centre point only, taking the largest soil component there. A field with two soils gets one |

None of these has a fallback. If one is down, that part is "no reading" and the reason is passed to the agent.

### 4. The field and its crops

- **No field edge.** The spec asks for a polygon. The code takes a centre point and acres and assumes a circle. There is no lookup of real field boundaries and no map to tap.
- **No place search.** `find_field` needs latitude and longitude. Turning "my farm near Holcomb" into a point is left to the model, which will guess.
- **Acres and irrigation come from the farmer.** No source is used for either. Until the farmer answers, water and salt are left out.
- **The field's id is its rounded coordinates** (`index.js` line 394). Two fields whose centres are within about 10 metres collide. There are no accounts and no owner.
- **Crops are read at 5 points, not across the field** (`settings.js`, `samplePoints`): the centre and four points at 60% of the radius (`sources.js` line 48). The spec asks for the most common crop inside the edge. The crop map's area summary returned nothing when tried, so points were used instead. With 5 points, "under 60% of the field" means 2 of 5 points disagree.
- **The crop map service is slow and stalls.** Each point is one request, with a 12 second limit and one retry (`sources.js` line 11). A first visit makes 50 requests.
- **Lower 48 states only.** The map projection in `toCropMapGrid` is for the lower 48. Alaska and Hawaii would pass the "in the United States" check and then read the wrong place.
- **Only eight crop map names are translated** (`crops.js` line 23). Everything else, including double crops such as winter wheat followed by soybeans, passes through as its lower-cased map name. Those crops have no row in the crop table, so they get no topsoil or costs reading and a default growing season.
- **Fallow has no crop table row**, so a fallow year gets no topsoil reading, which is the year soil loss matters most.
- **Rotation detection is exact.** It finds a pattern only if the crops repeat perfectly at least twice. One odd year, or one unknown year, gives "no repeating pattern found". The real run found none.

### 5. The crop table

`crops.js` line 14. **Every number in it was typed in as a rough guess and has not been checked against any agronomy source**: growing months, the temperature that counts as a hot day, water need, fertilizer need, and ground cover. Every level depends on these. It also treats all wheat as winter wheat (sown the autumn before), and has one row per crop with no regional differences.

### 6. The rules

All thresholds are in `settings.js` and are the spec's starting values. None has been tuned against real fields. Beyond that:

| Rule | Shortcut or assumption | Where |
|---|---|---|
| Drought and heat | "Usual greenness" needs only two years of the same crop | `history.js` line 243 |
| Drought and heat | A month counts if it has 20 or more days of weather. This number is not in the settings file | `history.js` line 180 |
| Water | Shortfall is water used minus rain over the crop's growing months. Needs every month present | `computeHistory` |
| Topsoil | Rain's erosive force is estimated from yearly rainfall with a published shortcut formula, not taken from real storm records. The constants are in the code, not the settings file | `soilLoss`, line 63 |
| Topsoil | Slope comes from the soil survey, not elevation data as the spec says. Slope length is assumed to be 150 feet for every field | `settings.js` |
| Topsoil | Ground cover is one fixed number per crop. The spec asks for cover from the crop **and the days the ground sat bare**; bare days are not counted | `crops.js` |
| Topsoil | Counts rain only. In dry, windy places most loss is wind, so real results look falsely reassuring: the Finney County run gave 0.4 tons an acre against a limit of 5. A note says so, but there is no wind estimate | `topsoilResult` |
| Salt | Uses the soil survey's surface-layer figure. "Dry climate" means under 20 inches of rain a year on average | `settings.js` |
| Costs | Fertilizer only, as one "pounds of nutrients" figure per crop. Weed-control costs, which the handoff also names, are not included | `crops.js` |
| All levels | When one input is missing, the level comes from the inputs that exist. So a "fine" can rest on partial data. The missing reading is listed beside it, but the mark itself looks the same | `levelFromSignals`, line 37 |
| Ranking | The spec ranks field-level problems first. That put a zero-score problem on top ("Top risk: topsoil. Bad in 0 of 5 years"), so the headline uses the highest-ranked problem that scored above zero. This departs from the spec | `index.js`, `field_risks` |
| Ranking | "Thirstiest crop" is read from the crop table, not measured | `thirstiestCrop`, line 278 |
| Years | "The last ten full years" is taken from the computer's clock | `index.js` line 349 |
| Units | Inches, Fahrenheit, acres, tons an acre, dollars. No metric | throughout |

### 7. Saving and privacy

- **Farmer answers are one JSON file on the machine running the harness**: `fieldwork/onboarding.json` inside the harness's data folder (`index.js` line 304). Gathered data sits beside it in `field-data/`, one file per field. This follows the earlier proof of concept; nobody decided it.
- One process at a time. No accounts, no login of its own, no encryption, no backup, no way to delete a field.
- **Saved data never expires.** A year's crop, once fetched, is kept for good. Changing `samplePoints` does not refetch.
- Corrections can change a year's crop and add a note. They **cannot** change a mark, and there is no undo. Notes can only be added.
- **Real mode sends the field's location to NASA, the USDA crop map host, the USDA soil survey and the US Census, with no notice to the farmer.** The architecture document says outside data use must be visible. Nothing shows it yet.

### 8. The agent and the conversation

- **No agent preset.** The tools are added for every agent, and the standard agent can also run commands and edit files. The handoff asked for a farmer agent with only these tools, the question tool and a plain-spoken persona. Not built.
- The skill is registered by the plugin when it loads rather than placed in `.dsh/skills/`, because that folder is ignored by git. Untested with a real agent.
- "Crops first, then problems" depends on the agent calling `field_history` twice, as the skill tells it to. Nothing enforces it.
- The wording rules (no predictions, no satellites, plain words) are instructions in `SKILL.md`. Nothing checks that the model follows them.
- English only. The rest of the repository keeps Chinese translations of its documents.

### 9. No screens

There is no interface. A farmer sees chat text and the harness's question cards, not the phone mockup. The mockup's history grid, the map for picking a field, and the one-tap correction do not exist. `fieldwork/ui` now shows how to add pages inside the harness; a history page fed by these tools would be new work.

### 10. Packaging and housekeeping

- `cordis.patch.yml` (the installed route) has never been exercised.
- The plugin announces itself with `console.log`, because the harness's own logger did not show the line.
- Network time limits are constants in `sources.js` (lines 9 and 11), not in the settings file.
- No README for the package, and no entry in the Fieldwork README.
- Not integrated with `fieldwork/start.mjs`, which loads only `fieldwork/plugins`.

---

## Decisions nobody has made

1. Which model the agent uses, and whose key. Blocks the first real conversation.
2. Who gets the three accounts: NASA Earthdata, OpenET, USDA price records. Blocks water, costs and field-level drought.
3. Where farmer data lives, and who may read it.
4. Whether the demo runs on pretend data, real data, or one real field prepared in advance.
5. Whether to build a history page, and whether it sits in `fieldwork/ui`.
6. Whether wind erosion gets an estimate or topsoil is left out for dry regions.
7. How this fits with the workspace in `fieldwork/plugins`, which has a different product direction (current practice, experiments, community) from the rotation tool this plugin was specified for.

## Suggested order

1. Set up a model and run `/farmer-onboarding` once on pretend data. Fix what breaks.
2. Rebuild after the pull and confirm this loads beside `fieldwork/plugins`.
3. Add the farmer agent preset.
4. Have someone who knows crops check `crops.js`.
5. Connect fertilizer prices (a free key, the smallest job), then OpenET, then greenness.
6. Replace the circle with a real field edge and count crops across it.
7. Decide on screens.
