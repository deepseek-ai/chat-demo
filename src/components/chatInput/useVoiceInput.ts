import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationMessage } from '../../i18n/index.js'
import { classifyApiError } from '../../services/api/errors.js'
import { transcribe } from '../../services/api/speech.js'
import { startRecording, type Recording } from '../../services/speech/recorder.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing'

const describeError = (error: unknown): TranslationMessage => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return { key: 'voiceInputPermissionDenied' }
    }
    if (error.name === 'NotFoundError') {
      return { key: 'voiceInputNoDevice' }
    }
  }
  switch (classifyApiError(error)) {
    case 'unauthorized':
      return { key: 'apiKeyInvalidRetry' }
    case 'insufficientBalance':
      return { key: 'insufficientBalance' }
    case 'tooLarge':
      return { key: 'voiceInputTooLong' }
    case 'rateLimited':
      return { key: 'rateLimited' }
    default:
      return { key: 'voiceInputFailed' }
  }
}

/**
 * 语音输入（oneshot）：点击开始录音，再次点击结束并转写，结果交给 onText 填入输入框。
 * 转写中再次点击取消。录满 120 秒自动结束。
 */
export const useVoiceInput = (onText: (text: string) => void) => {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const recordingRef = useRef<Recording | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const finish = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) {
      return
    }
    recordingRef.current = null
    const audio = await recording.stop()
    if (!audio) {
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('transcribing')
    try {
      const text = await transcribe(useSettings.getState().apiKey ?? '', audio, controller.signal)
      if (text.trim()) {
        onTextRef.current(text.trim())
      } else {
        showToast({ key: 'voiceInputEmpty' })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast(describeError(error))
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setStatus('idle')
      }
    }
  }, [])

  const toggle = useCallback(async () => {
    if (status === 'recording') {
      await finish()
      return
    }
    if (status === 'transcribing') {
      controllerRef.current?.abort()
      controllerRef.current = null
      setStatus('idle')
      return
    }
    setStatus('recording')
    try {
      recordingRef.current = await startRecording(() => {
        showToast({ key: 'voiceInputLimitReached' })
        void finish()
      })
    } catch (error) {
      setStatus('idle')
      showToast(describeError(error))
    }
  }, [status, finish])

  useEffect(
    () => () => {
      recordingRef.current?.cancel()
      controllerRef.current?.abort()
    },
    []
  )

  /** 录音中的实时音量（0–1），未录音时为 0 */
  const getLevel = useCallback(() => recordingRef.current?.getLevel() ?? 0, [])

  return { status, toggle, getLevel }
}
