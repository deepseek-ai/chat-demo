import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useRef, useState } from 'react'
import { useTheme } from '../../app/theme.js'
import { renderMermaid } from '../../services/markdown/mermaid.js'

/** 流式绘制最新内容、保留上次有效图；回答结束后才显示渲染错误。 */
export const MermaidDiagram = memo(function MermaidDiagram({
  code,
  loading,
}: {
  code: string
  loading: boolean
}) {
  const t = useTranslate()
  const dark = useTheme() === 'dark'
  const [result, setResult] = useState({ svg: '', failedCode: null as string | null })
  const latestCodeRef = useRef(code)
  latestCodeRef.current = code
  // 流式阶段从 ref 取最新文本，避免每个片段都取消绘制；结束后立即绘制完整内容。
  const finalCode = loading ? null : code

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let previousCode: string | undefined
    let displayedCode: string | undefined

    const draw = async (input: string) => {
      if (input === displayedCode || cancelled) {
        return
      }
      const svg = await renderMermaid(input, dark, () => cancelled)
      if (svg && !cancelled) {
        displayedCode = input
        setResult({ svg, failedCode: null })
      }
    }

    const renderLatest = async () => {
      const input = latestCodeRef.current
      if (input !== previousCode) {
        previousCode = input
        try {
          await draw(input)
        } catch {
          if (!cancelled) {
            if (loading) {
              // 新片段常停在半个节点中；暂缓末行，先画前面完整的行，不补写语法。
              const text = input.trimEnd()
              const lineEnd = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'))
              const prefix = text.slice(0, Math.max(0, lineEnd))
              // 已显示的合法片段可能更长，不让节点因末行暂缓而回退。
              if (prefix && !displayedCode?.startsWith(prefix)) {
                try {
                  await draw(prefix)
                } catch {
                  // 前缀也可能尚未构成完整语法，保留已有图。
                }
              }
            } else {
              setResult({ svg: '', failedCode: input })
            }
          }
        }
      }
      // 当前帧结束后再取最新片段，既不丢弃成功帧，也不积压中间任务。
      if (!cancelled && loading) {
        timer = setTimeout(renderLatest, 100)
      }
    }

    void renderLatest()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dark, loading, finalCode])

  if (!code.trim() || !result.svg) {
    return (
      <div className="md-mermaid-status" role="status">
        {!loading && !code.trim()
          ? t('mermaidEmpty')
          : !loading && result.failedCode === code
            ? t('mermaidRenderFail')
            : t('mermaidLoading')}
      </div>
    )
  }

  return <div className="md-mermaid-diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />
})
