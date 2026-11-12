import { useTranslate } from '../../i18n/index.js'
import { useToast } from './toastState.js'
import styles from './Toast.module.css'

export const Toast = () => {
  const t = useTranslate()
  const { id, message } = useToast()
  if (!message) {
    return null
  }
  return (
    <div key={id} className={styles.toast} role="status">
      {typeof message === 'string' ? message : t(message.key, message.params)}
    </div>
  )
}
