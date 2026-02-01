/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STACKS_API_TESTNET?: string;
  readonly VITE_STACKS_API_MAINNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __XSTRATA_HAS_HIRO_KEY__: boolean;
