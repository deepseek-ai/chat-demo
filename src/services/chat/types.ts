import type { TranslationMessage } from '../../i18n/index.js'
import type { ApiErrorKind } from '../api/client.js'
import type {
  ChatModel,
  MessageUsage,
  ServerToolBlock,
  StopDetails,
  StopReason,
  TextCitation,
} from '../api/types.js'
import type { ChatMessage } from './history/format.js'

/**
 * 消息附件。id 是本地标识（IndexedDB files 表的主键，原件按它存储，所有引用同一 id 的消息共用一份），
 * 导入的附件沿用导出产物里的文件 ID；本地没有原件的附件只展示文件名，不进入请求。
 * serverId 是 Files API 返回的 file_id，导入的数据或尚未上传成功的文件为 null，发送前补传。
 */
export type FileAttachment = {
  id: string
  serverId: string | null
  name: string
  size: number
  /** 由原件识别；导入时没有原件或无法识别的为空字符串 */
  mimeType: string
}

/**
 * 从历史导出 ZIP 导入的原始消息（已按格式校验，去掉随导出重新编号的 id / parent_id）。
 * 导入的消息不可修改：导出时原样写回，界面使用转换出的本地字段；请求还读取原文中的 READ_LINK 签名。
 */
export type ImportedMessage = Omit<ChatMessage, 'id' | 'parent_id'>

/** 本地消息的分支关系；字段缺省时按线性消息列表处理。 */
type MessageBranch = {
  parentId?: string | null
  /** 当前选中的下一条消息；切换版本时保留每条分支原有的选择。 */
  selectedChildId?: string
}

export type UserMessage = MessageBranch & {
  id: string
  role: 'user'
  content: string
  files: FileAttachment[]
  createdAt: number
  imported?: ImportedMessage
}

/** 思考块：thinking_delta 累积，签名随 signature_delta 到达；历史轮次的思考服务端会丢弃，不回传 */
export type ThinkingPart = {
  type: 'thinking'
  thinking: string
  signature?: string
  /** content_block_start 的时间；导入回复中缺省 */
  startedAt?: number
  /** content_block_stop（或回复结束）的时间 */
  endedAt?: number
}

/** 文本块：text_delta 累积，citations_delta 追加引用 */
export type TextPart = { type: 'text'; text: string; citations?: TextCitation[] }

/** 未识别块（如客户端工具调用）的占位，保留流中的 index */
export type UnsupportedPart = { type: 'unsupported'; blockType: string }

/** 服务端工具调用与结果块按协议原样保存；历史请求只回传 read_link 调用与结果 */
export type ReplyBlock = ThinkingPart | TextPart | ServerToolBlock | UnsupportedPart

/**
 * pending：已发出请求，还没收到事件；streaming：正在接收；
 * done：收到 message_stop；stopped：用户停止或页面关闭；error：请求或流出错
 */
export type ReplyStatus = 'pending' | 'streaming' | 'done' | 'stopped' | 'error'

export type AssistantMessage = MessageBranch & {
  id: string
  role: 'assistant'
  createdAt: number
  /** 导入的回复为 null */
  model: ChatModel | null
  /**
   * 导入的回复不能续写；FINISHED / INCOMPLETE、不含 TEMPLATE_RESPONSE 且有正文时进入上下文。
   * 请求回传正文，并从原文 READ_LINK 签名重建阅读链接块；转换出的思考与其他工具块仅用于展示。
   */
  imported?: ImportedMessage
  /** 请求时是否开启深度思考；导入的回复不记录 */
  thinking?: boolean
  /** 请求时是否声明 deepseek_web_search；关闭时仍声明 deepseek_read_url；导入的回复不记录 */
  search?: boolean
  /** 本轮请求的系统信息快照；各回答版本独立保存，续写沿用。历史消息中缺省的快照保持为空。 */
  latestReminder?: string
  status: ReplyStatus
  /** 每次流内按 index 排列；续写产生的块追加在已有块之后 */
  blocks: ReplyBlock[]
  stopReason?: StopReason
  stopDetails?: StopDetails
  /** 最近一次请求的用量，续写后更新 */
  usage?: MessageUsage
  error?: {
    /** upload：发送前补传附件失败，请求没有发出 */
    kind: ApiErrorKind | 'upload'
    message: string
    status?: number
    localMessage?: TranslationMessage
    /** 仅 upload：重新上传是否可能成功（网络、限流、服务端繁忙）；过大、格式不支持为 false */
    retryable?: boolean
  }
}

export type Message = UserMessage | AssistantMessage

export type Session = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** 包含所有分支的消息，按创建顺序存储。 */
  messages: Message[]
  /** undefined 表示线性消息列表；null 表示空会话。 */
  rootMessageId?: string | null
  /** 导入的置顶状态，供再次导出使用 */
  pinned?: boolean
}
