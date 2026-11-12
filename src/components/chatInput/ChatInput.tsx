import clsx from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  IconCloseFill14,
  IconGlobeLanguageOutline14,
  IconPaperclipOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
  IconWarningOutline16,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { Tooltip } from '../base/Tooltip.js'
import { FileCard } from '../files/FileCard.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { ACCEPT, resolveMimeType } from '../../services/attachments.js'
import { useAttachments, useAttachmentTask, type Attachment } from './useAttachments.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 输入框里的文件：图片显示缩略图，其余显示文件卡片 */
const AttachmentItem = ({
  item,
  onRetry,
  onRemove,
}: {
  item: Attachment
  onRetry: () => void
  onRemove: () => void
}) => {
  const t = useTranslate()
  const task = useAttachmentTask(item.id)
  const status = task.status
  const error =
    task.status !== 'error'
      ? undefined
      : typeof task.error === 'string'
        ? task.error
        : t(task.error.key, task.error.params)
  // 过大、格式不支持等重试无效的失败只提示原因，需删除后再发送
  const retry = task.status === 'error' && task.retryable ? onRetry : undefined
  return item.previewUrl ? (
    <div className={styles.attachment} title={error ?? item.file.name}>
      <img src={item.previewUrl} alt={item.file.name} />
      {status === 'uploading' ? <div className={styles.uploading} /> : null}
      {status === 'error' ? (
        <Tooltip
          content={
            retry ? t('uploadRetry', { message: error ?? t('uploadFileStatusFailed') }) : error
          }
        >
          <button
            type="button"
            className={styles.failed}
            aria-label={
              retry ? t('uploadRetry', { message: error ?? t('uploadFileStatusFailed') }) : error
            }
            disabled={!retry}
            onClick={retry}
          >
            <IconWarningOutline16 />
          </button>
        </Tooltip>
      ) : null}
      <button type="button" className={styles.remove} aria-label={t('delete')} onClick={onRemove}>
        <IconCloseFill14 />
      </button>
    </div>
  ) : (
    <FileCard
      name={item.file.name}
      size={item.file.size}
      status={status}
      error={error}
      onRetry={retry}
      onRemove={onRemove}
    />
  )
}

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = ({
  variant,
  sessionId,
  streaming,
}: {
  variant: 'home' | 'session'
  sessionId: string | null
  streaming: boolean
}) => {
  const t = useTranslate()
  const [text, setText] = useState('')
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const attachments = useAttachments()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const addFiles = (files: File[]) => {
    if (files.length > 0 && ensureApiKey()) {
      attachments.add(files)
    }
  }
  const dragging = useFileDrop(addFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? text.length
    const end = textarea?.selectionEnd ?? text.length
    setText(text.slice(0, start) + transcript + text.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 上传中也可以发送：消息先上屏，附件就绪后再请求；上传失败的需先重试或删除
  const canSend =
    !importingHistory &&
    !streaming &&
    voice.status === 'idle' &&
    (text.trim() !== '' || attachments.items.length > 0) &&
    !attachments.failed

  const send = () => {
    if (useChatStore.getState().importingHistory) {
      return
    }
    if (!canSend || !ensureApiKey()) {
      if (attachments.failed && !streaming) {
        showToast({ key: 'uploadFileDeleteInvalidFilePrompt' })
      }
      return
    }
    stopReadAloud()
    sendMessage(
      text.trim(),
      attachments.items.map((item) => ({
        id: item.id,
        serverId: null,
        name: item.file.name,
        size: item.file.size,
        mimeType: resolveMimeType(item.file),
        blob: item.file,
      }))
    )
    setText('')
    attachments.clear()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className={clsx(styles.wrapper, styles[variant])}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      {attachments.items.length > 0 ? (
        <div className={styles.attachments}>
          {attachments.items.map((item) => (
            <AttachmentItem
              key={item.id}
              item={item}
              onRetry={() => attachments.retry(item)}
              onRemove={() => attachments.remove(item)}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.textareaWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              addFiles(files)
            }
          }}
        />
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          <Tooltip content={t('deactivatedThinkTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, thinking && styles.selected)}
              aria-label={t('thinkingSwitch')}
              aria-pressed={thinking}
              onClick={() => setThinking(!thinking)}
            >
              <IconThinkOutline14 />
              <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
            </button>
          </Tooltip>
          <Tooltip content={t('deactivatedSearchTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          <VoiceButton
            status={voice.status}
            disabled={!voice.available}
            getLevel={voice.getLevel}
            onClick={() => ensureApiKey() && void voice.toggle()}
          />
          <IconButton
            size="m"
            tone="primary"
            icon={<IconPaperclipOutline16 />}
            tooltip={t('uploadFile')}
            onClick={() => ensureApiKey() && fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(event) => {
              attachments.add(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
  )
}
