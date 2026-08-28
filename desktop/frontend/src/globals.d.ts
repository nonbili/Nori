/// <reference types="vite/client" />

/** wxt auto-imports this in the extension; vite.config.ts injects the shim. */
declare function defineBackground(main: () => void): { main: () => void }

declare const __NORI_VERSION__: string

declare module '*.css'
