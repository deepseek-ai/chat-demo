import type { Image, Link as LinkNode } from 'mdast'
import { memo, type ReactNode } from 'react'

const sanitizeUrl = (url: string) => {
  // 如果URL没有协议，添加默认的https协议
  if (url && !url.match(/^[a-zA-Z]+:\/\//) && !url.startsWith('mailto:')) {
    url = `https://${url}`
  }

  try {
    const parsedUrl = new URL(url)
    if (['http:', 'https:', 'mailto:'].includes(parsedUrl.protocol)) {
      return parsedUrl.toString()
    }
    return undefined
  } catch {
    return undefined
  }
}

export const Link = memo(function Link({
  node,
  children,
}: {
  node: LinkNode
  children: ReactNode
}) {
  // 先不渲染 anchor link，等之后产品方案
  if (node.url.startsWith('#')) {
    return children
  }

  // 邮箱大概率是幻觉，直接不渲染了；不改 parse 是因为改不动，都封装在插件里
  if (node.url.startsWith('mailto:')) {
    return children
  }

  // todo: fix sanitize, new URL 无法正确初始化 `www.a.com？` 这个 url
  const href = sanitizeUrl(node.url)

  return (
    <a href={href} title={node.title || undefined} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
})

/** 图片不直接展示，渲染为链接 */
export function ImageAsLink({ node }: { node: Image }) {
  const url = sanitizeUrl(node.url)
  return (
    <a href={url} title={node.title ?? ''} target="_blank" rel="noreferrer">
      {url}
    </a>
  )
}
