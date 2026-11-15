# Corn seed planning method

English | [中文](corn-method.zh.md)

This first workflow compares a farmer-selected seeding trial with their existing practice. It preserves field context, the reason for the baseline, constraints, original sources, labeled inputs, accepted revisions, and dated observations. A later revision does not rewrite an earlier decision or its observations.

## Calculation

`corn-seed-budget-v1` uses hectares for field and trial area, seeds or plants per acre for rates, seeds per bag, and an explicit CAD or USD quote per bag. One international acre is 4046.8564224 square metres.

1. Alternative seeds per acre = ceiling(target plants per acre / combined establishment fraction).
2. Retain the baseline seeding rate outside the selected trial area.
3. Calculate the combined seed requirement, round up to a whole seed, then purchase whole bags.
4. Report purchase costs and unused seeds for the baseline and trial scenarios separately.

Combined establishment includes germination and subsequent field losses. Do not multiply by germination again. The farmer supplies the target and establishment estimate; neither is an application recommendation. The calculator assumes one interchangeable seed lot and no inventory already on hand. Different hybrids, bag sizes, prices, and existing inventory require separate budgets. There is no yield-response, profit, cultivar-suitability, fertilizer, pesticide, or irrigation recommendation.

[Colorado State University Extension](https://extension.colostate.edu/resource/optimizing-corn-plant-population-for-maximum-benefits/) supports adjusting desired plant stands for establishment and using field history when choosing the estimate. Its agronomic context is regional; the app does not adopt its population ranges. [South Dakota State University Extension](https://extension.sdstate.edu/corn-planting-populations-deeper-dive) explains that economic seeding decisions also depend on regional conditions, hybrid, seed cost, expected yield, and grain price. Purchase cost alone cannot establish an optimum.

## Evidence and review

Inputs carry one of six labels: farmer-reported, measured, regional, assumed, missing, or demo. These labels describe provenance, not scientific certification. Measured and regional inputs need citations before acceptance. Missing inputs block acceptance. Demo or missing sources cannot support an accepted plan for a real field. Sources retain original identity, capture time, content hash, scope, and exact cell, page, or block locators.

Spreadsheets retain formula text and cached results; import does not recalculate them. HTML is extracted as inert text. PDFs extract text by page; image-only pages need OCR. Public HTTPS capture does not support login-only sites, arbitrary ports, IPv6-only hosts, or cross-origin redirects. The farmer can import a saved original instead.

The inherited onboarding risk rules are still prototype code. Real-mode tools withhold their unvalidated classifications and derived water, soil-loss, and fertilizer-cost estimates. Regional weather summaries use an assumed crop calendar and are explicitly qualified. Fictional onboarding still illustrates the historical interface with a `pretend` flag.

## Verification

Domain tests cover the exact-acre conversion, establishment division and rounding, whole bags and leftover seeds, invalid inputs, citation checks, migration backups, originals, XLSX cached formulas, PDF page extraction, HTML script exclusion, and immutable revisions. Native composition checks exercise shared onboarding corrections and approval rejection. A browser test imports an original, inspects its cells, reviews and accepts a plan, records an observation, creates a revision, and reloads the records.

These checks validate software mechanics and the stated limits. Field recommendations still require locally applicable evidence and farmer judgment. Phone access is outside this milestone.
