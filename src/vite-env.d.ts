/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEX_FACTORY?: string
  readonly VITE_DEX_ROUTER?: string
  readonly VITE_TOKEN_TWETH?: string
  readonly VITE_TOKEN_TWBTC?: string
  readonly VITE_TOKEN_EURC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
