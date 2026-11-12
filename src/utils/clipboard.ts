/** 必须从点击事件直接调用，保留浏览器要求的用户操作上下文。 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 剪贴板权限受限时尝试兼容方式。
  }

  // 局域网 HTTP 等非安全上下文没有 Clipboard API；这里不能提前 await。
  const activeElement = document.activeElement
  const selection = window.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange()
      )
    : []
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.tabIndex = -1
  // 保持可选择，避免移动端弹出键盘、缩放或滚动页面。
  textarea.style.cssText =
    'position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px'

  try {
    document.body.appendChild(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true })
    }
    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) {
        selection.addRange(range)
      }
    }
  }
}
