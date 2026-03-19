// Type declarations for FrankenMermaid WASM package
declare module '@beads-ide/frankenmermaid' {
  export function init(config?: any): void
  export function renderSvg(input: string, config?: any): string
  export function parse(input: string): any
  export function detectType(input: string): any
  export default function initWasm(input?: any): Promise<any>
}

// WASM asset URL import
declare module '*.wasm?url' {
  const url: string
  export default url
}
