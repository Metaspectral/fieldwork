/** First-run guidance sits beside the native model picker and conversation. */
import type { PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SetupFace } from './onboarding-controller.ts'
import css from './page.module.css'
type Props = PropsLocale<'fieldwork'> & InjectFace<SetupFace>
/** One compact setup card works on the blank hero, active composer, and setup page. */
export function SetupCard({ t, useSetup, id, hero, open, begin, leave }: Props) {
  const s = useSetup(x => x)
  const p = s.progress
  if (id && (id !== p?.sessionId || p.phase === 'deferred' || p.phase === 'complete')) return null
  if (hero) return <section className={css.setupHero} aria-label={t('setup')}><div><strong>{t('setup')}</strong><p>{t('setupPickModel')}</p><small>{t('setupDemoShort')}</small>{s.error && <p role="alert">{s.error}</p>}</div><Button disabled={s.busy} onClick={() => void leave('defer')}>{t('setupLater')}</Button></section>
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
