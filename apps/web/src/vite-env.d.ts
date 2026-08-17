/// <reference types="vite/client" />

declare module "*.svg" {
  const src: string;
  export default src;
}

// No ImportMetaEnv augmentation needed for VITE_API_BASE_URL (see
// src/lib/apiClient.ts) -- vite/client's own ImportMetaEnv already carries
// a `[key: string]: any` index signature, and this project's eslint config
// flags an additional declaration merge here as an unused interface.
