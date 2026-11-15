/** Register native Harness panels and sidebar entries; no replacement application shell. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { PageController, type Face } from './controller.ts'
import { Page, FarmIcon, CommunityIcon, ExperimentIcon } from './page.tsx'
import { FieldworkMark, FieldworkName } from './brand.tsx'
import { en, zh, type FieldworkKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { fieldwork: FieldworkKey } }
/** Native client service dependencies. */
export const inject = ['slots', 'locale', 'layout']
/** Register three ordinary main panels, retaining native chat and navigation. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('fieldwork', { en, zh }))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, FieldworkMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name' }, FieldworkName)
  }))
  const controller = new PageController()
  ctx.effect(() => () => { controller.dispose() })
  const t = ctx.locale.bind('fieldwork')
  const sections = [{ section: 'farm', icon: FarmIcon }, { section: 'community', icon: CommunityIcon }, { section: 'experiments', icon: ExperimentIcon }] as const
  for (const [index, { section, icon }] of sections.entries()) {
    const id = `fieldwork-${section}` as MainPanelId
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'fieldwork', inject: (): Face => ({ hooks: { records: controller.store }, section, refresh: () => controller.refresh(), perform: c => controller.perform(c) }) }, Page))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: index - 30, locale: 'fieldwork', label: () => t(section) }, icon))
  }
}
