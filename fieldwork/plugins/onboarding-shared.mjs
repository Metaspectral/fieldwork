/** Built-in onboarding uses the same committed field records as farm planning. */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { apply as onboarding, FieldStore } from '../onboarding/index.js'
import { FIELD } from '../onboarding/pretend-data.js'
export const name = 'fieldwork-shared-onboarding'
export const inject = ['tools', 'skills', 'farmRecords']
export async function apply(ctx, config = {}) {
  const legacy = await FieldStore.open(config.file ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'fieldwork', 'onboarding.json'))
  const records = ctx.farmRecords
  const convert = (id, record) => ({
    id, name: record.field?.county ? `${record.field.county} field` : id,
    ...(record.field?.acres > 0 ? { areaHa: record.field.acres * 4046.8564224 / 10000 } : {}),
    evidence: id === FIELD.fieldId ? 'demo' : 'farmer-reported', years: record.years, notes: record.notes,
    ...(record.field ? { geometry: record.field } : {}),
  })
  const old = Object.entries(legacy.entries())
  if (old.some(([id]) => !records.snapshot().fields.some(f => f.id === id))) {
    await records.change(s => { for (const [id, record] of old) if (!s.fields.some(f => f.id === id)) s.fields.push(convert(id, record)) })
  }
  const store = {
    field(id) {
      const f = records.snapshot().fields.find(f => f.id === id)
      return f ? { years: f.years, notes: f.notes, ...(f.geometry ? { field: f.geometry } : {}) } : { years: {}, notes: [] }
    },
    async update(id, change) {
      let result
      await records.change(s => {
        const existing = s.fields.find(f => f.id === id)
        result = existing ? { years: existing.years, notes: existing.notes, ...(existing.geometry ? { field: existing.geometry } : {}) } : { years: {}, notes: [], ...(id === FIELD.fieldId ? { field: structuredClone(FIELD) } : {}) }
        change(result)
        const converted = convert(id, result)
        if (existing) Object.assign(existing, converted, { name: existing.name })
        else s.fields.push(converted)
      })
      return structuredClone(result)
    },
    gathered: id => legacy.gathered(id),
    saveGathered: (id, data) => legacy.saveGathered(id, data),
  }
  await onboarding(ctx, { ...config, store })
}
