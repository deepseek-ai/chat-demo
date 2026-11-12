/**
 * 朗读按钮 loading / playing 两态的动画竖条（4 根，SVG 绘制，随 mode 换动画与颜色）。
 *
 * playing 波形用 SMIL 动 rect 的 height+y，不要改成 CSS 动画：
 * - div 动 height：paint 时边缘按设备像素取整，慢速动画呈階跃抖动，引擎行为无参可调；
 * - div 动 scaleY：平滑但 1px 圆角端头被纵向压扁；
 * - rect 几何走 CSS 属性要 Safari 17.4，SMIL 则 iOS6+ 可用（项目底线 iOS12）。
 * 代价：SMIL 逐帧走主线程（16×16 可忽略），且不认 prefers-reduced-motion——JSX 用
 * matchMedia 渲染静态帧。波形只取两段极值 keyframe：中间设档会因逐段 easing 在
 * 中点停顿，真正弦中点速度最大。
 *
 * 引擎怪癖要求 svg 两态常驻、切态勿重挂（勿加 key）：
 * - Chromium 新建 SMIL 时间容器约 400ms 不推进时间轴（setCurrentTime/pause 救不回）；
 *   常驻使冻结落在 loading 期，切态往运行中的容器插 <animate>，10ms 内起波；
 * - 新版 WebKit 容器不自启，挂载时须 unpauseAnimations() 踢一脚。
 * 入场相位因此取决于容器时间落点，错峰关系由 begin 差值保证。
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

import styles from './ReadingBars.module.css'

/** 条宽 2、间距 2，总宽 14 在 16 视口内居中 */
const BAR_XS = [1, 5, 9, 13]

/** 相邻条相位滞后 0.25 周期（0.4s），波从左往右传；begin 相对常驻时间容器解析，差值定错峰 */
const WAVE_BEGINS = ['0s', '-1.2s', '-0.8s', '-0.4s']

/** reduced-motion 的静态帧（换算到 4–14 档） */
const STATIC_PLAYING_HEIGHTS = [7, 14, 4, 10]

/** ease-in-out 的 cubic-bezier */
const EASE_IN_OUT = '0.42 0 0.58 1'

/** loading 扫光蒙层逐条一份高斯 keyframes（峰对齐条的几何位置），见 module.css */
const SWEEP_CLASSES = [styles.sweep1, styles.sweep2, styles.sweep3, styles.sweep4]

export function ReadingBars({ mode }: { mode: 'loading' | 'playing' }) {
  const reducedMotion = usePrefersReducedMotion()
  const playing = mode === 'playing'

  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    // 新版 WebKit 的 SMIL 容器创建后不自启（时钟停在 0，症状是 playing 条全高静止），
    // 踢一脚才跑；Chromium 与旧 WebKit（iOS12）自启，此调用为无害 no-op。
    svgRef.current?.unpauseAnimations()
  }, [])

  return (
    <svg
      ref={svgRef}
      className={clsx(styles.bars, playing ? styles.playing : styles.loading)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {BAR_XS.map((x, index) => {
        const height = playing ? (reducedMotion ? STATIC_PLAYING_HEIGHTS[index] : 14) : 4
        const y = (16 - height) / 2
        return (
          <Fragment key={index}>
            <rect className={styles.bar} x={x} y={y} width={2} height={height} rx={1}>
              {playing && !reducedMotion && (
                // height 与 y 同 spline 同 begin：都是条高的仿射函数，逐帧严格同步，竖向恒居中
                <>
                  <animate
                    attributeName="height"
                    values="14;4;14"
                    keyTimes="0;0.5;1"
                    calcMode="spline"
                    keySplines={`${EASE_IN_OUT};${EASE_IN_OUT}`}
                    dur="1.6s"
                    begin={WAVE_BEGINS[index]}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="y"
                    values="1;6;1"
                    keyTimes="0;0.5;1"
                    calcMode="spline"
                    keySplines={`${EASE_IN_OUT};${EASE_IN_OUT}`}
                    dur="1.6s"
                    begin={WAVE_BEGINS[index]}
                    repeatCount="indefinite"
                  />
                </>
              )}
            </rect>
            {!playing && (
              // 扫光蒙层：黑 rect 盖在条上，fill-opacity 走逐条高斯 keyframes
              <rect
                className={clsx(styles.sweep, SWEEP_CLASSES[index])}
                x={x}
                y={y}
                width={2}
                height={height}
                rx={1}
              />
            )}
          </Fragment>
        )
      })}
    </svg>
  )
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches)
  useEffect(() => {
    const queryList = window.matchMedia(REDUCED_MOTION_QUERY)
    const listener = ({ matches }: { matches: boolean }) => setReduced(matches)
    // 要用老字号 API：iOS12 的 MediaQueryList 没有 addEventListener
    queryList.addListener(listener)
    return () => queryList.removeListener(listener)
  }, [])
  return reduced
}
