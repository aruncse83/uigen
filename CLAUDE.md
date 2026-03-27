# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup (first time)
npm run setup          # installs deps, generates Prisma client, runs migrations

# Development
npm run dev            # Next.js dev server with Turbopack at localhost:3000

# Testing
npm test               # run Vitest tests

# Linting
npm run lint           # ESLint

# Database
npm run db:reset       # reset SQLite database
```

**Environment**: Set `ANTHROPIC_API_KEY` in `.env` to enable real Claude AI. Without it, the app falls back to a mock provider that returns static code.

## Architecture

UIGen is an AI-powered React component generator with live preview. Users describe components in chat; Claude generates/edits code in a virtual filesystem; the result renders in an iframe.

### Data Flow

```
User chat message
  → ChatProvider (useChat hook, Vercel AI SDK)
  → POST /api/chat
  → Claude AI (claude-haiku-4-5) + tool calls
  → FileSystemContext (VirtualFileSystem)
  → PreviewFrame (Babel transpile → iframe) + Monaco editor
  → Optional: persist to SQLite via Prisma
```

### Key Concepts

**Virtual File System** (`src/lib/file-system.ts`): All generated code lives in an in-memory `VirtualFileSystem` class — no actual disk writes. Serializable to JSON for database persistence.

**AI Tool Calling**: Claude uses two tools to manipulate files:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — create/view/edit files via string replacement
- `file_manager` (`src/lib/tools/file-manager.ts`) — rename/delete files

**Live Preview** (`src/components/preview/PreviewFrame.tsx`): Watches the serialized file system, transpiles JSX to plain HTML using `@babel/standalone` and import maps (via `src/lib/transform/jsx-transformer.ts`), and renders in an iframe.

**Provider Abstraction** (`src/lib/provider.ts`): Wraps Vercel AI SDK's `@ai-sdk/anthropic`. If `ANTHROPIC_API_KEY` is missing, returns a mock provider.

**Authentication**: JWT sessions stored in encrypted cookies (`src/lib/auth.ts`, `jose`). Server actions in `src/actions/` handle signUp/signIn/signOut. Anonymous users can generate components; registered users get project persistence.

### State Management

Two React contexts own all client state:
- `ChatContext` (`src/lib/contexts/chat-context.tsx`) — chat messages, streaming state
- `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) — virtual file tree, selected file, tool call processing

### Database Schema

Always reference `prisma/schema.prisma` as the source of truth for database structure. Generated client lives at `src/generated/prisma/`.

```
User
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  projects  Project[]

Project
  id        String   @id @default(cuid())
  name      String
  userId    String?                          // nullable — anonymous users have no userId
  messages  String   @default("[]")          // JSON-serialized chat message array
  data      String   @default("{}")          // JSON-serialized VirtualFileSystem snapshot
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User?    @relation(...)          // optional; cascade deletes project when user deleted
```

SQLite via Prisma. `messages` and `data` are stored as raw JSON strings (not native JSON columns — SQLite limitation). Deserialize before use.

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

## Code Style

**Comments**: Use comments liberally throughout all code — both complex logic and simple, self-evident code. Every function, component, hook, and module should have a comment explaining its purpose. Inline comments should explain the "why", not just the "what".
