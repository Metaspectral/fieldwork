/** Fieldwork identity uses the existing layered-field metaphor from the native icon set. */
import { IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './brand.module.css'
/** Reuse native artwork in the sidebar's requested square geometry. */
export function FieldworkMark({ size }: PropsRuntime<'sidebar.brand.mark'>) {
  return <span className={css.mark} style={{ width: size, height: size }}><IconLayersOutlineRegular size={size * 2 / 3} /></span>
}
/** Product name stays text, inheriting the application font and accessibility behavior. */
export function FieldworkName() { return <span className={css.name}>Fieldwork</span> }
