import { isTranslationKey, translate } from '../../i18n/index.js'
import { classifyStatus } from '../api/errors.js'
import { getReplyText } from './reply.js'
import type { AssistantMessage } from './types.js'

export type Notice = {
  text: string
  /** 需要用户处理的问题附带的操作 */
  action?: 'apiKey' | 'topUp' | 'retryUpload'
}

/** 回复出错或未正常结束时展示的提示 */
export const describeReply = (reply: AssistantMessage): Notice | null => {
  if (reply.status === 'error' && reply.error) {
    const { kind, status, localMessage } = reply.error
    // 导入的历史可能来自不同版本；不识别的文案沿用保存时的原文。
    const message =
      localMessage && isTranslationKey(localMessage.key)
        ? translate(localMessage.key, localMessage.params)
        : reply.error.message
    if (kind === 'upload') {
      return {
        text: translate('uploadBeforeSendFailed', { message }),
        action: reply.error.retryable ? 'retryUpload' : undefined,
      }
    }
    if (kind === 'network') {
      return { text: translate('commonNetworkErrorToast') }
    }
    if (kind === 'interrupted') {
      return { text: translate('replyConnectionInterrupted') }
    }
    if (kind === 'stream') {
      return { text: translate('replyServerInterrupted', { message }) }
    }
    if (kind === 'protocol') {
      return { text: translate('replyProtocolError', { message }) }
    }
    switch (classifyStatus(status)) {
      case 'unauthorized':
        return { text: translate('replyInvalidApiKey'), action: 'apiKey' }
      case 'insufficientBalance':
        return { text: translate('replyInsufficientBalance'), action: 'topUp' }
      case 'rateLimited':
        return { text: translate('replyRateLimited') }
      case 'serverBusy':
        return { text: translate('completionServerBusyToast') }
      default:
        return {
          text: translate('replyRequestFailed', {
            status: status ?? translate('unknownError'),
            message,
          }),
        }
    }
  }
  if (reply.status === 'stopped') {
    return null
  }
  switch (reply.stopReason) {
    case 'max_tokens':
      return { text: translate('replyLengthLimit') }
    case 'refusal':
      return { text: translate('replyRefused') }
    case 'tool_use':
      return { text: translate('replyToolUnsupported') }
    default:
      break
  }
  // Chat Engine 内部出错、资源不足时也以 end_turn 结束，此时没有任何正文
  if (reply.status === 'done' && !getReplyText(reply).trim()) {
    return { text: translate('completionServerBusyToast') }
  }
  return reply.blocks.some((block) => block.type === 'unsupported')
    ? { text: translate('replyContentUnsupported') }
    : null
}
