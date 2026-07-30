# Implementation Plan — Phase 0: Repo Scaffolding

This plan outlines the repository scaffolding for the Badminton Platform monorepo (Phase 0). It sets up the core workspace layout, local database environment, Prisma ORM initialization, standard API response/error middleware, and simple CI verification.

## User Review Required

> [!IMPORTANT]
> The monorepo utilizes **pnpm workspaces**. Please ensure you have `pnpm` installed locally (`npm install -g pnpm`) before executing setup commands.

> [!NOTE]
> The database connection is configured to run against a local PostgreSQL instance inside Docker. A `.env` file will be generated locally with development credentials matching the Docker container.

## Open Questions
All previous open questions have been resolved:
1. **Workspace Naming Convention**: We will use the `@badminton/` scope for packages and services (e.g. `@badminton/shared-types`, `@badminton/database`).
2. **Prisma Client Location**: The Prisma schema and generated client will reside in a central workspace package `packages/database` rather than at the root. The Prisma client will be generated into a custom output directory inside `packages/database/src/generated/client`, and exported via `packages/database/src/index.ts`. All 5 services will depend on `@badminton/database` as a workspace dependency, ensuring they all import the exact same compiled Prisma client and share a single connection pool model if desired.
3. **Root .env Resolution for Prisma**: To ensure `DATABASE_URL` is correctly loaded when running Prisma commands inside `packages/database` (which has a separate working directory), we will use `dotenv-cli` in the package's scripts to explicitly load the root-level `.env` file (located two levels up: `../../.env`).

## Proposed Changes

We will scaffold the project structure as follows:

```
platform/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── admin-web/
│   └── guest-member-pwa/
├── packages/
│   ├── database/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── generated/   (excluded from git)
│   │   └── package.json
│   ├── shared-middleware/
│   └── shared-types/
├── services/
│   ├── identity-auth/
│   ├── notification/
│   ├── payment/
│   ├── slot-engine/
│   └── tenant-management/
├── .env.example
├── .env
├── .gitignore
├── docker-compose.yml
├── eslint.config.js
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

### Root Configuration

We will initialize the monorepo root config to manage pnpm workspaces, define shared dependencies (like TypeScript, ESLint, Prettier), and implement monorepo-wide scripts.

#### [NEW] [pnpm-workspace.yaml](file:///d:/apps/Platform/pnpm-workspace.yaml)
Defines the workspaces in the monorepo:
```yaml
packages:
  - 'services/*'
  - 'apps/*'
  - 'packages/*'
```

#### [NEW] [package.json](file:///d:/apps/Platform/package.json)
Configures root scripts for managing the workspaces, running lint and typecheck recursively, and dev dependencies.
```json
{
  "name": "badminton-platform",
  "private": true,
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "db:up": "docker-compose up -d",
    "db:down": "docker-compose down",
    "prisma:generate": "pnpm --filter @badminton/database run prisma:generate",
    "prisma:migrate": "pnpm --filter @badminton/database run prisma:migrate",
    "lint": "eslint .",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.2.5",
    "prisma": "^5.14.0",
    "dotenv-cli": "^7.4.2"
  }
}
```

#### [NEW] [tsconfig.json](file:///d:/apps/Platform/tsconfig.json)
Base compiler options inherited by all workspaces.
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

#### [NEW] [docker-compose.yml](file:///d:/apps/Platform/docker-compose.yml)
Configures local PostgreSQL. Host port is mapped to `65432` to avoid conflicts on the default port `5432`. Internally in the container, PostgreSQL runs on standard port `5432`. The deprecated `version` key has been removed.
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: badminton_postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgrespassword
      POSTGRES_DB: badminton_db
    ports:
      - "65432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

#### [NEW] [.env.example](file:///d:/apps/Platform/.env.example) & [.env](file:///d:/apps/Platform/.env)
Local environment configuration for database connection pointing to port `65432`.
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public"
```

#### [NEW] [.gitignore](file:///d:/apps/Platform/.gitignore)
Standard gitignore to exclude environment variables, dependency folders, build output, and generated prisma outputs.
```
node_modules/
dist/
.env
packages/database/src/generated/
```

#### [NEW] [eslint.config.js](file:///d:/apps/Platform/eslint.config.js)
Simple ESLint configuration to check and lint code formatting and TypeScript rules across all packages.

---

### Centralized Database Package (`packages/database`)

We will create a centralized workspace package to own the database schema, migrations, client generation, and exports.

#### [NEW] [packages/database/package.json](file:///d:/apps/Platform/packages/database/package.json)
Uses `dotenv-cli` to resolve and load the root-level `.env` file explicitly when executing migrations, client generation, and other database commands.
```json
{
  "name": "@badminton/database",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "prisma:generate": "dotenv -e ../../.env -- prisma generate",
    "prisma:migrate": "dotenv -e ../../.env -- prisma migrate dev",
    "prisma:deploy": "dotenv -e ../../.env -- prisma migrate deploy",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "^5.14.0"
  },
  "devDependencies": {
    "prisma": "^5.14.0",
    "dotenv-cli": "^7.4.2",
    "typescript": "^5.4.5"
  }
}
```

#### [NEW] [packages/database/tsconfig.json](file:///d:/apps/Platform/packages/database/tsconfig.json)
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

#### [NEW] [packages/database/prisma/schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)
Initializes Prisma schema targeting local Postgres, featuring a minimal `Tenant` model to allow initial migration tests. It defines custom client output location within the package.
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client"
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

#### [NEW] [packages/database/src/index.ts](file:///d:/apps/Platform/packages/database/src/index.ts)
Exports the PrismaClient generated centrally.
```typescript
export * from './generated/client';
```

---

### Shared Packages

#### [NEW] [shared-types](file:///d:/apps/Platform/packages/shared-types)
Provides common TypeScript types and API interfaces.
- Contains `packages/shared-types/package.json` (defines `@badminton/shared-types`)
- Contains `packages/shared-types/tsconfig.json`
- Contains `packages/shared-types/src/index.ts` (exports initial response structure interfaces)

#### [NEW] [shared-middleware](file:///d:/apps/Platform/packages/shared-middleware)
Implements standard Fastify response enveloping and error handler, satisfying `api_standards_cross_cutting.md` Section 2.
- Contains `packages/shared-middleware/package.json` (defines `@badminton/shared-middleware`, depends on `fastify`)
- Contains `packages/shared-middleware/tsconfig.json`
- Contains `packages/shared-middleware/src/index.ts` which exports:
  - `responseEnvelopePlugin`: A Fastify plugin registering `preSerialization` and `setErrorHandler` hooks to ensure response consistency.
  - Types for enveloped payloads.

---

### Services Scaffolding

Scaffolds placeholders for all 5 backend services using TypeScript and Fastify.
Each service will have:
- `package.json` (e.g. `@badminton/slot-engine`, depends on `@badminton/shared-middleware` and `@badminton/database`)
- `tsconfig.json`
- `src/index.ts` containing a basic Fastify server registering the `responseEnvelopePlugin` to prove it works.

Workspaces:
1. [NEW] [services/slot-engine](file:///d:/apps/Platform/services/slot-engine)
2. [NEW] [services/identity-auth](file:///d:/apps/Platform/services/identity-auth)
3. [NEW] [services/tenant-management](file:///d:/apps/Platform/services/tenant-management)
4. [NEW] [services/payment](file:///d:/apps/Platform/services/payment)
5. [NEW] [services/notification](file:///d:/apps/Platform/services/notification)

---

### Apps Scaffolding

Scaffolds placeholders for the frontends.
Workspaces:
1. [NEW] [apps/guest-member-pwa](file:///d:/apps/Platform/apps/guest-member-pwa)
2. [NEW] [apps/admin-web](file:///d:/apps/Platform/apps/admin-web)

Each will have a minimal Vite React setup (package.json, tsconfig.json, index.html, src/main.tsx) to ensure typechecking works.

---

### CI Workflow

#### [NEW] [ci.yml](file:///d:/apps/Platform/.github/workflows/ci.yml)
Runs on pull requests and pushes. Installs dependencies and runs `pnpm lint` and `pnpm typecheck` to verify the codebase's integrity.

```yaml
name: CI

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run lint
        run: pnpm run lint

      - name: Run typecheck
        run: pnpm run typecheck
```

## Verification Plan

### Automated Tests
- Running `pnpm install` should succeed.
- Running `pnpm run lint` and `pnpm run typecheck` locally must pass without errors.
- Running `docker-compose up -d` should spin up a local PostgreSQL container.
- Running `pnpm prisma:migrate --name init` from the repository root should connect to the local container and successfully apply migrations.

### Manual Verification
- We will boot one of the backend services (e.g. `services/slot-engine`) and trigger a dummy route to verify that:
  - Valid responses are automatically wrapped as `{ "data": ... }`.
  - Triggered errors are caught and returned as `{ "error": { "code": ..., "message": ... } }`.
