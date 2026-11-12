# DeepSeek Chat 独立版

一个只依赖 DeepSeek 公开 API 的静态聊天应用：构建产物是 `index.html` + JS + CSS，双击用 `file://` 打开即可使用。不进 rush，自带 `package.json` 与 lockfile。

## 使用

```bash
git clone https://github.com/deepseek-ai/deepseek-chat-demo.git
cd deepseek-chat-demo
pnpm install
pnpm build          # 产物在 dist/
open dist/index.html
```

首次打开会弹出「设置」，输入 [API Key](https://platform.deepseek.com/api_keys) 并校验通过后即可对话，之后在侧边栏底部「设置」中修改。Key、会话、文件都只存在本机浏览器里，请求直接发往 `https://api.deepseek.com`。

| 命令                      | 说明                             |
| ------------------------- | -------------------------------- |
| `pnpm dev`                | 开发服务器 http://localhost:8090 |
| `pnpm build`              | 生产构建到 `dist/`               |
| `pnpm type` / `pnpm lint` | 类型检查 / oxlint                |
| `pnpm format`             | oxfmt 格式化                     |

`rspack.config.ts` 导出 `createConfig({ apiOrigin, devServer })`：本地调试时可在不入库的配置文件里调用它，把接口改为经开发服务器代理。

## 功能

- 多会话：新建、切换、AI 自动生成标题、重命名、删除；侧边栏按「今天 / 昨天 / 7 天内 / 30 天内 / 月份」分组。
- 对话：流式回答、深度思考（展示思维链与用时）、停止生成、继续生成、重新生成、编辑已发送消息、复制。重新生成和编辑不限次数，保留各版本及其后续对话，可切换查看与继续提问。
- 智能搜索：普通搜索、边想边搜（同时开启深度思考）；消息里的链接不论是否打开智能搜索都会阅读；回答带引用角标，可查看带明文摘要、站点名和图标的搜索结果。
- 文件：点击、粘贴或拖拽到页面上传，经 Files API 上传后按 `file_id` 引用；输入框里图片显示缩略图，其余显示文件卡片（图标、文件名、格式与大小、上传中 / 失败重试）。上传前按扩展名白名单过滤，清单照抄线上 chat 下发的 `support_file_exts`（985 项，见 `services/uploadExts.ts`），不在清单内的文件直接提示并不加入输入框。清单内的文件是否真能上传由 Files API 决定：它目前只接受 webp / png / jpeg / gif，其它格式（如 PDF）会显示接口返回的失败原因。Chat Engine 已支持图片，非图片的 `document` 块仍会返回 400。
- 语音输入：点击麦克风开始录音，再次点击结束并转写，结果插入输入框光标处；转写中点击可取消，录满 120 秒自动结束。
- 朗读：回复操作栏的朗读按钮，同时只读一条；发送、停止生成、重新生成、继续生成、编辑、切换会话时停止。
- Markdown：与主站同一套渲染（代码高亮、KaTeX 公式、表格），支持 Mermaid 图表与源码切换；去掉了流式淡入与部分流式优化，代码高亮只保留常用语言，也未引入主站的 Markdown 解析补丁，个别写法显示不同，见[精简的 Markdown 渲染](#精简的-markdown-渲染)与[未引入的 Markdown 补丁](#未引入的-markdown-补丁)。
- 设置：分为「通用设置」（主题、中英文切换、位置信息）与「数据管理」（API Key、导入 / 导出历史对话）；API Key 保存后只显示掩码，点编辑按钮重新输入。位置信息与 latest reminder 的行为见下文。
- 主题支持浅色、深色与跟随系统，默认跟随系统。
- 移动端（窄于 768px，与主站断点一致）：顶栏菜单打开侧边栏抽屉，会话页顶栏显示标题与开启新对话；附件使用完整消息列宽度换行，窄于 440px 时放宽用户气泡并缩短输入框最低高度，输入工具栏空间不足时自动收起开关文字、保留图标；欢迎页输入框吸底；设置改为底部弹层，输入 API Key 时在下方显示整行「确定」。

界面基于设计稿 [Web-Design「chat product api」](https://www.figma.com/design/3Kc1px1P9lga9yq0t1hdPf/Web-Design?node-id=46380-67609&m=dev)：不显示品牌 Logo 或底部署名，侧边栏顶部原 Logo 位置、页面标题与输入框使用「API 使用 demo」；桌面端与移动端分别对应设计稿中的两组画面。

## 实现

### 多语言

仅支持简体中文与英文。首次打开按浏览器语言选择：中文使用简体中文，其余使用英文；在设置中切换后保存到 localStorage，刷新后保留。切换即时更新界面文案与页面 `lang`，不修改用户输入、已有会话标题或模型回复。

中英文词典位于 `src/i18n/zh.ts` 与 `src/i18n/en.ts`，随静态产物打包，支持 `file://`。组件通过 `useTranslate()` 订阅语言，普通函数使用 `translate()`；动态文案用 `{count}` 等命名占位符。

### 位置信息与 latest reminder

位置设置与 latest reminder 始终启用，具体行为如下。

位置选择方式按浏览器 `navigator.language` 是否以 `zh` 开头决定，与手动切换的界面语言独立。省市联动，切换省份时清空城市；仅选省份也有效，没有城市列表的地区只选择省份 / 地区。非中文浏览器选择国家，国家名随界面语言显示；港澳台使用「中国台湾 / 中国香港 / 中国澳门」（英文对应 `Taiwan, China` / `Hong Kong, China` / `Macao, China`），不使用浏览器区域的默认简称。位置存 localStorage，不自动定位。重新打开时按浏览器模式恢复：中文模式只恢复有效的国内省市选择，其余留空；非中文模式只恢复国家。

按[模型规范](https://trtgsjkv6r.feishu.cn/wiki/RBUKwdnzdiMGynk5M2ucE8X2npd)，在对应用户消息前插入独立的 `{role: 'latest_reminder', content: '日期,星期,位置,Web,语言'}`，例如 `2026-11-11,星期三,杭州市,Web,中文`。需要 Chat Engine 的 Anthropic 入口支持 `latest_reminder` 角色；Messages 扩展接口文档 revision 209 尚未定义该角色。

- 日期与星期取请求时浏览器本地时区，星期、地名及语言名称取当前界面语言（语言名与其他界面文案一样走 `t`）。中文国内位置优先城市，再退到省份或中国；英文界面的国内位置仅传 `China`，海外位置只传国家。未选择位置时保留空字段，例如 `2026-11-11,星期三,,Web,中文`。
- 新提问、编辑、重新生成及上传重试在附件就绪后生成快照，随对应回答版本存入 IndexedDB。沿当前分支恢复历史快照，首次出现或信息变化时才在 user 前插入；相同信息不会每轮重复插入，其他分支与未进入上下文的轮次不参与比较。
- 续写沿用原回答快照，保持 assistant 前缀仍在请求末尾。旧版或导入的历史没有快照时不倒填，旧版未完成回复续写也不新增快照。
- reminder 不进入用户正文、回答正文或复制内容。现有历史 ZIP 格式不保存该快照，导出再导入后按没有快照的历史处理；位置设置也不随历史导入导出。

### 会话标题

与原版 Chat 一样，新建会话的标题为空；侧边栏、桌面和移动端标题栏在标题为空时显示「新对话」或「New chat」，随界面语言切换。兜底文案只用于展示，不写入会话；已有标题及导入的标题原样保留，不使用首条提问或文件名补标题。无标题的会话请求带 `title: {enabled: true}`，从 `message_delta.delta.title` 接收 AI 标题并保存到本地；仅接受 `end_turn` / `max_tokens` 返回的非空标题。已有标题不再申请生成，生成期间手动重命名（包括清空）不会被本轮 AI 标题覆盖；停止、删除会话或导入替换后忽略迟到的标题。服务端未返回标题时保留空标题，下次对话可再次申请。

### 协议

只用 [Messages API](https://api-docs.deepseek.com/zh-cn/api/create-message)（Anthropic 兼容格式）：`POST /anthropic/v1/messages`，`x-api-key` 鉴权，固定 `model: deepseek-flash`、`stream: true`，深度思考开关对应 `thinking.type`，始终声明 `deepseek_read_url`，智能搜索开启时再声明 `deepseek_web_search`。文件经 `POST /anthropic/v1/files` 上传，消息里图片用 `{type: 'image', source: {type: 'file', file_id}}`、其余用 `document` 块引用，此时请求带 `anthropic-beta: files-api-2025-04-14`。API Key 用 `GET /models` 校验。

所有生成请求的顶层 `system` 固定为 `该助手为DeepSeek，由深度求索公司创造。`，包括新提问、编辑、重新生成、继续生成和附件上传重试。

流式响应按协议本身分三层处理：

| 层   | 文件                         | 输入 → 输出                                                                                                                                                                          |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE  | `src/services/api/sse.ts`    | 字节流 → 事件。按 WHATWG 规范：UTF-8 流式解码、CR / LF / CRLF 切行、`event` / `data` 字段、空行派发、忽略 `: keep-alive` 注释                                                        |
| 接口 | `src/services/api/client.ts` | 事件 → `MessageStreamEvent`。跳过 `ping`，`message_stop` 结束；非 2xx 与流内无名 `error` 帧转为 `ApiError`；没收到 `message_stop` 就断开记为中断                                     |
| 回复 | `src/services/chat/reply.ts` | 事件 → 回复。按 `index` 建立内容块，`thinking_delta` / `signature_delta` / `text_delta` / `citations_delta` 追加到对应块，工具块原样保存；记录思考块起止时间、`stop_reason`、`usage` |

回复就是一组内容块（思考块、文本块、工具块），`src/services/chat/view.ts` 由它推导出界面结构：思考与工具步骤的时间线、带引用角标的正文、来源列表。回复状态：`pending`（已请求）→ `streaming`（收到事件）→ `done`（`message_stop`）/ `stopped` / `error`。界面每个动画帧刷新一次，流式过程中每 2 秒落盘一次。

上下文：API 无状态，每轮仅沿当前选中的消息分支，把「提问 + 有回答的回复」成对拼进 `messages`；失败、没有回答或被安全拒绝的轮次跳过。新请求和继续生成都按以下规则处理历史 assistant，只保留正文及阅读链接相关块（`src/services/chat/reply.ts` 的 `toAssistantParam`）；继续生成的末尾回答单独处理，见下文：

| 块                       | 回传                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `thinking`               | 不回传，包含思考正文及其 `signature`                                                    |
| `text`                   | 去掉 `citations`；相邻文本直接拼接，被思考或工具隔开的正文保留空行分隔                   |
| `server_tool_use`        | 仅 `kind: 'read_link'` 回传 `id`、`name`、`input`（含 URL）、`kind`；其他调用不回传       |
| `web_search_tool_result` | 不回传，包括搜索和深度搜索的结果                                                        |
| `web_fetch_tool_result`  | 仅 `kind: 'read_link'` 原样回传完整 `content`（含 URL）及 `signature`；服务端解密页面后拼回该轮提问末尾，`deep_search` 不回传 |

导入的回复为 `FINISHED` 或 `INCOMPLETE`、不含 `TEMPLATE_RESPONSE` 且有正文时进入上下文。`INCOMPLETE` 保留原状态和片段，可参与后续新提问，但不支持继续生成。除正文外，请求时从保留的 `READ_LINK` 原文提取非空 `signature`，生成配对的阅读链接调用与结果块并原样回传签名，由服务端解密恢复网页上下文；无法解密时服务端忽略。已导入的记录无需重新导入，其他导入思考与工具块不回传，导入回复仍不能续写。当前导出格式的 `READ_LINK` 只有签名，尚不能展示网页信息；URL 等展示字段待导出侧补齐后接入。

### 重新生成与编辑

两种操作都调用同一个 Messages 端点，不依赖专用编辑或重新生成接口。重新生成只发送目标回答之前的历史和原提问；编辑只发送目标提问之前的历史和修改后的提问。旧回答和其后的对话不进入新请求，末尾为本轮提问。

会话在本地保存消息树：`parentId` 连接父节点，`selectedChildId` 记录选中的子分支，`rootMessageId` 记录选中的首条提问。重新生成新增同一提问下的回答分支；编辑新增与原提问同级的提问及回答。旧分支及其后续对话保留，切回后可继续提问。所有版本共享已有的历史节点，不复制整段上下文，也不设置次数配额；生成中的操作仍按同一会话一次请求处理。

### 继续生成

沿用主站交互：当前分支最后一条回答因停止、长度上限或连接中断而未完成时，在操作栏右侧显示小号描边的「继续生成」按钮。续写复用原消息，保留已有内容、引用和滚动位置；生成时隐藏按钮，仍可停止。

续写产生的连续思考块在界面中接着同一个圆点项显示，Markdown 直接衔接；遇到正文或工具块时分段，导入历史保留原片段分组。思考用时累加各块实际生成时长，不计停止后的等待时间；原始内容块与签名分别保留。

思考停止后保留思考区域的「已停止」标题，不额外显示「已停止生成」。停止后的操作栏显示复制按钮；与主站一致，只复制回答正文，没有正文时复制内容为空，不包含思考过程。

本轮回答只要含 `server_tool_use`、`web_search_tool_result` 或 `web_fetch_tool_result`（包括孤立结果块），无论停止、长度上限还是中断，都不显示「继续生成」，也不能续写；READ_LINK 与其他工具统一判断，不作例外。导入的回答一律不能续写。

向同一个 Messages 端点发送历史和本轮问题，末尾附上原回答的非空白正文与思考即触发继续生成，无需 `prefix` 字段，也不新增「继续」用户消息。仅在开启思考时回传最后一条待续写回答的非空白 `thinking` 及其 `signature`，更早回答的思考及签名不回传；续写响应按新增内容处理，块索引从 0 重新开始，前端将其追加到已有块之后。模型和思考、搜索设置沿用原回答，`usage` 记录最近一次请求的用量。

尚未收到内容、只有空白或关闭思考时仅有思考内容，直接重发原问题；续写失败保留已收到的内容，可再次继续。刷新后未完成回答记为已停止，满足上述条件时可手动继续，不恢复旧连接。

协议依据：[Messages 扩展接口定义](https://trtgsjkv6r.feishu.cn/docx/L455dt1X2oRu1cxdhJZcOtPWnje)（2026-11-11，revision 209）。

### 智能搜索与引用

搜索成功条目 `web_search_tool_result.content[]` 的 `snippet`（string）、`site_icon`（string | null）、`site_name`（string | null）分别用于明文摘要、站点图标和站点名，列表、引用卡片及缩略图共用这些元数据。`encrypted_content` 不用于展示。同一 URL 多次出现时保留原编号并补齐缺失信息；空站点名回退到域名，空摘要省略，空图标或加载失败显示链接图标。

所有请求都由 Chat Engine 处理：Chat Engine 是对 Messages API 的扩展，请求固定带 `safety_check: {level: "high"}`，并始终声明 `{type: "deepseek_read_url", name: "deepseek_read_url"}`。「智能搜索」开启时增加 `{type: "deepseek_web_search", name: "deepseek_web_search"}`；关闭时不搜索、不进边想边搜，消息里的链接照常阅读。两个工具均无其他子选项。

服务端按开关与消息内容自动选择能力：开搜索、未开深度思考为普通搜索；开搜索、开深度思考为边想边搜（搜索、打开网页、页内查找）；消息里有链接时阅读链接（同时开着搜索和深度思考时不进边想边搜，改为阅读链接 + 普通搜索）。

- **搜索结果卡片**：显示标题、发布时间（`page_age`）、明文摘要（`snippet`）、站点名（`site_name`）和图标（`site_icon`）。缺失值按上面的回退规则处理，引用卡片复用同一份来源信息。
- **工具块**：调用名称按能力区分：搜索及边想边搜为 `deepseek_web_search`（含打开页面、页内查找），阅读链接为 `deepseek_read_url`。`server_tool_use` 与 `web_search_tool_result` / `web_fetch_tool_result` 原子下发，按 `tool_use_id` 配对；能力取调用块的 `kind`，动作取 `input.action`。普通搜索合并为「已阅读 N 个网页」，边想边搜按连续调用分组为「搜索到 N 个网页」「浏览 N 个页面」「查找关键词」，阅读链接逐个显示标题或失败原因。
- **阅读链接上下文**：成功结果的页面保存在顶层 `signature` 密文中，`content.content.source.data` 恒为空。签名随内容块保存并在后续对话原样回传。
- **引用**：服务端在文本块上挂 `citations`，挂过引用的块之后另起新块。渲染时把正文的文本块拼成一份 markdown，在挂过引用的块尾（块尾空白之前）插入 `[citation:N]`，md 解析后在原位渲染数字角标，悬停预览来源、点击打开网页；不做行尾聚合。N 按搜索结果与打开的网页在回复中出现的顺序编号，与搜索结果列表一致。
- **安全拒绝**：`stop_reason: refusal` 时丢弃已下发的思考与正文，提示「这个问题暂时无法回答」；以 `end_turn` 结束却没有正文时提示服务器繁忙。

### 文件

上传、校验与排队在 `src/services/attachments.ts`，输入框的入口与状态在 `components/chatInput/useAttachments.ts`：

- 添加前按「格式 → 大小 → 数量」校验，任一不满足整批不添加并 toast 提示；格式清单见 `services/uploadExts.ts`，上限 64 MB、50 个。
- 选中即上传，全局最多同时上传 3 个；失败按 HTTP 状态区分文案。网络、限流、服务端繁忙可点击卡片重试；过大、格式不支持等只提示原因，需删除。有失败文件时不能发送。
- 附件的 `id` 只是本地标识（原件与上传任务的 key），Files API 返回的 `file_id` 存在 `serverId`。上传任务按本地 id 登记在 `useUploads` 里，输入框和消息共用同一个任务，不会重复上传。
- 上屏后上传（参照主站 `feat/chat-upload-before-send`）：上传中也可以发送，消息先上屏，缩略图上显示上传中；`streamReply` 在请求前补齐附件的 `serverId`：已有直接用、上传中等待同一任务，没有的读取本地原件补传，成功后写回会话。本轮提问的附件任一失败则不发请求，回答处显示「附件上传失败，消息未发送」，可在缩略图或提示上重试；停止生成立即结束等待。历史轮次（仅进入上下文的）中没有 `serverId` 的附件，多为导入的图片，从最新的消息往前逐张补传，失败静默跳过、不进入本次请求；历史提问因此为空时连同回答一起省略。本地没有原件的附件只展示，不进入请求。
- Files API 没有解析阶段，也就没有解析状态与轮询。

相对主站 `packages/chat-sdk` 的 `uploadFileController` 与 `apps/chat` 的文件组件，裁掉了：

| 裁掉的能力                                                                                  | 原因                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 解析状态机与 `fetch_files` 轮询、`token_usage` 累计与超限提示、审核拦截 / 内容为空等失败态  | Files API 上传即可引用，没有解析阶段           |
| 「仅提取文字」（OCR）文案、识图切换引导、`fork_file_task`、按 `file_feature` 下发上传限制   | 旧模型不支持识图的遗留逻辑，限制改为常量       |
| seed task、发送快照、发送后由 SSE `update_file` 接管状态、编辑回填与重发 fork               | 会话是线性消息列表，不支持编辑与重发           |
| PoW 请求头、上传与解析埋点、超时告警                                                        | 公开 API 不需要                                |
| 多投放目标拖拽与可见性命中检测、长文本自动转 txt、Word 富文本识别、移动端转 webp、HEIC 判断 | 页面只有一个输入框；其余是特定浏览器与边界场景 |
| 文件预览侧栏、上传进度环、loading 最短展示                                                  | 点击在新标签页打开原件；上传中只显示 loading   |

### 语音

接口见「chat api 改造 —— asr tts 接口文档」，都用 `Authorization: Bearer` 鉴权，封装在 `src/services/api/speech.ts`：

- **语音输入**：`POST /v1/tools/asr`，multipart 上传一段音频，一次返回全文。接口只接受 WAV / Ogg Opus，而 `MediaRecorder` 只能产出 webm / mp4，所以 `services/speech/recorder.ts` 用 16kHz 的 `AudioContext` 直接采集 PCM 并编码为单声道 16-bit WAV。采集用 `ScriptProcessorNode` 而不是 `AudioWorklet`：后者要按模块地址加载处理脚本，`file://` 下无法保证可用。
- **朗读**：`POST /v1/tools/tts`（`format: pcm`、`filter_markdown: true`），回复正文原样提交，代码块、表格、引用标记由服务端过滤。返回 24kHz 单声道 16-bit 裸 PCM 流，`services/speech/readAloud.ts` 边收边用 `AudioContext` 按顺序排程播放，首帧到达即出声。按钮动画复制自主站 `TtsReadingBars`。

相对主站的朗读（WebSocket 协议 + `packages/web-tts`），裁掉了票据换取、续流重连与 ack、opus 解码与多档回退、iOS 解锁与挂起监控、预取、调试面板、埋点、远程播放参数、音色选择，以及按模型配置显隐入口。主站没有语音输入，这里按设计稿新增。

### 存储

| 位置                                                                     | 内容                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| IndexedDB `deepseek-chat-standalone` / `sessions`                        | 会话（含全部消息分支及当前选择）                                            |
| IndexedDB `deepseek-chat-standalone` / `files`                           | 文件原件 Blob，按附件本地 id 存，用于缩略图、查看与补传；普通上传与导入共用 |
| IndexedDB `deepseek-chat-standalone` / `sessionsStaging`、`filesStaging` | 历史导入的暂存，导入成功后移入 `sessions` / `files` 并清空                  |
| localStorage `deepseek-chat-standalone:*`                                | API Key、语言、主题、位置、深度思考与智能搜索开关、侧边栏收起               |

文件原件按本地 id 在所有会话间共用一份，删除会话时仅清理已无其他会话引用的本地原件；远端文件不删，同一服务端文件可能被编辑、重新生成后的多条消息引用，demo 不维护引用计数。导入的附件沿用导出产物中的文件 ID 作为本地 id，`serverId` 为空，发送前按本地原件补传并写回。

导入会全量替换本地所有会话和附件，选择文件后需再次确认。只支持历史会话导出格式（`export_format_version: 3`）的 ZIP，确认后先检查格式，不符合直接提示失败；通过后停止生成，按条目顺序逐项解压，只写入暂存存储，原有记录保持不变。每张图片在内存中拼成完整文件后写入并等待落盘，导入期间禁止修改会话。全部校验通过后在一个事务中用暂存内容替换 `sessions` / `files` 并清空暂存，替换期间正式数据与暂存同时存在；失败或中途关闭页面时原有记录不受影响，暂存在失败时或下次导入开始时清除。任何导入错误统一提示文件格式可能不正确或已损坏，引导前往 DeepSeek 导出历史对话后重新导入。不设置 ZIP 大小、单项大小或解压总量的业务上限。

导出采用相同的格式：`manifest.json`、每个会话一个 `chat_sessions/{id}.json` 及其图片目录、`chat_session_index.json`，可再次导入。不包含 API Key 或账号资料（不写 `user.json`）。字段映射及与产品功能的差异见[历史导入导出模块](src/services/chat/history/README.md)。

### file:// 适配

- 脚本用普通 `defer` 加载：`file://` 页面的 origin 是 `null`，`type="module"` 脚本会被跨域策略拦截。
- `publicPath: 'auto'`：运行时按脚本地址推导，异步 chunk（代码高亮语言、KaTeX）按相对路径加载。
- 不用 Web Worker 和 WASM：`file://` 下无法创建 Worker，也无法 `fetch` `.wasm`。公式只用 KaTeX 渲染。
- `api.deepseek.com` 对 `Origin: null` 返回 `access-control-allow-origin: null`，并放行 `x-api-key`、`anthropic-version`、`anthropic-beta` 请求头（`/models`、`/anthropic/v1/messages`、`/anthropic/v1/files` 均已实测）。

## 目录

```
src/
  main.tsx        入口：加载 KaTeX、应用深浅色、挂载 App
  env.d.ts        CSS 模块、构建常量与无类型依赖的声明
  app/            应用外壳：页面布局、深浅色、移动端断点、主题变量与全局样式
  i18n/           简体中文与英文词典、翻译函数与 React 订阅
  utils/          中立工具函数：补零、日期与月份格式化
  services/       与界面无关的逻辑
    api/          协议：SSE 解析、接口请求、失败分类、语音接口、类型
    chat/         会话：状态（zustand）、消息分支、回复累积、界面结构推导、IndexedDB、备份、分组、错误文案
    markdown/     Markdown：解析为 AST（含引用角标）、代码高亮语言按需加载、KaTeX 加载
    speech/       语音：录音并编码 WAV、朗读的 PCM 流播放
    attachments.ts 文件：格式与大小校验、上传排队、错误文案
    settings.ts   本机设置（localStorage）
  components/     界面：侧边栏、欢迎页、会话页、输入框（含拖拽、语音输入）、消息（含朗读）、文件卡片、搜索结果与引用角标、Markdown 渲染、基础组件（含 toast 与浮层定位 hook）
```

## 复用的代码

Markdown 渲染复制自主仓库 `packages/md/src` 与 `packages/hooks/src` 的 `useThrottleMarkdownRender`（基线 `1b00f1d`），精简后按分层拆到 `services/markdown`（解析、高亮语言、KaTeX 加载）与 `components/markdown`（渲染组件、节流），见[精简的 Markdown 渲染](#精简的-markdown-渲染)。

图标（主站 `packages/ui/src/icons` 与 `apps/chat/src/components/icon/Icon.tsx`）只保留用到的，放在 `components/base/icons.tsx`。

主站的纯 CSS 只保留用到的部分，放到使用它的业务代码旁：

| 来源                                                                                   | 位置                                                | 说明                                                                                         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/theme/src`：`global.css`、`newDesign.css`、`newDesignGradientShadowText.css` | `app/theme.css`、`app/global.css`                   | 只保留用到的变量；`body` 基础样式并入 `global.css`                                           |
| `packages/md/src`：`markdown.css`、`code-block.css`、`highlight.css`                   | `components/markdown/markdown.css`、`highlight.css` | 去掉标题锚点、RTL 与 `pre` / `code[class*="language-"]` 基础规则（渲染出的代码块不带该类名） |
| `apps/chat/src`：`thinking.markdown.css`                                               | `components/messages/thinking.markdown.css`         | 去掉 RTL 规则                                                                                |

复制、尺寸监听等直接使用浏览器原生 API（`navigator.clipboard`、`ResizeObserver`），不保留旧浏览器兜底。

界面组件按主站对应组件的样式重写（同一套 CSS 变量与尺寸），不依赖 `@deepseek/ui`。智能搜索开关、搜索行、边想边搜时间线、搜索结果面板、引用角标与悬浮卡片分别对应主站的 `SearchButton`、`CompactSearchIndicator`、`ToolSearchIndicator` / `ToolOpen` / `ToolFind`、`ReferencePanel` + `SearchViewCard`、`Citation` + `SearchFloatCard`。设置弹窗按主站 `AvatarMenuSettingDialog` 的设置项结构，语言选择对应主站 `ui/select/Select`（`components/base/Select`），toast 对应 `@deepseek/ui` Toast。文件卡片、拖拽遮罩、朗读按钮动画分别对应主站 `fileItemsPreview` 的文档项（`FileIcon` 原样复制）、`DragMask`、`TtsReadingBars`（原样复制）。麦克风图标取自设计稿矢量。

### 精简的 Markdown 渲染

Mermaid 仅增加 `mermaid` 依赖，首次展示图表时按需加载，资源随构建产物分发。`mermaid` 代码块默认绘制图表，可切换源码并复制原文；深浅色跟随应用主题。流式过程中，每张图画完当前片段后每隔 100ms 检查最新文本，有变化才继续绘制；新文本不会取消正在绘制的图，也不会积压中间任务。优先绘制完整输入；生成中失败时暂缓最后一行，尝试绘制此前完整的行，相同的成功前缀不重复绘制，前缀仍不合法则保留已有图。回答结束后只绘制完整内容，失败则显示提示。不追踪代码围栏闭合，不自动修补语法。使用严格安全模式，不执行图表中的交互绑定。未引入 ZenUML 扩展、缩放拖拽、图表下载与主站埋点。

相对主站 `packages/md`，去掉了测试、测试数据、文档、未引用的 `rehype` 与 `highlight/syncLoaders`，合并了解析、链接等零散文件（`FallbackImage` 移到 `components/search`），`useThrottleMarkdownRender` 的参数改为固定值，并删除以下内容：

| 删除内容                                                                                                                                                                  | 原因 / 影响                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 品牌引用、`[reference:N]` 深度搜索引用、`citeProps` 角标渲染、`packages/citation-utils-type`                                                                              | 本应用不使用；`[reference:N]` 按原文显示                                            |
| MicroTeX WASM 公式渲染（`@deepseek/latex-wasm`）                                                                                                                          | 私有包，且 `file://` 无法加载 `.wasm`；公式只用 KaTeX                               |
| 埋点与错误上报钩子、未使用的扩展点（`CodeAction`、`CodeFooterAction`、`CodeContent`、`CodeContext`、`TableWrapper`、默认代码块复制按钮）                                  | 本应用不传入                                                                        |
| CJK 引号补丁（`skip-quote-patch`、`quote-cjk-patch` 字体）                                                                                                                | 本应用不打包该字体，补丁不生效                                                      |
| 流式文本预测（未闭合的 `**`、`` ` ``、`$` 提前按格式显示）                                                                                                                | 流式中未闭合的标记会短暂显示原文，结束后显示一致                                    |
| 流式尾部修正（补全未写完的表格、隐藏代码块开头的反引号行、末尾星号与未写完的列表标记）                                                                                    | 流式末尾可能短暂闪现 `\|`、` ``` `、`*`、`2` 等字符                                 |
| 模型输出的边界兜底：裸域名转链接（`findMoreUrl`、`topDomain`）、`<x:y>` 假链接过滤、算式中的 `*` 保留为星号、正文 `\boxed{}` 转公式、KaTeX 报错修补（`\cdotp`、`\Big{}`） | 不带协议的域名不再是链接；`1*2*3` 这类写法可能变成斜体；对应公式按原文显示          |
| `MarkdownStyleProvider`、常用语言预加载（`packages/md-shared`）、MDX 节点类型、`FallbackImage` 失败地址缓存                                                               | 本应用不使用                                                                        |
| 代码块标题吸顶与吸顶时的底部圆角修补（`apps/chat` 的 `CodeBottom`）                                                                                                       | 代码块标题随内容滚动，不再吸顶                                                      |
| AST 增量缓存、流式代码高亮防抖                                                                                                                                            | 只影响性能：流式中每次整篇解析、整块高亮；解析仍由 `useThrottleMarkdownRender` 节流 |
| 流式文字淡入（`renderers/fadeIn`）                                                                                                                                        | 流式中新内容直接出现，不再逐字淡入                                                  |
| 冷门语言的代码高亮（`highlight/asyncLoaders`、`unifiedLangs` 共约 300 种）                                                                                                | 只保留约 40 种常用语言（见 `services/markdown/highlight.ts`），其余按纯文本显示     |

### 未引入的 Markdown 补丁

主仓库在 `common/pnpm-patches` 中为 micromark / mdast 打了 6 个补丁，本应用直接使用上游原版。常见内容不受影响，差异只出现在下列写法：

| 补丁                                                                          | 主站效果                                                                                     | 本应用（原版）效果                                                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `micromark-core-commonmark`：加粗 / 斜体                                      | 放宽标点两侧的判断，`**“引号”**后文` 这类紧贴中文或标点的加粗能生效                          | 不满足 CommonMark 左右侧规则时原样显示 `**`                                             |
| `micromark-core-commonmark`：有序列表                                         | 段落下一行的任意序号（如 `2.`）都能开始列表                                                  | 只有 `1.` 能打断段落，其他序号并入上一段                                                |
| `micromark-core-commonmark`：Setext 标题                                      | 禁用「文字下一行写 `---` / `===`」的标题写法                                                 | 上一行会变成标题，原本想要的分割线消失                                                  |
| `micromark-extension-gfm-autolink-literal`、`mdast-util-gfm-autolink-literal` | 裸链接遇到中文、全角标点、引号时结束；`www.` 链接补 `https://`；邮箱识别只扫描含 `@` 的文本  | 紧跟在链接后的中文或全角标点会被算进链接；补 `http://`；超长特殊文本可能卡顿            |
| `micromark-extension-gfm-table`                                               | 分隔行支持全角冒号 `：` 对齐；单元格行内代码中的 `\|` 不拆列                                 | 含全角冒号的分隔行不识别，整张表显示为文本；行内代码中的 `\|` 会拆出新列                |
| `micromark-extension-llm-math`                                                | `$` 后紧跟数字不作为行内公式（如 `$5 到 $10`）；支持单行块级公式；未闭合的公式块不按公式处理 | `$5 到 $10` 中两个 `$` 之间的内容会被渲染成公式；未闭合的公式块会把后面的正文都当成公式 |
| `mdast-util-from-markdown`                                                    | 优化列表项处理，长列表解析更快                                                               | 结果相同，但列表项很多时解析更慢，流式输出可能卡顿                                      |

需要与主站完全一致时，从 `common/pnpm-patches` 复制这些补丁，并在 `pnpm-workspace.yaml` 中通过 `patchedDependencies` 引入；补丁对应固定版本，传递依赖也需用 `overrides` 锁到同一版本。

## 不支持的功能

| 功能                                            | 原因                                                    |
| ----------------------------------------------- | ------------------------------------------------------- |
| 账号登录、跨设备同步、分享、反馈（点赞 / 点踩） | 只有 API Key，没有账号体系                              |
| 品牌引用、风险提示                              | 协议没有对应字段                                        |
| 文档提问                                        | Chat Engine 仅支持图片，`document` 块仍返回 400         |
| 「搜索网页」「关闭搜索」等重新生成选项          | 只保留重新生成                                          |
| 专家模式（`deepseek-v4-pro`）切换               | 固定 `deepseek-flash`；v4-pro 不接受图片                |
| 重新生成的「更简洁 / 更详细」等选项             | 只保留重新生成                                          |
| 会话置顶、多选、历史搜索                        | 保持最简                                                |
| 刷新后继续接收未完成的回答                      | API 无状态，刷新时未完成的回答记为已停止                |
| 朗读音色选择、边生成边朗读                      | 设计稿未提供；固定默认音色 `stella`，只朗读已完成的回答 |
| HTML 预览、代码下载、Mermaid 缩放与导出         | 只保留代码复制和 Mermaid 图表 / 源码切换                |
| MicroTeX 公式兜底                               | 私有 WASM 包，且 `file://` 无法加载 `.wasm`             |
| 其他语言、RTL                                   | 仅支持简体中文与英文                                    |

## 已知限制

- 只在 Chromium（Chrome / Edge）下验证过 `file://`。Firefox、Safari 对 `file://` 下的 IndexedDB 与跨域请求策略不同，未验证。
- 移动端只在 Chromium 的移动设备模拟下验证过，覆盖 320 / 375 / 390px 宽度及横竖屏切换，未在 iOS Safari、Android 浏览器真机上验证。
- 跨域依赖服务端对 `Origin: null` 的放行，API 文档未写明。
- 所有请求都依赖服务端开启 Chat Engine：未开启时返回 400（`deepseek_web_search`, `deepseek_read_url` or `safety_check` is not available）。
- API Key 明文存于 localStorage，同一浏览器下的其他 `file://` 页面可以读到。
- 换成其他账号的 Key 后，旧会话中附件的 `serverId` 不属于新账号，继续该会话会报错；重新导入后会按本地原件重新上传，直接换 Key 不会。

## License

本目录下的独立应用采用 [MIT License](./LICENSE)，版权署名为 `Copyright (c) 2026 DeepSeek`。第三方依赖遵循各自的许可证。

构建时会自动将许可证复制到 `dist/LICENSE`，分发静态包时需一并保留。
