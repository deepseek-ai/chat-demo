import { create } from 'zustand'
import type { TranslationMessage } from '../../i18n/index.js'

/** 轻提示：同一时间只显示一条，新的替换旧的，3 秒后自动消失；文案在渲染时按当前语言翻译 */
type ToastState = { id: number; message: TranslationMessage | string | null }

export const useToast = create<ToastState>(() => ({ id: 0, message: null }))

const DURATION = 3000
let timer = 0

export const showToast = (message: TranslationMessage | string) => {
  window.clearTimeout(timer)
  useToast.setState((state) => ({ id: state.id + 1, message }))
  timer = window.setTimeout(() => useToast.setState({ message: null }), DURATION)
}
