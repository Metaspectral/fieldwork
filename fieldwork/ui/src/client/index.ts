/** Register native Harness panels and sidebar entries; no replacement application shell. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { PageController, type Face } from './controller.ts'
import { Page, FarmIcon, CommunityIcon, ExperimentIcon } from './page.tsx'
import { OnboardingController, type SetupFace } from './onboarding-controller.ts'
import { SetupCard, SetupMenu } from './onboarding.tsx'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { FieldworkMark, FieldworkName } from './brand.tsx'
import { en, zh, type FieldworkKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { fieldwork: FieldworkKey } }
/** Native client service dependencies. */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace', 'conversation', 'modelDirectories']
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
  const setupId = 'fieldwork-setup' as MainPanelId
  const onboarding = new OnboardingController({
    async open(id) {
      await ctx.sessions.refresh()
      const sessionId = id as SessionId
      await ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async reference => {
        await reference.ready
        ctx.uiWorkspace.openSession(sessionId)
        const directory = ctx.modelDirectories.directoryFor(sessionId)
        onboarding.attachModel(id, directory.store)
        await directory.load()
      })
    },
    farm: () => ctx.layout.selectPanel('fieldwork-farm' as MainPanelId),
    failed: () => ctx.layout.selectPanel(setupId),
  })
  ctx.effect(() => () => { onboarding.dispose() })
  const setupFace = (id?: string, hero?: boolean): SetupFace => ({ hooks: { setup: onboarding.store }, id, hero, open: () => onboarding.open(), begin: () => onboarding.begin(), leave: action => onboarding.leave(action) })
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: setupId, locale: 'fieldwork', inject: () => setupFace() }, SetupCard))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: setupId, order: -31, locale: 'fieldwork', label: () => t('setup') }, FarmIcon))
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'fieldwork-onboarding', locale: 'fieldwork', inject: id => setupFace(id, true) }, SetupCard))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'fieldwork-onboarding', locale: 'fieldwork', inject: id => setupFace(id) }, SetupMenu))
  void onboarding.boot()
  const sections = [{ section: 'farm', icon: FarmIcon }, { section: 'community', icon: CommunityIcon }, { section: 'experiments', icon: ExperimentIcon }] as const
  for (const [index, { section, icon }] of sections.entries()) {
    const id = `fieldwork-${section}` as MainPanelId
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'fieldwork', inject: (): Face => ({ hooks: { records: controller.store }, section, refresh: () => controller.refresh(), perform: c => controller.perform(c) }) }, Page))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: index - 30, locale: 'fieldwork', label: () => t(section) }, icon))
  }
}
