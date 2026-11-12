import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useMemo } from 'react'
import { IconRefreshOutline16, IconWarningOutline16 } from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply, retryUpload } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { buildReplyView } from '../../services/chat/view.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useMemo(() => buildReplyView(message, streaming), [message, streaming])
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示提示
  const refused = message.stopReason === 'refusal'
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  return (
    <div className={styles.message}>
      {refused ? null : <ReplyArea message={message} view={view} streaming={streaming} />}
      {view.answer && !refused ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={view.answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice ? (
        <div className={clsx(styles.notice, message.status === 'error' && styles.error)}>
          {message.status === 'error' ? <IconWarningOutline16 /> : null}
          <span>{notice.text}</span>
          {notice.action === 'apiKey' ? (
            <button
              type="button"
              className={styles.noticeAction}
              onClick={() => openSettings('data')}
            >
              {t('changeApiKey')}
            </button>
          ) : null}
          {notice.action === 'retryUpload' ? (
            <button
              type="button"
              className={styles.noticeAction}
              disabled={busy}
              onClick={() => retryUpload(sessionId, message.id)}
            >
              {t('retry')}
            </button>
          ) : null}
          {notice.action === 'topUp' ? (
            <a className={styles.noticeAction} href={TOP_UP_URL} target="_blank" rel="noreferrer">
              {t('topUp')}
            </a>
          ) : null}
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {!refused ? <CopyButton text={view.answer?.text ?? ''} /> : null}
            {view.answer && !refused ? (
              <ReadAloudButton messageId={message.id} text={view.answer.text} />
            ) : null}
            {!refused ? (
              <IconButton
                icon={<IconRefreshOutline16 />}
                tooltip={t('regenerate')}
                tooltipPlacement="bottom"
                disabled={busy}
                onClick={() => {
                  stopReadAloud()
                  regenerateReply(sessionId, message.id)
                }}
              />
            ) : null}
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
})
