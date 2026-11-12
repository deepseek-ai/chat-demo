import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { formatSize, getExtension } from '../../services/attachments.js'
import { IconCloseFill14, IconRefreshOutline16 } from '../base/icons.js'
import { FileIcon } from './FileIcon.js'
import styles from './FileCard.module.css'

/**
 * 文档文件卡片：图标 + 文件名 + 「扩展名 大小」或状态文案。
 * 上传中图标换成 loading，失败时描边标红、点击重试；输入框里悬停显示删除。
 */
export const FileCard = ({
  name,
  size,
  status = 'done',
  error,
  onRetry,
  onRemove,
  onOpen,
}: {
  name: string
  size: number
  status?: 'uploading' | 'done' | 'error'
  error?: string
  onRetry?: () => void
  onRemove?: () => void
  onOpen?: () => void
}) => {
  const t = useTranslate()
  const ext = getExtension(name)
  let icon: ReactNode = <FileIcon ext={ext} />
  let description = [ext, formatSize(size)].filter(Boolean).join(' ')
  if (status === 'uploading') {
    icon = <span className={styles.spinner} />
    description = t('uploadFileStatusUploading')
  } else if (status === 'error') {
    // 不可重试（过大、格式不支持）时保留文件图标，只标红并显示原因
    if (onRetry) {
      icon = <IconRefreshOutline16 />
    }
    description = error ?? t('uploadFileStatusFailed')
  }
  const onClick = status === 'error' ? onRetry : status === 'done' ? onOpen : undefined
  return (
    <div
      className={clsx(
        styles.card,
        status === 'error' && styles.failed,
        onClick && styles.clickable
      )}
      title={
        status === 'error'
          ? onRetry
            ? t('uploadRetry', { message: description })
            : description
          : name
      }
      onClick={onClick}
    >
      <div className={clsx(styles.icon, status === 'error' && styles.retry)}>{icon}</div>
      <div className={styles.content}>
        <div className={styles.caption}>{name}</div>
        <div className={styles.subCaption}>{description}</div>
      </div>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          aria-label={t('delete')}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <IconCloseFill14 />
        </button>
      ) : null}
    </div>
  )
}
