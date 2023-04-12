/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly NEXT_PUBLIC_APP_NAME: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }