import { create } from 'zustand'
import { ApiError, streamMessage } from '../api/client.js'
import type { ChatModel, CreateMessageRequest } from '../api/types.js'
import { isRetryableApiError } from '../api/errors.js'
import { describeUploadError, uploadAttachment, useUploads } from '../attachments.js'
import { useSettings } from '../settings.js'
import { appendBranch, getVisibleMessages, normalizeSession, selectVersion } from './branches.js'
import * as db from './db.js'
import { createLatestReminder } from './latestReminder.js'
import {
  applyEvent,
  canContinueReply,
  getContextRounds,
  settleReply,
  toRequestMessages,
} from './reply.js'
import type { AssistantMessage, FileAttachment, Message, Session, UserMessage } from './types.js'

/** deepseek-flash 同时支持深度思考与图片输入 */
const MODEL: ChatModel = 'deepseek-flash'
/** 所有生成请求统一携带的助手身份说明 */
const SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'
/** 流式过程中每隔一段时间落盘一次，页面意外关闭时保留大部分内容 */
const SAVE_INTERVAL = 2000
/** 安全审核固定开启，所有请求都走扩展模式 */
const SAFETY_CHECK = { level: 'high' } as const

/** 阅读链接始终开启，智能搜索开关控制是否另行声明搜索工具（含边想边搜）。 */
const serverTools = (search: boolean): CreateMessageRequest['tools'] => {
  const tools: CreateMessageRequest['tools'] = [
    { type: 'deepseek_read_url', name: 'deepseek_read_url' },
  ]
  if (search) {
    tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' })
  }
  return tools
}

/** 允许自动补标题的请求；手动重命名后取消本轮标题写入，包含主动清空标题的情况。 */
const titleRequests = new Set<AbortController>()

type ChatState = {
  ready: boolean
  /** 历史导入期间（从确认到替换完成）锁定交互，原有记录仍正常展示。 */
  importingHistory: boolean
  /** 按 updatedAt 降序 */
  sessions: Session[]
  /** null 表示新对话（欢迎页） */
  activeId: string | null
  /** 正在生成回复的会话 */
  streaming: Record<string, AbortController>
}

export const useChatStore = create<ChatState>(() => ({
  ready: false,
  importingHistory: false,
  sessions: [],
  activeId: null,
  streaming: {},
}))

const { getState: get, setState: set } = useChatStore

const createId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const sortSessions = (sessions: Session[]) =>
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

const getSession = (id: string) => get().sessions.find((session) => session.id === id)

const updateSession = (id: string, update: (session: Session) => Session) =>
  set((state) => ({
    sessions: state.sessions.map((session) => (session.id === id ? update(session) : session)),
  }))

const updateReply = (sessionId: string, reply: AssistantMessage) =>
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.id === reply.id
        ? { ...reply, parentId: message.parentId, selectedChildId: message.selectedChildId }
        : message
    ),
  }))

const persist = (sessionId: string) => {
  const session = getSession(sessionId)
  if (session) {
    db.saveSession(session).catch(db.reportStorageError('save session'))
  }
}

/** 按当前开关创建回复：深度思考对应 thinking，智能搜索控制 deepseek_web_search。 */
const createReply = (): AssistantMessage => {
  const { thinking, search } = useSettings.getState()
  return {
    id: createId(),
    role: 'assistant',
    createdAt: Date.now(),
    model: MODEL,
    thinking,
    search,
    status: 'pending',
    blocks: [],
  }
}

/** 仍在生成中的回复（页面关闭或导出时未结束）按「已停止」处理 */
const settleInterrupted = (sessions: Session[]) =>
  sessions.map((session) => {
    if (
      !session.messages.some(
        (m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
      )
    ) {
      return session
    }
    return {
      ...session,
      messages: session.messages.map((m) =>
        m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
          ? settleReply(m, 'stopped', session.updatedAt)
          : m
      ),
    }
  })

export const initChat = async () => {
  const stored = await db.loadSessions()
  const settled = settleInterrupted(stored.map(normalizeSession))
  set({ ready: true, sessions: sortSessions(settled) })
  await Promise.all(
    settled.filter((session, index) => session !== stored[index]).map(db.saveSession)
  )
}

/** 等所有回复的收尾（落盘）完成 */
const waitForIdle = () =>
  new Promise<void>((resolve) => {
    if (Object.keys(get().streaming).length === 0) {
      resolve()
      return
    }
    const unsubscribe = useChatStore.subscribe((state) => {
      if (Object.keys(state.streaming).length === 0) {
        unsubscribe()
        resolve()
      }
    })
  })

/**
 * 导入历史对话：先写入暂存存储，全部成功后再替换并删除旧记录；失败时清除暂存，原有记录不变。
 * 导入期间停止生成并禁止修改会话，避免替换时丢失这段时间的改动。
 */
export const replaceHistory = async (write: () => Promise<void>): Promise<number> => {
  set({ importingHistory: true })
  try {
    for (const controller of Object.values(get().streaming)) {
      controller.abort()
    }
    await waitForIdle()
    await db.clearStaging()
    try {
      await write()
      await db.commitStaging()
    } catch (error) {
      await db.clearStaging().catch(db.reportStorageError('clear unfinished history import'))
      throw error
    }
    const settled = settleInterrupted((await db.loadSessions()).map(normalizeSession))
    set({ sessions: sortSessions(settled), activeId: null })
    return settled.length
  } finally {
    set({ importingHistory: false })
  }
}

export const newChat = () => {
  if (!get().importingHistory) {
    set({ activeId: null })
  }
}

export const selectSession = (id: string) => {
  if (!get().importingHistory) {
    set({ activeId: id })
  }
}

export const renameSession = (id: string, title: string) => {
  if (get().importingHistory) {
    return
  }
  const controller = get().streaming[id]
  if (controller) {
    titleRequests.delete(controller)
  }
  updateSession(id, (session) => ({ ...session, title }))
  persist(id)
}

/**
 * 删除会话；本地原件仅在没有其他会话引用时清理。远端文件不删：导入、编辑、重新生成都会复用同一个附件，
 * 同一服务端文件可能被多个会话引用，不维护引用计数。
 */
export const removeSession = async (id: string) => {
  if (get().importingHistory) {
    return
  }
  get().streaming[id]?.abort()
  set((state) => ({
    sessions: state.sessions.filter((session) => session.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  }))
  await db.deleteSession(id)
}

export const stopReply = (sessionId: string) => get().streaming[sessionId]?.abort()

/**
 * 发送一轮提问；没有当前会话时新建。
 * 附件可以仍在上传：消息先上屏，请求在附件全部拿到 serverId 后才发出（见 streamReply）。
 */
export const sendMessage = (text: string, files: (FileAttachment & { blob: Blob })[]) => {
  if (get().importingHistory) {
    return
  }
  const now = Date.now()
  let sessionId = get().activeId
  if (sessionId && get().streaming[sessionId]) {
    return
  }
  if (sessionId === null || !getSession(sessionId)) {
    const session: Session = {
      id: createId(),
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
      rootMessageId: null,
    }
    sessionId = session.id
    set((state) => ({ sessions: [session, ...state.sessions], activeId: session.id }))
  }
  const current = getSession(sessionId)
  if (!current) {
    return
  }
  const history = getVisibleMessages(current)
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: files.map(({ id, serverId, name, size, mimeType }) => ({
      id,
      serverId,
      name,
      size,
      mimeType,
    })),
    createdAt: now,
  }
  const reply = createReply()
  updateSession(sessionId, (session) => ({
    ...appendBranch(session, history.at(-1)?.id ?? null, [question, reply]),
    updatedAt: now,
  }))
  set((state) => ({ sessions: sortSessions(state.sessions) }))
  if (files.length > 0) {
    db.saveFiles(files.map(({ id, blob }) => ({ id, blob }))).catch(
      db.reportStorageError('save files')
    )
  }
  persist(sessionId)
  void streamReply(sessionId, reply, { history, question })
}

/** 重新生成当前路径上的回答：在原问题下新增版本，不覆盖旧回答和后续对话。 */
export const regenerateReply = (sessionId: string, messageId?: string) => {
  if (get().importingHistory) {
    return
  }
  const session = getSession(sessionId)
  if (!session || get().streaming[sessionId]) {
    return
  }
  const path = getVisibleMessages(session)
  const index =
    messageId === undefined ? path.length - 1 : path.findIndex((m) => m.id === messageId)
  const question = path[index - 1]
  if (question?.role !== 'user' || path[index]?.role !== 'assistant') {
    return
  }
  const history = path.slice(0, index - 1)
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, question.id, [reply]),
    updatedAt: Date.now(),
  }))
  set((state) => ({ sessions: sortSessions(state.sessions) }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history, question })
}

/** 编辑提问后新增同父版本，保留原文件；旧问题的所有回答与后续对话仍可切回。 */
export const editMessage = (sessionId: string, messageId: string, content: string): boolean => {
  if (get().importingHistory) {
    return false
  }
  const session = getSession(sessionId)
  if (!session || get().streaming[sessionId]) {
    return false
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const previous = path[index]
  const text = content.trim()
  if (previous?.role !== 'user' || (!text && previous.files.length === 0)) {
    return false
  }
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: previous.files,
    createdAt: Date.now(),
  }
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, path[index - 1]?.id ?? null, [question, reply]),
    updatedAt: Date.now(),
  }))
  set((state) => ({ sessions: sortSessions(state.sessions) }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index), question })
  return true
}

export const selectMessageVersion = (sessionId: string, messageId: string) => {
  if (get().importingHistory) {
    return
  }
  if (get().streaming[sessionId]) {
    return
  }
  updateSession(sessionId, (session) => selectVersion(session, messageId))
  persist(sessionId)
}

/** 继续最后一条未完成的回答：保留原消息与开关，仅将新流的内容追加到原块之后。 */
export const continueReply = (sessionId: string, messageId: string) => {
  if (get().importingHistory) {
    return
  }
  const session = getSession(sessionId)
  if (!session || get().streaming[sessionId]) {
    return
  }
  const path = getVisibleMessages(session)
  const question = path.at(-2)
  const previous = path.at(-1)
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.id !== messageId ||
    !canContinueReply(previous)
  ) {
    return
  }
  const { thinking, search } = useSettings.getState()
  const reply: AssistantMessage = {
    ...previous,
    // 未记录请求配置的回复，续写时使用默认模型和当前开关。
    model: previous.model ?? MODEL,
    thinking: previous.thinking ?? thinking,
    search: previous.search ?? search,
    status: 'pending',
    stopReason: undefined,
    stopDetails: undefined,
    error: undefined,
  }
  updateReply(sessionId, reply)
  updateSession(sessionId, (s) => ({ ...s, updatedAt: Date.now() }))
  set((state) => ({ sessions: sortSessions(state.sessions) }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, -2), question, prefix: previous })
}

/** 附件补传失败后重试：保留原回答位置，重新补传并请求 */
export const retryUpload = (sessionId: string, messageId: string) => {
  if (get().importingHistory) {
    return
  }
  const session = getSession(sessionId)
  if (!session || get().streaming[sessionId]) {
    return
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const question = path[index - 1]
  const previous = path[index]
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.error?.kind !== 'upload'
  ) {
    return
  }
  const reply: AssistantMessage = { ...previous, status: 'pending', error: undefined }
  updateReply(sessionId, reply)
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index - 1), question })
}

type Request = { history: Message[]; question: UserMessage; prefix?: AssistantMessage }

/** 把补传得到的 serverId 写回会话里所有引用同一附件的消息（编辑、重新生成会共用附件） */
const saveServerIds = (sessionId: string, serverIds: Map<string, string>) => {
  if (serverIds.size === 0) {
    return
  }
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.role === 'user' && message.files.some((file) => serverIds.has(file.id))
        ? {
            ...message,
            files: message.files.map((file) =>
              serverIds.has(file.id) ? { ...file, serverId: serverIds.get(file.id) ?? null } : file
            ),
          }
        : message
    ),
  }))
  persist(sessionId)
}

/**
 * 附件的服务端 id：已有直接用；正在上传的等待同一任务；否则读取本地原件补传。
 * 本地也没有原件（导入的文档附件只有元数据）时返回 null，该附件只展示、不进入请求。
 */
const ensureServerId = async (apiKey: string, file: FileAttachment): Promise<string | null> => {
  if (file.serverId) {
    return file.serverId
  }
  const task = useUploads.getState().tasks[file.id]
  if (task?.status === 'done') {
    return task.serverId
  }
  const blob = await db.loadFile(file.id)
  if (!blob) {
    return null
  }
  return uploadAttachment(apiKey, file.id, blob, file.name)
}

/**
 * 发送前补齐附件的 serverId。
 * - 本轮提问的附件并行补齐，任一失败则整体失败，已成功的照常写回，重试时复用成功结果；
 * - 历史轮次（仅进入上下文的）中没有 serverId 的附件，多为导入的图片：从最新的消息往前逐张补传，
 *   失败静默跳过，该附件不进入本次请求，下次发送时再试。
 */
const prepareFiles = async (sessionId: string, request: Request, signal: AbortSignal) => {
  const apiKey = useSettings.getState().apiKey ?? ''
  const serverIds = new Map<string, string>()
  // 停止生成立即生效；上传本身不取消（输入框与其他消息可能共用同一任务），完成后照常写回 serverId
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const uploads = Promise.allSettled(
    request.question.files.map(async (file) => {
      const serverId = await ensureServerId(apiKey, file)
      if (serverId) {
        serverIds.set(file.id, serverId)
      }
    })
  )
  void uploads.then(() => saveServerIds(sessionId, serverIds))
  const results = await Promise.race([uploads, aborted])
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    throw failed.reason
  }

  const pending = new Map<string, FileAttachment>()
  for (const [user] of getContextRounds(request.history).toReversed()) {
    for (const file of user.files) {
      if (!file.serverId && !serverIds.has(file.id) && !pending.has(file.id)) {
        pending.set(file.id, file)
      }
    }
  }
  for (const file of pending.values()) {
    signal.throwIfAborted()
    try {
      const serverId = await Promise.race([ensureServerId(apiKey, file), aborted])
      if (serverId) {
        serverIds.set(file.id, serverId)
        saveServerIds(sessionId, new Map([[file.id, serverId]]))
      }
    } catch {
      signal.throwIfAborted()
    }
  }

  // 用补齐后的会话重新取历史与提问，保证请求里都是 serverId
  const session = getSession(sessionId)
  const resolve = <T extends Message>(message: T): T =>
    (session?.messages.find((m) => m.id === message.id) as T | undefined) ?? message
  return {
    history: request.history.map(resolve),
    question: resolve(request.question),
    prefix: request.prefix,
  }
}

/**
 * 请求并消费流：先补齐附件的 serverId，再发请求；事件合并进回复，按动画帧刷新界面，定期落盘；
 * 结束时按结果收尾。补传失败时回复记为 upload 错误，可重试。
 */
const streamReply = async (sessionId: string, initial: AssistantMessage, request: Request) => {
  // 每次请求的块索引都从 0 开始，续写时需要避开已保存的前缀块。
  const blockOffset = initial.blocks.length
  const controller = new AbortController()
  if (!getSession(sessionId)?.title) {
    titleRequests.add(controller)
  }
  set((state) => ({ streaming: { ...state.streaming, [sessionId]: controller } }))
  let reply = initial
  let frame = 0
  let savedAt = Date.now()
  const flush = () => {
    frame = 0
    updateReply(sessionId, reply)
    if (Date.now() - savedAt > SAVE_INTERVAL) {
      savedAt = Date.now()
      persist(sessionId)
    }
  }
  /** 附件补齐前出错属于上传失败，请求还没有发出 */
  let preparing = true
  try {
    const prepared = await prepareFiles(sessionId, request, controller.signal)
    preparing = false
    // 附件就绪后获取本轮信息；续写沿用原回答快照，重新生成的快照独立保存。
    const latestReminder = prepared.prefix
      ? prepared.prefix.latestReminder
      : createLatestReminder(useSettings.getState())
    reply = { ...reply, latestReminder }
    updateReply(sessionId, reply)
    persist(sessionId)
    const messages = toRequestMessages(
      prepared.history,
      prepared.question,
      prepared.prefix,
      initial.thinking ?? false,
      latestReminder
    )
    const events = streamMessage(
      useSettings.getState().apiKey ?? '',
      {
        model: initial.model ?? MODEL,
        system: SYSTEM_PROMPT,
        messages,
        thinking: { type: initial.thinking ? 'enabled' : 'disabled' },
        safety_check: SAFETY_CHECK,
        tools: serverTools(initial.search ?? false),
        ...(titleRequests.has(controller) ? { title: { enabled: true } } : {}),
      },
      controller.signal
    )
    for await (const event of events) {
      if (
        event.type === 'message_delta' &&
        (event.delta.stop_reason === 'end_turn' || event.delta.stop_reason === 'max_tokens') &&
        event.delta.title?.trim() &&
        titleRequests.has(controller) &&
        !controller.signal.aborted &&
        !get().importingHistory
      ) {
        const title = event.delta.title.trim()
        updateSession(sessionId, (session) => (session.title ? session : { ...session, title }))
        titleRequests.delete(controller)
      }
      reply = applyEvent(reply, event, Date.now(), blockOffset)
      frame ||= requestAnimationFrame(flush)
    }
    reply = settleReply(reply, 'done', Date.now())
  } catch (error) {
    if (controller.signal.aborted) {
      reply = settleReply(reply, 'stopped', Date.now())
    } else if (preparing) {
      const message = describeUploadError(error)
      reply = settleReply(reply, 'error', Date.now(), {
        kind: 'upload',
        message: typeof message === 'string' ? message : '',
        localMessage: typeof message === 'string' ? undefined : message,
        retryable: isRetryableApiError(error),
      })
    } else if (error instanceof ApiError && error.kind === 'interrupted' && reply.stopReason) {
      // 已收到 message_delta 的结束原因，只是缺了结尾的 message_stop
      reply = settleReply(reply, 'done', Date.now())
    } else if (error instanceof ApiError) {
      reply = settleReply(reply, 'error', Date.now(), {
        kind: error.kind,
        message: error.message,
        status: error.status,
        localMessage: error.localMessage,
      })
    } else {
      reply = settleReply(reply, 'error', Date.now(), {
        kind: 'protocol',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    titleRequests.delete(controller)
    cancelAnimationFrame(frame)
    updateReply(sessionId, reply)
    set((state) => ({
      streaming: Object.fromEntries(
        Object.entries(state.streaming).filter(([id]) => id !== sessionId)
      ),
    }))
    persist(sessionId)
  }
}
