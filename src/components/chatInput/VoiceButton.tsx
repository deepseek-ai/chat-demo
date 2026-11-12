import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconMicFill16, IconMicOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import type { VoiceInputStatus } from './useVoiceInput.js'
import styles from './VoiceButton.module.css'

/**
 * 语音输入按钮。
 * 录音中为两层圆：外层半透明光圈 + 内层实心品牌色；
 * 外层先展开、内层随后放大，无回弹；录音中光圈随说话音量轻微外扩，音量回落时缓慢收回。
 */
export const VoiceButton = ({
  status,
  disabled = false,
  getLevel,
  onClick,
}: {
  status: VoiceInputStatus
  /** 当前页面无法录音（非安全上下文）时置灰，tooltip 改为提示需要 HTTPS */
  disabled?: boolean
  getLevel: () => number
  onClick: () => void
}) => {
  const t = useTranslate()
  const haloRef = useRef<HTMLSpanElement>(null)
  const recording = status === 'recording'

  // 按帧读取音量写到 CSS 变量，不经过 React 渲染
  useEffect(() => {
    if (!recording) {
      return
    }
    let frame = 0
    let level = 0
    const tick = () => {
      const target = getLevel()
      // 上升快、回落慢，避免光圈抖动
      level += (target - level) * (target > level ? 0.5 : 0.12)
      haloRef.current?.style.setProperty('--level', level.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [recording, getLevel])

  const label = disabled
    ? t('voiceInputRequiresHttps')
    : recording
      ? t('voiceInputStop')
      : status === 'transcribing'
        ? t('voiceInputCancel')
        : t('voiceInput')

  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={clsx(styles.button, recording && styles.recording, disabled && styles.disabled)}
        aria-label={label}
        aria-pressed={recording}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onClick()
          }
        }}
      >
        {recording ? (
          <span className={styles.active}>
            <span ref={haloRef} className={styles.halo} />
            <span className={styles.core} />
            <span className={styles.outline}>
              <IconMicOutline16 />
            </span>
            <span className={styles.glyph}>
              <IconMicFill16 />
            </span>
          </span>
        ) : status === 'transcribing' ? (
          <span className={styles.loading} />
        ) : (
          <IconMicOutline16 />
        )}
      </button>
    </Tooltip>
  )
}
