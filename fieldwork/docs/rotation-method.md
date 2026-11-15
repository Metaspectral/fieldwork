# Rotation budget method

English | [中文](rotation-method.zh.md)

The Rotation page shows one row per field: the crops recorded as grown in the three seasons before the selected season, the crop planned for that season, and the rotation the field follows. The farmer can compare the rotation they run now with one other rotation, using their own prices, yields and costs, and save the outcome as a reviewed plan. Keeping the current rotation is a valid outcome. A later revision does not rewrite an earlier plan.

## Rotations on file

The library covers one region, eastern South Dakota. It holds the six crop orders of one published study: corn–soybean, continuous corn, corn–soybean–spring wheat–sunflower, corn–soybean–spring wheat–field pea, corn–field pea–winter wheat–soybean, and corn–oats–winter wheat–soybean. The source is Bansal, Wang and Osborne 2024, Agronomy Journal 116(6):3145–3157, [doi:10.1002/agj2.21688](https://doi.org/10.1002/agj2.21688). The first two are labeled as the usual systems in the study and the other four as tested alternatives.

Every rotation carries a source and a limits sentence; a library entry without a source fails validation. A source is one of four kinds: published study, community, experiment, or the farmer's own crop order. This version fills published study and the farmer's own order. Community and experiment appear in the picker with nothing on file.

The library holds crop orders, sources and limits only. It holds no price, yield, cost or return from the study. The study describes one research site near Brookings with no-till, low-input plots, and its costs and returns cover one four-year cycle, 2017 to 2020. It does not state the yield or profit of another field.

## Calculation

`rotation-budget-v1` works per acre and per crop-year. Field area is stored in hectares and shown in acres; one international acre is 4046.8564224 square metres. Money is CAD or USD, as the farmer selects.

1. Income = price per unit × yield per acre + other income per acre.
2. Total cost = costs before land + land cost per acre.
3. Profit = income − total cost.
4. Rotation average per acre per year = sum of the crop-year profits ÷ number of crop-years.
5. Difference = compared rotation average − current rotation average.
6. Whole field per year = per-acre figure × field acres.

Yield units are bushels per acre, except sunflower in pounds per acre. Results are rounded to cents. A rotation with a blank yield, price, costs before land, or land cost is reported as not calculated. Other income is optional and counts as zero when blank.

The farmer enters every number. The same prices, yields and costs apply every year of the rotation. The calculation does not assume a rotation changes yield, and it does not predict yield, soil change, weather or prices. It does not rank or recommend a rotation.

## Records and review

A plan stores the field, season, revision, both crop orders with their sources, the entered numbers, the result with its method version, the decision to keep or switch, the crop grown in the plan's season, and the farmer's reason. Its numbers carry one label: the farmer's own records, the farmer's estimates, or fictional demo.

A field's rotation and planned crop come from its most recently accepted plan. A planned crop is never written into the grown-crop history. Acceptance is refused when a compared plan has a missing number, when the field area changed after the proposal, or when demo numbers sit on a field that is not a demo field.

Page actions show a review dialog before saving. The model tools `propose_rotation_plan` and `accept_rotation_plan` require native approval; `list_regional_rotations` and `read_rotation_plans` only read.

## Brookings example and farm map

Load the Brookings example adds three fields after a review dialog, each named and noted as an example. They are real field outlines within about one kilometre of the Brookings rotation study, copied from USDA Crop Sequence Boundaries 2018–2025 with the crop class USDA read from satellite images for each year. A class that is not a rotation crop, such as developed land or grass, is kept as a note, not as a crop. The outlines are anonymous: nobody has confirmed them as their fields, and no prices, yields or plans are added.

The farm map on My farm draws every field that has an outline or a point and labels it with its name and the crop of its most recent recorded year. The year is left off the labels when it is the same for every field. Labels that would cover each other are moved apart. Under the map, a short list names the picture, its scene and credit, and where the outlines and crop types come from. Get satellite picture, after a review dialog, reads one clear growing-season Sentinel-2 true-colour picture of the box around those fields from the public Earth Search catalog and saves it beside the records. Nothing is uploaded. Pixels cover about 10 metres, and the picture shows its acquisition date, not today. Without a picture, or when the saved picture does not cover a field added later, outlines are drawn on a plain background. With a working field selected, the map highlights that field and dims the others, the fields table shows only its row, and the Field conditions tables list only its seasons.

## Verification

Domain tests cover the six cited library entries, rejection of an entry without a source, the budget arithmetic on invented inputs, a missing number, the acceptance checks, the fictional example, the Brookings example, field locations, picture placement and saving, and migration from schema version 2 with its backup. A browser test loads the fictional example, accepts it, adds a field, records a past crop, compares two rotations, reviews and accepts the plan, and checks the table.

These checks validate software mechanics and the stated limits. A rotation decision still requires locally applicable evidence and farmer judgment.

Parts of the code, tests and text of this method were generated with AI coding assistants, directed by the project team; see the [README](../README.md).
