declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string

/** Prism 语言包只注册到全局 Prism 上，没有导出 */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展，加载后注册到 KaTeX 上，没有导出 */
declare module 'katex/contrib/mhchem' {}
