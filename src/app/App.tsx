import clsx from 'clsx'
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
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const session = useChatStore((state) =>
    state.activeId === null ? null : state.sessions.find(({ id }) => id === state.activeId)
  )
  const mobileSession = isMobile && Boolean(session)
  const frameRef = useMobileViewport(mobileSession)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : state.activeId in state.streaming
  )
  const activeId = useChatStore((state) => state.activeId)

  useEffect(() => {
    if (!isMobile) {
      return
    }
    const preventPageScroll = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return
      }
      for (
        let element = event.target instanceof Element ? event.target : null;
        element && element !== document.body;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element)
        const scrollsY =
          /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
        const scrollsX =
          /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth
        if (scrollsY || scrollsX) {
          return
        }
      }
      event.preventDefault()
    }
    document.addEventListener('touchmove', preventPageScroll, { passive: false })
    return () => document.removeEventListener('touchmove', preventPageScroll)
  }, [isMobile])

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
      <div ref={frameRef} className={clsx(styles.frame, mobileSession && styles.mobileSession)}>
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
