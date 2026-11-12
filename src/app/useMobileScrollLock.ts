import { useEffect } from 'react'

/** 只让内部滚动区域消费手势，避免 iOS 键盘弹出后拖动整个页面。 */
export const useMobileScrollLock = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) {
      return
    }

    let origin: { x: number; y: number } | null = null
    let previous: { x: number; y: number } | null = null
    let multiTouch = false
    const onStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        multiTouch = true
      }
      const touch = event.touches[0]
      previous = touch ? { x: touch.clientX, y: touch.clientY } : null
      origin = previous
    }
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        previous = null
        origin = null
        multiTouch = false
      }
    }
    const onMove = (event: TouchEvent) => {
      if (
        !previous ||
        !origin ||
        multiTouch ||
        event.touches.length !== 1 ||
        (window.visualViewport && window.visualViewport.scale !== 1)
      ) {
        return
      }
      const touch = event.touches[0]
      const dx = touch.clientX - previous.x
      const dy = touch.clientY - previous.y
      previous = { x: touch.clientX, y: touch.clientY }
      if (dx === 0 && dy === 0) {
        return
      }
      // 按累计位移判断主轴，避免纵向滚动中的微小横向抖动打断手势。
      const horizontal = Math.abs(touch.clientX - origin.x) > Math.abs(touch.clientY - origin.y)
      const delta = horizontal ? dx : dy
      if (delta === 0) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      const field = target?.closest('input, textarea')
      // 保留输入框光标操作、现有选区拖动；不因页面其他位置的选区放开滚动。
      if (
        (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
        (horizontal ||
          (document.activeElement === field && field.selectionStart !== field.selectionEnd))
      ) {
        return
      }
      const selection = window.getSelection()
      if (
        target &&
        target !== document.body &&
        target !== document.documentElement &&
        selection &&
        !selection.isCollapsed &&
        selection.containsNode(target, true)
      ) {
        return
      }

      for (
        let element = target;
        element && element !== document.body;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element)
        const overflow = horizontal ? style.overflowX : style.overflowY
        const max = horizontal
          ? element.scrollWidth - element.clientWidth
          : element.scrollHeight - element.clientHeight
        if (!/^(auto|scroll)$/.test(overflow) || max <= 1) {
          continue
        }
        const position = horizontal
          ? style.direction === 'rtl'
            ? max + element.scrollLeft
            : element.scrollLeft
          : element.scrollTop
        if (delta > 0 ? position > 0 : position < max - 1) {
          return
        }
        const overscroll = horizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY
        if (overscroll === 'contain' || overscroll === 'none') {
          break
        }
      }
      if (event.cancelable) {
        event.preventDefault()
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])
}
