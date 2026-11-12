# 历史导入导出

导入导出都只使用历史会话导出格式（`export_format_version: 3`），类型定义见 `format.ts`，依据 chat-rs history-exporter 的导出格式说明。不兼容其他格式；不读取 `user.json`，导出也不写。

```text
manifest.json                         格式版本，第一个条目
user.json                             账号信息（可能缺失，导入时跳过）
chat_sessions/{session_id}.json       一个会话（消息树）
chat_sessions/{session_id}_files/     该会话的图片：{file_id}-{file_name}
chat_session_index.json               会话摘要，最后一个条目
```

## 模块

| 文件                                    | 职责                                               |
| --------------------------------------- | -------------------------------------------------- |
| `format.ts` / `schema.ts`               | 格式类型；按格式严格校验，返回只含已定义字段的对象 |
| `toLocal.ts` / `toArchive.ts`           | 会话文件与本地会话的相互转换                       |
| `importArchive.ts` / `exportArchive.ts` | 按条目顺序流式导入、生成 ZIP                       |
| `zipReader.ts` / `zipWriter.ts`         | 逐项读写 ZIP，校验路径、大小与 CRC                 |
| `paths.ts` / `errors.ts`                | 条目名规则、失败原因                               |
| `../backup.ts`                          | 入口：串行队列、确认后全量替换                     |

## 导入

1. 选择文件后先提示覆盖，确认后再只读首个条目检查格式：不是 ZIP、首个条目不是 `manifest.json`，或 `export_format_version` 不是 3 时直接报错，不停止生成、不写入暂存。旧格式（原版 ZIP、单会话 JSON、独立版旧备份）都在这一步拒绝。导入中的任何错误统一提示文件格式可能不正确或已损坏，引导前往 DeepSeek 导出历史对话后重新导入。
2. 确认后停止生成，导入期间禁止修改会话。会话与原件只写入 IndexedDB 的暂存存储 `sessionsStaging` / `filesStaging`，正式的 `sessions` / `files` 保持不变；全部校验通过后在一个事务中清空正式数据、移入暂存内容并清空暂存。失败（包括替换事务失败）或中途关闭页面时原有记录不受影响，失败会清除暂存，关闭页面遗留的暂存在下次导入开始时清除。
3. 按物理顺序读取：首个条目必须是 `manifest.json` 且版本为 3；每个会话 JSON 校验并转换后，读取紧随其后的本会话图片，再写入暂存的会话存储；`chat_session_index.json` 必须是最后一个条目，且与会话文件一一对应。其他条目视为不完整。
4. 同一时间只在内存中保留一个会话和一张图片。图片按文件 ID 存入暂存的原件存储，多个会话目录中的同一文件只保存一份；MIME 由字节识别，无法识别时为空，按普通文件展示。

消息树：按 `id` 排序，父消息 id 必须更小、角色交替、根为提问。`current_message_id` 到根为当前分支，其余节点默认选中 id 最大的子消息。

每条导入消息在 `imported` 中保存校验后的原文（不含 `id` / `parent_id`），界面使用转换出的本地字段；请求还会读取原文中的 `READ_LINK` 签名：

| 片段                             | 本地展示                                                         |
| -------------------------------- | ---------------------------------------------------------------- |
| `REQUEST` / `FILE`               | 提问文字、附件（有原件的图片显示缩略图，其余只显示文件名和大小） |
| `THINK`                          | 思考块（无签名、无用时）                                         |
| `RESPONSE` / `TEMPLATE_RESPONSE` | 正文                                                             |
| `TOOL_SEARCH`                    | 搜索步骤；同一回复有 `TOOL_OPEN` / `TOOL_FIND` 时按边想边搜展示  |
| `TOOL_OPEN` / `TOOL_FIND`        | 浏览、页内查找步骤；没有链接的 `TOOL_OPEN` 不展示                |
| `READ_LINK`                      | 只有密文，不生成本地展示块；签名用于恢复请求上下文                 |
| 其他                             | 不支持，回复下方提示「部分内容类型暂不支持展示」                 |

回复状态：`FINISHED` / `FAILED` / `CONTEXT_LENGTH_EXCEEDED` 为已完成，`CONTENT_FILTER` 为拒答（不展示正文和思考），`INCOMPLETE` / `TIMEOUT` / `WIP` 为已停止。

导入的消息不可修改，回复不能继续生成。`FINISHED` 或 `INCOMPLETE`、不含 `TEMPLATE_RESPONSE` 且有正文的回复进入上下文：回传正文，并从 `imported.fragments` 的 `READ_LINK` 中提取非空 `signature`，生成配对的 `server_tool_use` 与 `web_fetch_tool_result`（`kind: read_link`），签名原样回传。`INCOMPLETE` 的原状态和片段原样保留，再次导出仍为 `INCOMPLETE`；不能续写不影响其参与后续新提问。网页 URL、标题和正文由服务端解密恢复；无法解密时服务端忽略。当前格式没有这些明文展示字段，待导出侧补齐后接入展示。其他导入思考与工具块只用于展示，不回传。

签名在构造请求时读取，不修改导入原文、展示块或数据库结构，已导入的记录无需重新导入。导入图片首次进入请求时按原件上传，没有原件的附件不进入请求。

## 导出

- 条目顺序与导入一致：manifest → 各会话 JSON 及其图片 → index。消息按父节点优先重新编号为 1…n，`current_message_id` 为当前分支末尾。
- 导入的消息原样写回，只按本地是否有原件重新生成 `FILE.export_path`；导出再导入再导出结果一致。
- 本地新建的消息按下表转换。只写出本地有原件的图片，路径为 `{file_id}-{file_name}`（分隔符替换为 `_`）。
- `TOOL_SEARCH.results[].site_icon` 为独立版可选扩展，导出保存站点图标 URL 或 null，导入保留原值并用于展示（仅 HTTP / HTTPS）。兼容没有此字段的 v3 文件；缺失、为空或加载失败时显示链接图标。

| 本地内容             | 导出                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| 提问、附件           | `FILE`（`token_usage` / `width` / `height` 为 null）+ `REQUEST`；开关取首个回答的设置        |
| 思考块               | `THINK`，`elapsed_secs` 取块的起止时间；空思考不导出                                         |
| 正文                 | 相邻文本块合并为 `RESPONSE`；不写引用标记，调用过联网能力时剥除模型原样输出的 `[citation:N]` |
| 搜索                 | `TOOL_SEARCH`；失败或未完成只能写为没有结果                                                  |
| 打开网页 / 页内查找  | `TOOL_OPEN` / `TOOL_FIND`；日期无法解析时为 null                                             |
| 阅读链接             | 成功结果带 `signature` 时原样写入 `READ_LINK`；失败或未收到结果时不导出 |
| 未识别的块           | 不导出 |
| 状态                 | 完成 `FINISHED`、拒答 `CONTENT_FILTER`、停止或长度上限 `INCOMPLETE`、出错 `FAILED`           |
| 用量                 | 回复为最近一次请求的输入（含缓存）与输出之和；提问为 0                                       |

## 与产品功能的差距

格式中独立版无法展示或使用的内容（原文保留，再次导出不丢）：

- `TIP`、`CONTENT_RISK`、`PARTIAL_FILE_READ`、`TOOL_IMAGE_SEARCH` 没有对应界面；`READ_LINK` 的网页信息无法在本地解密展示。
- 思考用时、置顶、深度思考 / 智能搜索开关、累计用量、文件 token 与尺寸只保存不使用。
- `TOOL_FIND` 没有查找词，打开的网页没有正文；未携带 `site_icon` 的搜索结果没有站点图标；`TEMPLATE_RESPONSE` 与提示文案是导出时的英文兜底。
- 非图片文件、缺失或超限的图片没有原件，不能查看，也不进入后续请求。
- `FAILED`、`CONTEXT_LENGTH_EXCEEDED`、`TIMEOUT`、`WIP`、被过滤或服务端模板的回复不进入上下文；所有导入回复均不能继续生成。非当前分支的选择无记录。

本地内容格式无法表达（导出后丢失）：

- 阅读链接的展示字段（签名密文保留但无法展示）、正文引用角标、搜索失败状态、页内查找词。
- 非图片附件原件；模型、思考签名、工具调用 ID、错误原因与停止原因细节、用量明细。
- 非当前分支各自选中的子消息。
- 本地回答版本的 `latestReminder` 系统信息快照；导入后不为历史补写，新提问按当前设置生成快照。

## 内存与格式

不设置输入大小、单项大小、解压总量或条目数的业务上限。支持单卷 STORE / DEFLATE；ZIP64、加密、分卷及非 UTF-8 的非 ASCII 文件名不支持，条目名统一按 NFC 比较。导出使用 STORE，超出 ZIP32 字段容量时拒绝生成；仍生成完整下载 Blob。来源链接只展示 HTTP / HTTPS。
