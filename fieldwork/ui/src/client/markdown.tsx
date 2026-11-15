/** Use the Harness Markdown renderer and localized controls for readable farm documents. */
import { useMemo } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FieldworkKey } from './locales.ts'
export function FarmMarkdown({ text, t }: { text: string; t(key: FieldworkKey): string }) {
  const labels = useMemo(() => ({ code: { copyLabel: t('copyText'), copiedLabel: t('copiedText') }, footnotes: t('references') }), [t])
  return <MarkdownText text={text} labels={labels} omitHtml />
}
