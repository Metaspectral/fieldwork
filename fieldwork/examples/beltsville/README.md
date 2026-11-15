# Beltsville public-data example

English | [中文](README.zh.md)

This example uses USDA Beltsville Agricultural Research Center Central Farm 1-7. The [USDA BARC archive, version 2](https://doi.org/10.15482/USDA.ADC/28950746.v2) identifies the data as [U.S. Public Domain](https://www.usa.gov/publicdomain/label/1.0/). The three included files retain their downloaded bytes; [manifest.json](manifest.json) records their hashes and source identity.

## Open the case

In **Field learning**, select **Explore Beltsville open data**, review the import, and confirm. Fieldwork creates a separate public-data field, catalogs the original files, and saves an investigation with open questions and local tasks. It preserves the current farm practice. Reopening the example selects its existing investigation. It does not activate monitoring or create a budget or treatment trial.

Inspect the attached [2014 worksheet](yield-points-2014.csv), [published yield map](yield-map-2014.jpg), and [management report](management-history.pdf). The worksheet contains 2,984 cleaned monitor points. The management report lists 28.95 acres, approximately 11.7156 hectares; its later silage-corn and rye history is separate from the 2014 yield observations. Current crop, management, farmer reasoning, and an authoritative current field boundary remain unknown.

Select **Inspect yield points** and review `XCoord`, `YCoord`, and `YLD_VOL_DR`. The published map legend identifies grain yield in `bu/ac`; leave the coordinate-system label unknown unless supported by the original documentation. The descriptive check retains 2,984 valid rows, no missing or invalid rows, and an unweighted point mean of approximately 117.070 bu/ac. This is not an area-weighted field yield, a diagnosis, or a treatment comparison. The published interpolated map and cleaned points are different products with different value ranges.

## What to investigate

The working question asks whether low-yield bands recur in comparable corn seasons and what to check before changing practice. Review units, calibration, moisture correction, coverage and machinery effects; add matched seasons and management context; then record field observations and competing explanations. Keep missing evidence as local work items. Choose an alternative practice and trial design only when the farmer is ready.

The current executor checks points and plots their imported coordinate space. It does not align historical rasters, calculate persistence, diagnose compaction or drainage, or treat yield pixels as experimental replicates. The [method instructions](../../methods/historical-yield/SKILL.md) define the investigation, and the [method guide](../../methods/README.md) describes private files and runtime behavior.
