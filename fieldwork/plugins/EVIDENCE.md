# Shared evidence format

Any Fieldwork tool that shows the farmer a number returns this value as its JSON result. Evidence Guard checks it and `agronomist_packet` prints it. A tool that shows no numbers needs none of it.

```ts
{
  summary: string,                // one plain-language sentence
  figures: [{
    label: string,                // "Dry-year change vs. today"
    value: number,
    unit: string,                 // "USD/acre", "bu/acre", "%"
    low: number, high: number,    // the uncertainty range
    method: string,               // one sentence an agronomist can check
    sources: string[],            // ids from `sources` below
    example?: true                // made-up number: the farmer is told
  }],
  sources: [{ id: string, title: string, url?: string, year?: number }],
  limits?: string[]               // what the method ignores
}
```

- **No source, no number.** A figure without a method, a range, or a known source id is reported as unverified; `mode: block` in the `fieldwork-evidence-guard` config turns it into an error the agent must correct.
- **Label made-up numbers.** Set `example: true`; the agent is told to say "example" whenever it shows that number.
- **Trust.** See the [trust guideline](TRUST.md) for how numbers feed the track record and how much the agent volunteers.
