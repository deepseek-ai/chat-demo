/**
 * 历史会话导出产物（deepseek_data-*.zip）的类型定义。
 *
 * - 时间均为 UTC ISO-8601、Z 结尾、固定 3 位毫秒；
 * - 消息树的排序与引用只用 id，不用 inserted_at；
 * - 可空字段用 null 表示；可选扩展另行标注。
 */

/** 2026-11-11T02:33:23.270Z */
export type Iso8601Utc = string

export const EXPORT_FORMAT_VERSION = 3

/** manifest.json，ZIP 的第一个条目 */
export type Manifest = { export_format_version: typeof EXPORT_FORMAT_VERSION }

/** chat_session_index.json 的一项，只列出成功写出的会话；整个文件是 ZIP 的最后一个条目 */
export type SessionIndexEntry = {
  id: string
  title: string | null
  pinned: boolean
  message_count: number
  inserted_at: Iso8601Utc
  updated_at: Iso8601Utc
}

/** chat_sessions/{session_id}.json */
export type SessionFile = {
  id: string
  title: string | null
  pinned: boolean
  /** 用户当前停留的消息，线性化消息树的唯一依据 */
  current_message_id: number
  inserted_at: Iso8601Utc
  updated_at: Iso8601Utc
  /** 消息树，分支靠 parent_id */
  messages: ChatMessage[]
}

export type ChatRole = 'USER' | 'ASSISTANT'

export type ChatMessageStatus =
  | 'WIP'
  | 'FINISHED'
  | 'CONTENT_FILTER'
  | 'FAILED'
  | 'INCOMPLETE'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'TIMEOUT'

export type ChatMessage = {
  /** 会话内自增 */
  id: number
  /** null 表示该会话的第一条 */
  parent_id: number | null
  role: ChatRole
  status: ChatMessageStatus
  thinking_enabled: boolean
  search_enabled: boolean
  /** 沿分支累计的上下文 token，不是本条用量 */
  accumulated_token_usage: number
  inserted_at: Iso8601Utc
  /** 按发生顺序排列 */
  fragments: Fragment[]
}

/** 用户的提问 */
export type RequestFragment = { type: 'REQUEST'; content: string }

/** 模型的回答，引用标记已剥除 */
export type ResponseFragment = { type: 'RESPONSE'; content: string }

export type ThinkFragment = {
  type: 'THINK'
  content: string
  /** 思考耗时（秒） */
  elapsed_secs: number | null
}

/** 服务端模板（过载、内容过滤、超长等），不能当正常回答放进上下文 */
export type TemplateResponseFragment = { type: 'TEMPLATE_RESPONSE'; content: string }

export type TipStyle = 'INFO' | 'WARNING' | 'CAUTION'

/** 文案是导出时的兜底 locale（en），未必是用户当时的界面语言 */
export type TipFragment = { type: 'TIP'; content: string; style: TipStyle }

/** 内容风险提示条；不是拒答，不改变回答内容 */
export type ContentRiskFragment = { type: 'CONTENT_RISK'; content: string; style: TipStyle }

export type PartialFileReadFragment = {
  type: 'PARTIAL_FILE_READ'
  /** 截断后占原文的百分比，0–100 */
  ratio: number
}

export type SearchResult = {
  url: string
  title: string
  snippet: string
  published_at: Iso8601Utc | null
  site_name: string | null
  /** 可选扩展：站点图标；没有此字段的 v3 产物仍可导入。 */
  site_icon?: string | null
}

/** 普通搜索与边想边搜共用，没有字段区分两者；已过滤隐藏结果 */
export type ToolSearchFragment = {
  type: 'TOOL_SEARCH'
  queries: string[]
  results: SearchResult[]
}

export type ToolOpenStatus = 'WIP' | 'FINISHED' | 'FAILED'

/** 边想边搜里打开的页面；三个可选字段同时为 null 时只有动作、没有内容 */
export type ToolOpenFragment = {
  type: 'TOOL_OPEN'
  status: ToolOpenStatus
  url: string | null
  title: string | null
  published_at: Iso8601Utc | null
}

export type ToolFindStatus = 'WIP' | 'FINISHED' | 'NO_RESULT' | 'FAILED'

/** 页面内查找，不导出查找词 */
export type ToolFindFragment = { type: 'TOOL_FIND'; status: ToolFindStatus }

/** 阅读链接结果：正文只有 deepseek-api 的密钥才能解密 */
export type ReadLinkFragment = { type: 'READ_LINK'; results: { signature: string }[] }

export type FileEntry = {
  /** 不带 file- 前缀的 UUID */
  id: string
  /** 用户上传时的文件名 */
  file_name: string
  file_size: number
  token_usage: number | null
  inserted_at: Iso8601Utc
  /** 图片导出成功时为 ZIP 条目名，否则为 null；条目也可能不存在 */
  export_path: string | null
  is_image: boolean
  width: number | null
  height: number | null
}

/** 非图片文件只有元数据，本体不在产物里 */
export type FileFragment = { type: 'FILE'; files: FileEntry[] }

export type ImageSearchStatus = 'WIP' | 'FINISHED' | 'FAILED'

export type ImageSearchResult = {
  title: string
  source_page_url: string
  snippet: string
  site_name: string | null
  published_at: Iso8601Utc | null
}

/** 图搜：image_indexes 指向本次提问里用户上传的第几张图，结果不含图片本身 */
export type ToolImageSearchFragment = {
  type: 'TOOL_IMAGE_SEARCH'
  status: ImageSearchStatus
  image_indexes: number[]
  results: ImageSearchResult[]
}

export type Fragment =
  | RequestFragment
  | ResponseFragment
  | ThinkFragment
  | TemplateResponseFragment
  | TipFragment
  | ContentRiskFragment
  | PartialFileReadFragment
  | ToolSearchFragment
  | ToolOpenFragment
  | ToolFindFragment
  | ReadLinkFragment
  | FileFragment
  | ToolImageSearchFragment
