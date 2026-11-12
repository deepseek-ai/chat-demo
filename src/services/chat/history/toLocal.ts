import type {
  ServerToolUseBlock,
  WebFetchResult,
  WebFetchToolResultBlock,
} from '../../api/types.js'
import type {
  AssistantMessage,
  FileAttachment,
  Message,
  ReplyBlock,
  ReplyStatus,
  Session,
  UserMessage,
} from '../types.js'
import { fail } from './errors.js'
import type { ChatMessage, Fragment, SessionFile } from './format.js'
import { sessionFilesDir } from './paths.js'

export type LocalSession = {
  session: Session
  /** 本会话目录下应存在的图片：ZIP 条目名 → 文件 ID */
  images: Map<string, string>
}

const time = (value: string) => Date.parse(value)

/** 链接会渲染成 href，只接受 HTTP / HTTPS。 */
const isWebUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const toFile = (file: { id: string; file_name: string; file_size: number }): FileAttachment => ({
  id: file.id,
  serverId: null,
  name: file.file_name,
  size: file.file_size,
  // 原件随后从 ZIP 读取后识别。
  mimeType: '',
})

const toUser = (message: ChatMessage, imported: UserMessage['imported']): UserMessage => ({
  id: String(message.id),
  role: 'user',
  createdAt: time(message.inserted_at),
  content: message.fragments.map((item) => (item.type === 'REQUEST' ? item.content : '')).join(''),
  files: message.fragments.flatMap((item) => (item.type === 'FILE' ? item.files.map(toFile) : [])),
  imported,
})

/** 此处转换的工具块只用于展示，ID 只需在回复内唯一；READ_LINK 在构造请求时从原文签名重建。 */
const toolBlocks = (
  id: string,
  input: ServerToolUseBlock['input'],
  kind: ServerToolUseBlock['kind'],
  result?: ReplyBlock
): ReplyBlock[] => [
  {
    type: 'server_tool_use',
    id,
    name: kind === 'read_link' ? 'deepseek_read_url' : 'deepseek_web_search',
    input,
    kind,
    caller: { type: 'direct' },
  },
  ...(result ? [result] : []),
]

const fetchResult = (
  toolUseId: string,
  content: WebFetchToolResultBlock['content']
): WebFetchToolResultBlock => ({
  type: 'web_fetch_tool_result',
  tool_use_id: toolUseId,
  kind: 'deep_search',
  content,
})

const fetched = (
  url: string,
  title: string | null,
  publishedAt: string | null
): WebFetchResult => ({
  type: 'web_fetch_result',
  url,
  content: {
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: '' },
    title,
  },
  published_at: publishedAt,
})

const unavailable: WebFetchToolResultBlock['content'] = {
  type: 'web_fetch_tool_result_error',
  error_code: 'unavailable',
}

/**
 * 片段转换为本地展示块：
 * - 普通搜索与边想边搜共用 TOOL_SEARCH，以同一回复是否有打开 / 查找网页来区分；
 * - READ_LINK 用明文 URL / 标题展示，旧版只有签名的结果不展示；请求时从原文恢复签名；
 * - 没有链接的 TOOL_OPEN 不展示；
 * - 没有对应展示的片段记为不支持，回复下方提示部分内容无法展示。
 */
const toBlocks = (fragments: Fragment[]): ReplyBlock[] => {
  const searchKind = fragments.some(
    (item) => item.type === 'TOOL_OPEN' || item.type === 'TOOL_FIND'
  )
    ? 'deep_search'
    : 'search'
  return fragments.flatMap((item, index): ReplyBlock[] => {
    const id = `imported-${index}`
    switch (item.type) {
      case 'RESPONSE':
      case 'TEMPLATE_RESPONSE':
        return [{ type: 'text', text: item.content }]
      case 'THINK':
        return [{ type: 'thinking', thinking: item.content }]
      case 'TOOL_SEARCH':
        return toolBlocks(
          id,
          { action: 'search', query: item.queries[0] ?? '', queries: item.queries },
          searchKind,
          item.status === 'WIP'
            ? undefined
            : {
                type: 'web_search_tool_result',
                tool_use_id: id,
                kind: searchKind,
                content:
                  item.status === 'FAILED'
                    ? [{ type: 'web_search_tool_result_error', error_code: 'unavailable' }]
                    : item.results
                        .filter((result) => isWebUrl(result.url))
                        .map((result) => ({
                          type: 'web_search_result',
                          url: result.url,
                          title: result.title,
                          snippet: result.snippet,
                          site_icon:
                            result.site_icon && isWebUrl(result.site_icon)
                              ? result.site_icon
                              : null,
                          site_name: result.site_name,
                          page_age: result.published_at,
                          encrypted_content: '',
                        })),
              }
        )
      case 'TOOL_OPEN':
        if (!item.url || !isWebUrl(item.url)) {
          return []
        }
        return toolBlocks(
          id,
          { action: 'open_page', url: item.url },
          'deep_search',
          item.status === 'WIP'
            ? undefined
            : fetchResult(
                id,
                item.status === 'FINISHED'
                  ? fetched(item.url, item.title, item.published_at)
                  : unavailable
              )
        )
      case 'TOOL_FIND':
        return toolBlocks(
          id,
          { action: 'find_in_page', url: '', pattern: item.pattern ?? '' },
          'deep_search',
          item.status === 'WIP'
            ? undefined
            : fetchResult(id, item.status === 'FINISHED' ? fetched('', null, null) : unavailable)
        )
      case 'READ_LINK':
        return item.results.flatMap((result, resultIndex) => {
          if (!result.url || !isWebUrl(result.url)) {
            return []
          }
          const toolId = `${id}-${resultIndex}`
          return toolBlocks(toolId, { action: 'read_link', url: result.url }, 'read_link', {
            type: 'web_fetch_tool_result',
            tool_use_id: toolId,
            kind: 'read_link',
            content: fetched(result.url, result.title ?? null, null),
            signature: result.signature,
          })
        })
      default:
        return [{ type: 'unsupported', blockType: item.type }]
    }
  })
}

/** 服务端结束的回复（含失败、超长）按已完成展示原有内容；中断的按已停止。 */
const replyStatus: Record<ChatMessage['status'], ReplyStatus> = {
  FINISHED: 'done',
  CONTENT_FILTER: 'done',
  FAILED: 'done',
  CONTEXT_LENGTH_EXCEEDED: 'done',
  INCOMPLETE: 'stopped',
  TIMEOUT: 'stopped',
  WIP: 'stopped',
}

const toAssistant = (
  message: ChatMessage,
  imported: AssistantMessage['imported']
): AssistantMessage => {
  const blocks = toBlocks(message.fragments)
  const refused = message.status === 'CONTENT_FILTER'
  return {
    id: String(message.id),
    role: 'assistant',
    createdAt: time(message.inserted_at),
    model: null,
    imported,
    status: replyStatus[message.status],
    // 被过滤的回复按拒绝处理：不展示正文和思考，只保留工具步骤。
    ...(refused ? { stopReason: 'refusal' as const } : {}),
    blocks: refused
      ? blocks.filter((block) => block.type !== 'text' && block.type !== 'thinking')
      : blocks,
  }
}

/**
 * 按 id 排序还原消息树：父消息的 id 必须更小、角色交替、根为提问。
 * current_message_id 到根的路径为当前分支；其余节点默认选中 id 最大的子消息。
 */
const buildTree = (file: SessionFile): Pick<Session, 'messages' | 'rootMessageId'> => {
  const sorted = file.messages.toSorted((a, b) => a.id - b.id)
  const byId = new Map<number, Message>()
  const messages = sorted.map((message) => {
    const { id, parent_id, ...imported } = message
    const parent = parent_id === null ? undefined : byId.get(parent_id)
    if (
      byId.has(id) ||
      (parent_id === null ? message.role !== 'USER' : !parent) ||
      (parent && parent.role === (message.role === 'USER' ? 'user' : 'assistant'))
    ) {
      fail('backupInvalidBranches')
    }
    const local =
      message.role === 'USER' ? toUser(message, imported) : toAssistant(message, imported)
    local.parentId = parent ? parent.id : null
    if (parent) {
      parent.selectedChildId = local.id
    }
    byId.set(id, local)
    return local
  })
  if (messages.length === 0) {
    return { messages, rootMessageId: null }
  }
  let current = byId.get(file.current_message_id) ?? fail('backupInvalidBranches')
  // 当前消息就是用户停留的位置，后面即使还有消息也不继续展开。
  current.selectedChildId = undefined
  while (current.parentId) {
    const parent = byId.get(Number(current.parentId)) ?? fail('backupInvalidBranches')
    parent.selectedChildId = current.id
    current = parent
  }
  return { messages, rootMessageId: current.id }
}

/** 转换单个会话，并列出本会话目录下需要从 ZIP 读取的图片。 */
export const toLocalSession = (file: SessionFile): LocalSession => {
  const session: Session = {
    id: file.id,
    // 空标题按「新对话」显示，导出时还原为 null。
    title: file.title ?? '',
    createdAt: time(file.inserted_at),
    updatedAt: time(file.updated_at),
    pinned: file.pinned,
    ...buildTree(file),
  }
  const images = new Map<string, string>()
  for (const message of file.messages) {
    for (const item of message.fragments) {
      if (item.type !== 'FILE') {
        continue
      }
      for (const entry of item.files) {
        // 读取端把条目名规范为 NFC，引用也按同样规则比较。
        const path = entry.export_path?.normalize('NFC')
        if (path === undefined) {
          continue
        }
        // 图片只能在本会话目录下，同一条目不能对应不同文件。
        if (
          !path.startsWith(sessionFilesDir(file.id)) ||
          (images.get(path) ?? entry.id) !== entry.id
        ) {
          fail('backupInvalidFiles')
        }
        images.set(path, entry.id)
      }
    }
  }
  return { session, images }
}
