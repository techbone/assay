/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for published JSON snapshots. Empty means talk to the live API. */
  readonly VITE_DATA_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
