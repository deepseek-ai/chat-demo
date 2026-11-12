import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelUpload,
  isImage,
  resolveMimeType,
  uploadAttachment,
  useUploads,
  validateFiles,
  type UploadTask,
} from '../../services/attachments.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

export type Attachment = {
  /** 本地标识，也是 IndexedDB 原件与上传任务的 key */
  id: string
  file: File
  /** 图片的本地预览地址 */
  previewUrl: string | null
}

const createId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** 输入框里的附件按上传任务显示状态；没有任务时视为上传中（排队） */
export const useAttachmentTask = (id: string): UploadTask =>
  useUploads((state) => state.tasks[id] ?? { status: 'uploading' })

/**
 * 输入框里待发送的文件：选中即开始上传到 Files API。
 * 上传中可发送：不必等上传完成，发送后消息先上屏，请求在附件就绪后发出；
 * 上传失败的附件需要先重试或删除。
 */
export const useAttachments = () => {
  const [items, setItems] = useState<Attachment[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const failed = useUploads((state) =>
    items.some((item) => state.tasks[item.id]?.status === 'error')
  )

  const upload = useCallback((item: Attachment) => {
    // 失败已记录在任务里，由卡片展示
    uploadAttachment(useSettings.getState().apiKey ?? '', item.id, item.file, item.file.name).catch(
      () => {}
    )
  }, [])

  /** 校验不通过时整批不添加，以 toast 提示原因 */
  const add = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return
      }
      const error = validateFiles(files, itemsRef.current.length)
      if (error) {
        showToast(error)
        return
      }
      const added = files.map(
        (file): Attachment => ({
          id: createId(),
          file,
          previewUrl: isImage(resolveMimeType(file)) ? URL.createObjectURL(file) : null,
        })
      )
      setItems((list) => [...list, ...added])
      added.forEach(upload)
    },
    [upload]
  )

  /** 删除：取消进行中的上传；已上传的远端文件不删（与删除会话一致，见 removeSession） */
  const remove = (item: Attachment) => {
    cancelUpload(item.id)
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
    setItems((list) => list.filter(({ id }) => id !== item.id))
  }

  const retry = (item: Attachment) => upload(item)

  /** 发送后清空：上传任务继续，由消息接管 */
  const clear = () => {
    for (const item of items) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl)
      }
    }
    setItems([])
  }

  // 卸载时只取消还在输入框里的附件；已发送的由消息继续等待
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        cancelUpload(item.id)
      }
    },
    []
  )

  return { items, add, remove, retry, clear, failed }
}
