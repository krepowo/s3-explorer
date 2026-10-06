# S3 Explorer

Public file sharing on top of any S3-compatible storage (Cloudflare R2, Amazon
S3, Backblaze B2, SeaweedFS, MinIO). Staff upload files and immediately get a
deterministic public URL that anyone can open — no account, no login:

```
https://cdn.<your-domain>/files/<uploader-token>/<filename>
```

File bytes never pass through the app: uploads go browser → storage via a
presigned PUT, and downloads go straight from the public bucket or CDN. S3
credentials stay encrypted on the server.

## Roles

| Role | Can do |
| --- | --- |
| **Admin** | Manage users, S3 connections, upload limits, audit log, rotate tokens |
| **Uploader** | Upload, browse the shared pool, preview (including video) and edit text files |
| **Guest** | Download via a public link only |

Every authenticated user sees the **shared pool** — all files, not just their own.

To upload, drag files anywhere onto the **Files** page or use the Upload button —
either way the files are only *staged* in the dialog: pick a connection (defaults
to the primary) and press Upload, and nothing reaches storage before that. The
card view and the dashboard show a real thumbnail for images and videos, and an
icon for everything else.

Select files with the checkboxes (table view also has a select-all header box) to
act on several at once — the selection bar deletes the whole selection, and the
selection is intersected with what is on screen so a search never leaves it
pointing at something you cannot see.

A file name is styled as a link and a single click on it opens the preview; a
loading popup appears straight away while the content URL is fetched. Clicking
anywhere else in the row or the card does nothing.

## Stack

- **Runtime:** Bun 1.3+ (TypeScript 5.9, ESM)
- **Framework:** Next.js 16 App Router, React 19
- **UI:** Material UI v9 (`cssVariables` theme), Monaco for the text editor
- **Database:** PostgreSQL (Neon) via Prisma 7 with the `@prisma/adapter-pg` driver adapter
- **Storage:** any S3-compatible endpoint (`@aws-sdk/client-s3` + request presigner)
- **Auth:** httpOnly session cookie, argon2id passwords
- **Tests:** Vitest (unit + integration), Playwright (e2e)

## Local development

### 1. Install

```bash
bun install
```

### 2. Start a local S3

This project uses [SeaweedFS](https://github.com/seaweedfs/seaweedfs) — a single
binary, no Docker. Download the Windows build from its releases and unpack
`weed.exe` to `.weed/bin/weed.exe`.

```bash
bun run s3:dev          # weed mini -dir=./.weed-data
```

Then create the buckets and make them publicly readable:

```bash
echo "s3.bucket.create -name s3-explorer" | weed shell -master=localhost:9333
echo "s3.bucket.create -name s3-explorer-test" | weed shell -master=localhost:9333
echo "s3.anonymous.set -bucket s3-explorer -access Read,List" | weed shell -master=localhost:9333
echo "s3.anonymous.set -bucket s3-explorer-test -access Read,List" | weed shell -master=localhost:9333
```

`S3_BUCKET` must point at a **throwaway** bucket (`s3-explorer-test`), never the one
your connections use. The integration suites create and delete objects there, and one
of them runs the orphan sweeper with no grace period; against a shared bucket that
sweep deletes real uploads. The suites refuse to run when the bucket is shared with a
non-test connection.

Always pass `-dir`; without it SeaweedFS writes its state into the repository root.

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres connection (runtime) |
| `DIRECT_URL` | Direct Postgres connection (migrations) |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 of exactly 32 bytes — encrypts S3 credentials |
| `SESSION_SECRET` | at least 32 characters |
| `CRON_SECRET` | optional; guards the cron endpoints |
| `S3_*` | local S3 endpoint, used by the integration tests |

Generate the two secrets:

```bash
openssl rand -base64 32   # CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32      # SESSION_SECRET
```

### 4. Migrate and seed

```bash
bun run db:migrate      # prisma migrate dev
bun run db:seed         # creates the first admin (admin@example.com / changeme123)
```

Change the seeded password before anyone else can reach the instance.

### 5. Run

```bash
bun run dev             # http://localhost:3000
```

Sign in as the admin, add an S3 connection under **Connections**, create an
uploader under **Users**, and assign that connection to them.

## Commands

```
bun run dev            Development server
bun run build          Production build
bun run start          Serve the production build
bun run typecheck      tsc --noEmit
bun run lint           eslint
bun run test           Vitest (unit + integration)
bun run test:e2e       Playwright
bun run db:migrate     prisma migrate dev
bun run db:deploy      prisma migrate deploy
bun run db:seed        Seed the first admin
bun run db:studio      Prisma Studio
bun run s3:dev         Local SeaweedFS
```

Integration tests write throwaway rows to the configured database and objects to
the configured bucket, then clean up after themselves. They **skip** when
`S3_ENDPOINT` is unset or the endpoint is not reachable, so they are safe to run
without local storage. Never point them at production storage.

Playwright uses Chrome already installed on the machine instead of downloading
its own build:

```bash
E2E_CHROME="/path/to/chrome.exe" bun run test:e2e
```

## Deploying to Vercel + Neon

### 1. Neon

Create a project in the region closest to your users. Copy both connection
strings: the **pooled** one (has `-pooler` in the host) and the **direct** one.

- `DATABASE_URL` → pooled, append `?pgbouncer=true&connection_limit=1`
- `DIRECT_URL` → direct, used by `prisma migrate deploy`

### 2. Vercel

Set the project region to match Neon (`sin1` is configured in `vercel.json`).

Environment variables to add for Production and Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled Neon connection string |
| `DIRECT_URL` | direct Neon connection string |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 of 32 bytes — **never change this once data exists**, it would make stored credentials unreadable |
| `SESSION_SECRET` | 32+ random characters |
| `CRON_SECRET` | random string; Vercel sends it as `Authorization: Bearer` |

Then add the same values as GitHub Actions secrets so CI can run migrations:

`DATABASE_URL`, `DIRECT_URL`, `CREDENTIAL_ENCRYPTION_KEY`.

Migrations run in the `migrate` job on pushes to `main` — never at runtime.

### 3. Public CDN domain

The bucket must be publicly readable, and `publicBaseUrl` on each connection
points at the domain serving it.

- **Cloudflare R2:** attach a Custom Domain to the bucket. Works directly, and
  Cloudflare caches it.
- **Amazon S3:** put CloudFront in front of the public bucket, then point a
  custom domain at CloudFront. A CNAME straight to the S3 REST endpoint is not
  supported, and the S3 website endpoint is not HTTPS.

Set `publicBaseUrl` to that domain with **no trailing slash**, e.g.
`https://cdn.example.com`.

### 4. Browser uploads need the bucket's CORS policy

Uploads go straight from the browser to the bucket, so the bucket has to answer
the preflight for the app's own origin. R2 returns a 403 until the policy names
that origin, and the browser reports it as an opaque failure — the PUT itself was
never sent, which is why the bytes look like they died on the network.

The app writes the rule itself: saving an R2 connection, and every presign, adds
the caller's origin to the bucket's CORS policy, keeping whatever rules are
already there. No dashboard step is needed, but the connection's credentials must
be allowed to read and edit the bucket's CORS settings.

### 5. Cron jobs

`vercel.json` registers two daily jobs, both authenticated with `CRON_SECRET`:

| Path | Schedule | Job |
| --- | --- | --- |
| `/api/cron/orphan-cleanup` | 03:00 | Reconcile objects against the database |
| `/api/cron/audit-retention` | 04:00 | Delete audit rows older than 90 days |

Run either by hand with `?dryRun=1` to see what it would do:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-app.vercel.app/api/cron/orphan-cleanup?dryRun=1"
```

The cleanup leaves objects younger than 24 hours alone, because a file exists in
storage between its presigned PUT and its registration.

### Serverless limits

Vercel Functions cap request and response bodies at 4.5 MB. This design avoids
that entirely — uploads use presigned PUTs and downloads use public URLs, so no
file bytes flow through a function. The only content a function handles is text
for the editor, which is capped at 5 MB by the app itself.

## How it works

```
Browser ──presign──▶ /api/uploads/presign ──▶ S3 (signs a PUT)
   │
   └──PUT bytes─────────────────────────────▶ S3
   │
   └──register──▶ /api/uploads/register ──▶ HeadObject, then write the row
```

- **Object key:** `files/<uploader-token>/<filename>`
- **Public URL:** `<connection.publicBaseUrl>/files/<token>/<filename>`
- **Namespace token:** 5 lowercase letters, e.g. `files/qmzfd/photo.jpg`. It is not a
  secret — the bucket is public and every signed-in user sees the whole pool — so it is
  short and readable rather than long and random. Tokens created before this change are
  still 32 hex characters and keep working; rotating a user issues the new format.
- **Collisions:** `file.zip` → `file-1.zip`, per uploader namespace
- **Names** are sanitised to their final path segment, so a key can never escape
  its prefix
- **Upload limit:** per user, default 2 GB
- **Primary connection:** the default bucket for uploads. An admin marks one under
  **Connections**; a connection assigned to a specific user always wins over it
- **Thumbnails** load straight from the public URL — no thumbnail pipeline — so the
  grid downloads the originals. Add server-side thumbnails if the pool grows to hold
  multi-megabyte photos
- **Rotating a token** moves every object to the new prefix, which is what makes
  the old links stop working — changing the token alone would not, because the
  bucket is public

## Project layout

```
prisma/           schema + migrations
src/app/          routes: (auth) login, (app) authenticated pages, api handlers
src/components/   UI: layout shell, files, connections, preview
src/lib/          auth, connections, uploads, preview, public-links, audit, s3, crypto
src/lib/maintenance/  orphan cleanup
tests/            unit + integration
e2e/              Playwright specs
```

## License

Private.
