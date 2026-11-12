# 历史导入导出

deepseek-chat-demo 使用 `export_format_version: 3` 的历史会话 ZIP，导出文件名为 `deepseek_data-日期.zip`。字段定义见 [format.ts](./format.ts)，实际校验规则见 [schema.ts](./schema.ts)。

## 归档结构

导出按以下顺序写入：

```text
manifest.json                                      格式版本，必须是首个条目
chat_sessions/{session_id}.json                    全部会话 JSON（含消息树）
chat_session_index.json                            会话索引
chat_sessions/{session_id}_files/{file_id}_{file_name}  全部图片原件
```

导入也支持“会话 JSON → 该会话图片”交错排列、索引在末尾的顺序。`user.json` 可位于 manifest 与会话之间，导入时跳过；本项目不导出账号信息。图片按 `FILE.export_path` 匹配。

可选字段允许缺省；时间接受以 `Z` 结尾、带可选小数秒的 UTC 时间。校验后只保留已定义字段，未知片段类型或不合法的字段会导致导入失败。

## 导入与替换

1. 用户确认覆盖后，先读取首个条目检查格式与版本；不符合时直接失败，不中止正在生成的回答。
2. 检查通过后停止生成，导入期间禁止修改会话。逐条解析会话并写入 IndexedDB 暂存区，再读取图片并回填附件类型。图片按文件 ID 去重，类型由原件字节识别。
3. 校验索引与会话一一对应、消息树和 ZIP 完整性后，在同一个事务中用暂存内容替换全部本地会话与附件。校验或提交失败时保留原有记录；中断遗留的暂存在下次导入前清理。

消息树以 `id` / `parent_id` 还原，父消息 ID 必须小于子消息 ID、角色交替、根为提问。`current_message_id` 决定当前分支；其他节点默认选中 ID 最大的子消息。缺失原件的附件保留文件名和大小，不进入后续请求；有原件的导入图片在首次用于请求时上传。

每条导入消息在 `imported` 中保留校验后的原始字段，展示时另行转换。再次导出时重建消息 ID、父子关系与附件路径，其余已保留的消息字段沿用原值。

## 展示与上下文

- 展示提问、正文、思考、附件，以及搜索、打开网页、页内查找步骤。搜索状态和查找词存在时用于展示；`READ_LINK` 有合法 URL 时展示链接与标题，仅含签名的记录用于请求上下文。展示链接仅接受 HTTP / HTTPS。
- `TIP`、`CONTENT_RISK`、`PARTIAL_FILE_READ`、`TOOL_IMAGE_SEARCH` 保留原文，但没有对应界面。思考用时、工具分组等归档元数据不完整映射到本地展示；完整规则见 [toLocal.ts](./toLocal.ts)。
- 导入回复均不能继续生成。状态为 `FINISHED` 或 `INCOMPLETE`、有正文且不含 `TEMPLATE_RESPONSE` 的回复可以进入后续提问的上下文；其他状态不回传。
- 请求回传正文及从原文恢复的 `READ_LINK` 签名、URL 和标题，供服务端恢复网页上下文。导入的思考和其他工具块不回传，见 [../reply.ts](../reply.ts)。

## 导出范围

导出完整消息树与当前分支，只附带本地存在的图片原件；非图片附件仅有元数据。本地新消息转换为归档片段，包含搜索状态、页内查找词，以及成功阅读链接结果的签名、URL 和标题。具体映射见 [toArchive.ts](./toArchive.ts)。

归档不保存 API Key 或应用设置，也不能完整恢复本地运行状态：正文引用角标、非图片附件原件、模型、思考签名、原工具调用 ID、错误详情、用量明细、非当前分支的选择，以及 `latestReminder` 快照不会保留。新提问的快照按当前设置生成。

## 模块与 ZIP 支持

| 文件                                                                           | 职责                           |
| ------------------------------------------------------------------------------ | ------------------------------ |
| [format.ts](./format.ts)、[schema.ts](./schema.ts)                             | 归档类型与字段校验             |
| [toLocal.ts](./toLocal.ts)、[toArchive.ts](./toArchive.ts)                     | 归档与本地消息转换             |
| [importArchive.ts](./importArchive.ts)、[exportArchive.ts](./exportArchive.ts) | 条目读取、暂存与归档组装       |
| [zipReader.ts](./zipReader.ts)、[zipWriter.ts](./zipWriter.ts)                 | ZIP 读写及路径、大小、CRC 校验 |
| [../backup.ts](../backup.ts)                                                   | 导入导出入口与串行队列         |

支持单卷 ZIP32 的 STORE / DEFLATE，导出使用 STORE。ZIP64、加密、分卷及非 UTF-8 的非 ASCII 文件名不支持；条目名统一按 NFC 比较。不另设业务大小上限，但受 ZIP32 容量和浏览器资源限制，导出会生成完整下载 Blob。
