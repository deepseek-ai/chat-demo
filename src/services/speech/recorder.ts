/**
 * 录音并编码为 ASR 接受的 WAV（单声道、16-bit PCM、16kHz）。
 *
 * AudioContext 以 16kHz 创建，浏览器负责重采样；ScriptProcessorNode 采集 PCM 样本。
 * 录音处理在页面内完成。
 */
export const SAMPLE_RATE = 16000
/** ASR 单次时长上限 120 秒 */
export const MAX_SECONDS = 120

const BUFFER_SIZE = 4096

export type Recording = {
  /** 停止录音并返回 WAV；没有采到声音时返回 null */
  stop: () => Promise<Blob | null>
  /** 放弃录音，释放麦克风 */
  cancel: () => void
  /** 当前音量（0–1），供录音动画按帧读取 */
  getLevel: () => number
}

/** 开始录音；到达时长上限时调用 onLimit，由调用方决定何时 stop */
export const startRecording = async (onLimit: () => void): Promise<Recording> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
  // AnalyserNode 按动画帧提供音量数据，驱动录音动画
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  const levelBuffer = new Float32Array(analyser.fftSize)
  const chunks: Float32Array[] = []
  let length = 0
  let limited = false
  processor.onaudioprocess = (event) => {
    if (limited) {
      return
    }
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    length += BUFFER_SIZE
    if (length >= MAX_SECONDS * SAMPLE_RATE) {
      limited = true
      onLimit()
    }
  }
  source.connect(processor)
  source.connect(analyser)
  // ScriptProcessorNode 只有连到输出才会持续回调；输出缓冲保持静音
  processor.connect(context.destination)

  const release = () => {
    processor.onaudioprocess = null
    processor.disconnect()
    analyser.disconnect()
    source.disconnect()
    for (const track of stream.getTracks()) {
      track.stop()
    }
    void context.close()
  }

  return {
    stop: async () => {
      release()
      return length === 0 ? null : encodeWav(chunks, length)
    },
    cancel: release,
    getLevel: () => {
      analyser.getFloatTimeDomainData(levelBuffer)
      let sum = 0
      for (const sample of levelBuffer) {
        sum += sample * sample
      }
      // 说话时 RMS 多在 0.02–0.2，放大后截到 0–1
      return Math.min(1, Math.sqrt(sum / levelBuffer.length) * 6)
    },
  }
}

const encodeWav = (chunks: Float32Array[], length: number) => {
  const samples = Math.min(length, MAX_SECONDS * SAMPLE_RATE)
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples * 2, true)
  let offset = 44
  let written = 0
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length && written < samples; i++, written++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
