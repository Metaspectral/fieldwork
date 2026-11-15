/** First-run guidance occupies the native full-width area above the composer. */
import type { PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SetupFace } from './onboarding-controller.ts'
import css from './page.module.css'
type Props = PropsLocale<'fieldwork'> & InjectFace<SetupFace>
/** A readable welcome panel sits above model selection; the setup page remains independently accessible. */
export function SetupCard({ t, useSetup, id, hero, open, begin, leave }: Props) {
  const s = useSetup(x => x)
  const p = s.progress
  if (id && (id !== p?.sessionId || p.phase === 'deferred' || p.phase === 'complete')) return null
  if (hero) {
    if (p?.phase !== 'agent-setup') return null
    return <section className={css.setupWelcome} aria-label={t('setup')}>
      <p className={css.setupEyebrow}>{t('setup')}</p>
      <h2>{t('setupConnect')}</h2>
      <p className={css.setupWelcomeBody}>{t('setupPickModel')}</p>
      {s.error && <p role="alert">{s.error}</p>}
      <div className={css.setupWelcomeFooter}><p>{t('setupDemoShort')}</p><Button variant="outline" disabled={s.busy} onClick={() => void leave('defer')}>{t('setupLater')}</Button></div>
    </section>
  }
  return <section className={css.setupCard} aria-label={t('setup')}>
    <><p className={css.brandLine}>{t('brandLine')}</p><h2>{t('setup')}</h2><p>{t(p?.phase === 'agent-setup' ? 'setupAgent' : p?.phase === 'complete' ? 'setupComplete' : p?.phase === 'deferred' ? 'setupDeferred' : 'setupIntro')}</p><p className={css.notice}>{t('setupDemo')}</p></>
    {s.error && <p role="alert">{s.error}</p>}
    <div className={css.actions}>
      {!id && <Button variant="primary" disabled={s.busy} onClick={() => void open()}>{t(p?.sessionId ? 'setupResume' : 'setupStart')}</Button>}
      {id && p?.phase === 'agent-setup' && s.error && <Button disabled={s.busy || !s.modelReady} onClick={() => void begin()}>{t('retry')}</Button>}
      {p?.phase !== 'complete' && <Button disabled={s.busy} onClick={() => void leave('defer')}>{t('setupLater')}</Button>}
      {p?.started && p.phase !== 'complete' && <Button disabled={s.busy} onClick={() => void leave('complete')}>{t('setupFinish')}</Button>}
    </div>
  </section>
}

/** Header utilities stay available while a native question replaces the composer. */
export function SetupMenu(props: Props) {
  const s = props.useSetup(x => x)
  const [open, setOpen] = useState(false)
  if (!s.progress || props.id !== s.progress.sessionId || s.progress.phase !== 'in-progress') return null
  return <><Button variant="outline" aria-label={props.t('setupOptions')} onClick={() => setOpen(true)}>{props.t('setupShort')}</Button><Modal open={open} onClose={() => setOpen(false)} closeLabel={props.t('close')} title={props.t('setup')}><p>{props.t('setupInProgress')}</p>{s.error && <p role="alert">{s.error}</p>}<div className={css.actions}><Button disabled={s.busy} onClick={() => void props.leave('defer')}>{props.t('setupLater')}</Button><Button disabled={s.busy} onClick={() => void props.leave('complete')}>{props.t('setupFinish')}</Button></div></Modal></>
}
