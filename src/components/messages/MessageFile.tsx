import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { isImage, useUploads } from '../../services/attachments.js'
import { loadFile } from '../../services/chat/db.js'
import type { FileAttachment } from '../../services/chat/types.js'
import { IconPhotoErrorFill20, IconRefreshOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import { FileCard } from '../files/FileCard.js'
import styles from './MessageFile.module.css'

/** 原件从 IndexedDB 读出并生成本地地址；卸载时释放 */
const useFileUrl = (id: string) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    loadFile(id).then((blob) => {
      if (blob && !cancelled) {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      }
    })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [id])
  return url
}

/** 消息里附件的上传状态（先上屏后上传）：只在还没有 serverId 时显示 */
const useUploadState = (file: FileAttachment) =>
  useUploads((state) => {
    if (file.serverId) {
      return null
    }
    const task = state.tasks[file.id]
    return task?.status === 'uploading' || task?.status === 'error' ? task : null
  })

/**
 * 消息里的附件：
 * - 图片：纯图片显示 120×120 缩略图，与文件混排时为 64×64；上传中显示 loading 蒙层，
 *   上传失败显示品牌色描边 + 中心重试图标（可重试）或 photo-error 图标（不可重试）。
 * - 文件：显示文件卡片。
 */
export const MessageFile = ({
  file,
  onRetry,
}: {
  file: FileAttachment
  /** 本条消息补传失败且可重试时提供 */
  onRetry: (() => void) | null
}) => {
  const t = useTranslate()
  const url = useFileUrl(file.id)
  const upload = useUploadState(file)
  const uploading = upload?.status === 'uploading'
  const failed = upload?.status === 'error'
  const retryable = failed && upload.retryable
  const errorText = !failed
    ? undefined
    : typeof upload.error === 'string'
      ? upload.error
      : t(upload.error.key, upload.error.params)

  const retry = retryable ? onRetry : null

  if (isImage(file.mimeType)) {
    // 上传中：本地原件已在 IndexedDB，先垫在蒙层下显示，避免只有一块灰色占位
    if (uploading) {
      return (
        <div className={clsx(styles.image, styles.imageThumb)} title={file.name}>
          {url ? <img src={url} alt={file.name} /> : null}
          <div className={styles.overlay}>
            <span className={styles.spinner} />
          </div>
        </div>
      )
    }

    // 上传失败不可重试：占位块 + photo-error 图标（灰色）
    if (failed && !retry) {
      return (
        <div className={styles.image} title={errorText} aria-label={errorText}>
          <span className={styles.failedIcon}>
            <IconPhotoErrorFill20 />
          </span>
        </div>
      )
    }

    // 上传失败可重试：占位块（已有缩略图则显示）+ 品牌色描边 + 重试图标
    if (failed && retry) {
      const retryLabel = t('uploadRetry', { message: errorText ?? t('uploadFileStatusFailed') })
      return (
        <Tooltip content={retryLabel}>
          <button
            type="button"
            className={clsx(styles.image, styles.imageThumb, styles.retryImage)}
            aria-label={retryLabel}
            onClick={retry}
          >
            {url ? <img src={url} alt={file.name} /> : null}
            <div className={clsx(styles.overlay, styles.retryOverlay)}>
              <IconRefreshOutline16 />
            </div>
          </button>
        </Tooltip>
      )
    }

    // 正常态：链接到原件
    return url ? (
      <a
        className={clsx(styles.image, styles.imageThumb)}
        href={url}
        target="_blank"
        rel="noreferrer"
        title={file.name}
      >
        <img src={url} alt={file.name} />
      </a>
    ) : (
      // 原件还没加载出来（极短暂）
      <div className={styles.image} />
    )
  }

  return (
    <FileCard
      name={file.name}
      size={file.size}
      status={uploading ? 'uploading' : failed ? 'error' : 'done'}
      error={errorText}
      onRetry={retry ?? undefined}
      onOpen={url && !upload ? () => window.open(url, '_blank', 'noreferrer') : undefined}
    />
  )
}
