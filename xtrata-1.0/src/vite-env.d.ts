/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BNSV2_API_BASE?: string;
  readonly VITE_BNSV2_API_BASE_MAINNET?: string;
  readonly VITE_BNSV2_API_BASE_TESTNET?: string;
  readonly VITE_STACKS_API_TESTNET?: string;
  readonly VITE_STACKS_API_MAINNET?: string;
  readonly VITE_STACKS_EXPLORER_BASE?: string;
  readonly VITE_STACKS_EXPLORER_BASE_MAINNET?: string;
  readonly VITE_STACKS_EXPLORER_BASE_TESTNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __XSTRATA_HAS_HIRO_KEY__: boolean;
