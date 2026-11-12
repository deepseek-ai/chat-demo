import { useEffect } from 'react'
import { useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport } from './viewport.js'
import { reportStorageError } from '../services/chat/db.js'
import { initChat, useChatStore } from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const isMobile = useIsMobile()
  const frameRef = useMobileViewport(isMobile)
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏是抽屉，不受桌面端的收起状态影响
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const session = useChatStore((state) =>
    state.activeId === null ? null : state.sessions.find(({ id }) => id === state.activeId)
  )
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : state.activeId in state.streaming
  )
  const activeId = useChatStore((state) => state.activeId)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    initChat().catch(reportStorageError('read local sessions'))
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? <MobileSider /> : siderCollapsed ? null : <Sider />}
        <main className={styles.main}>
          {siderCollapsed ? <CollapsedSider /> : null}
          {!ready ? null : session ? (
            <SessionView session={session} streaming={streaming} siderCollapsed={siderCollapsed} />
          ) : (
            <Welcome />
          )}
        </main>
        <SearchPanel />
      </div>
      <SettingsDialog />
      <Toast />
    </>
  )
}
