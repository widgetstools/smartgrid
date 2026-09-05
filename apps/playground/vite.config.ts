import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The browser reaches the local model server through the dev server, so the
 * request is same-origin and no CORS headers are needed on the LLM side:
 *   /llm/v1/chat/completions  →  http://localhost:3000/v1/chat/completions
 * Override the target with SMARTGRID_LLM_URL (e.g. a different port).
 */
// The playground tsconfig has no node types; read the env through globalThis.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const LLM_TARGET = env['SMARTGRID_LLM_URL'] ?? 'http://localhost:3000';

const llmProxy = {
  '/llm': {
    target: LLM_TARGET,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/llm/, ''),
    // Keep SSE streams open.
    timeout: 0,
    proxyTimeout: 0,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5300, strictPort: true, proxy: llmProxy },
  preview: { port: 5300, strictPort: true, proxy: llmProxy },
});
