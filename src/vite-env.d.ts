/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUDIOTOOL_API_TOKEN?: string;
  readonly VITE_AUDIOTOOL_CLIENT_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_DISABLE_SENTRY?: string;
  readonly BASE_URL?: string;
  readonly DEV: boolean;
  readonly MODE: string;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

