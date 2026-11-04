<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Security & Secret Protection
- **Zero-Exposure Policy**: NEVER output, print, quote, or display secret values (such as `GEMINI_API_KEY`, service role keys, private tokens, or passwords from `.env` or `.env.local`) in chat responses, transcripts, commit messages, or artifacts.
- When referencing environment variables or setup steps, always refer to the variable name (e.g., `process.env.GEMINI_API_KEY`) or use generic placeholders (e.g., `your-gemini-api-key`).

