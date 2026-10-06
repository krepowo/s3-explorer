# S3 Explorer

Public file sharing on top of any S3-compatible storage (Cloudflare R2, Amazon
S3, Backblaze B2, SeaweedFS, MinIO). Staff upload a file and get a public URL
that anyone can open, with no account and no login:

```
https://cdn.<your-domain>/files/<uploader-token>/<filename>
```

File bytes never pass through the app. Uploads go from the browser straight to
the bucket with a presigned PUT, and downloads come from the public bucket or
CDN. S3 credentials stay encrypted on the server.

## Features

- Multi-connection S3 support, with credentials encrypted at rest
- Admin, uploader, and guest roles
- Drag and drop uploads, staged so you pick the bucket before anything is sent
- Thumbnails for images and videos, in the card view and on the dashboard
- In-app preview for images, video, audio, PDF, and text, plus a text editor
- Shared pool: every signed-in user sees all files
- Audit log, per-user upload limits, token rotation
- No file bytes through the server, so serverless body limits never apply

## Roles

| Role | Can do |
| --- | --- |
| Admin | Manage users, connections, upload limits, audit log, token rotation |
| Uploader | Upload, browse the shared pool, preview and edit text files |
| Guest | Download through a public link only |

## Stack

- Runtime: Bun 1.3+ (TypeScript 5.9, ESM)
- Framework: Next.js 16 App Router, React 19
- UI: Material UI v9 with a `cssVariables` theme, Monaco for the editor
- Database: PostgreSQL through Prisma 7 and the `@prisma/adapter-pg` driver adapter
- Storage: any S3-compatible endpoint, via `@aws-sdk/client-s3` and the request presigner
- Auth: httpOnly session cookie, argon2id password hashing
- Tests: Vitest for unit and integration, Playwright for e2e

## Quick start

Requires Bun 1.3+ and a Postgres database (Neon has a free tier).

```bash
bun install
cp .env.example .env.local     # then fill it in, see below
bun run db:migrate             # create the tables
bun run db:seed                # first admin: admin@example.com / changeme123
bun run dev                    # http://localhost:3000
```

Change the seeded password before anyone else can reach the instance.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | pooled Postgres connection, used at runtime |
| `DIRECT_URL` | direct Postgres connection, used by migrations |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 of exactly 32 bytes, encrypts the stored S3 credentials |
| `SESSION_SECRET` | at least 32 characters |
| `CRON_SECRET` | optional, guards the cron endpoints |
| `S3_*` | local S3 endpoint, used only by the integration tests |

Generate the two secrets:

```bash
openssl rand -base64 32   # CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32      # SESSION_SECRET
```

### Local S3 (optional)

Integration tests and local uploads need an S3 endpoint.
[SeaweedFS](https://github.com/seaweedfs/seaweedfs) is a single binary with no
Docker: download the build for your platform and unpack `weed.exe` to
`.weed/bin/`.

```bash
bun run s3:dev          # weed mini -dir=./.weed-data, S3 on :8333
```

Then create the buckets and make them publicly readable:

```bash
echo "s3.bucket.create -name s3-explorer" | weed shell -master=localhost:9333
echo "s3.bucket.create -name s3-explorer-test" | weed shell -master=localhost:9333
echo "s3.anonymous.set -bucket s3-explorer -access Read,List" | weed shell -master=localhost:9333
echo "s3.anonymous.set -bucket s3-explorer-test -access Read,List" | weed shell -master=localhost:9333
```

`S3_BUCKET` must point at a throwaway bucket (`s3-explorer-test`), never one your
connections use. The integration suites create and delete objects there, and one
of them runs the orphan sweeper with no grace period, so against a shared bucket
it deletes real uploads. The suites refuse to run when the bucket is shared with
a non-test connection. Always pass `-dir`, otherwise SeaweedFS writes its state
into the repository root.

## Commands

```
bun run dev            Development server
bun run build          Production build
bun run start          Serve the production build
bun run typecheck      tsc --noEmit
bun run lint           eslint
bun run test           Vitest, unit and integration
bun run test:e2e       Playwright
bun run db:migrate     prisma migrate dev
bun run db:deploy      prisma migrate deploy
bun run db:seed        Seed the first admin
bun run db:studio      Prisma Studio
bun run s3:dev         Local SeaweedFS
```

Integration tests write throwaway rows and objects, then clean up after
themselves. They skip when `S3_ENDPOINT` is unset or the endpoint is
unreachable, so they are safe to run without local storage. Never point them at
production storage.

Playwright uses a Chrome already installed on the machine instead of downloading
its own build:

```bash
E2E_CHROME="/path/to/chrome.exe" bun run test:e2e
```

## Deploy

### 1. Database

Create a Neon project near your users and copy both connection strings, the
pooled one and the direct one.

- `DATABASE_URL`: pooled, append `?pgbouncer=true&connection_limit=1`
- `DIRECT_URL`: direct, used by `prisma migrate deploy`

### 2. Vercel

Set the project region to match Neon (`sin1` is configured in `vercel.json`), then
add these environment variables for Production and Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled Neon connection string |
| `DIRECT_URL` | direct Neon connection string |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 of 32 bytes, and **never change it once data exists**, or the stored credentials become unreadable |
| `SESSION_SECRET` | 32+ random characters |
| `CRON_SECRET` | random string, sent by Vercel as an `Authorization` header |

Add `DATABASE_URL`, `DIRECT_URL`, and `CREDENTIAL_ENCRYPTION_KEY` as GitHub
Actions secrets too, so CI can run migrations. Migrations run in the `migrate`
job on pushes to `main`, never at runtime.

### 3. Public domain

The bucket has to be publicly readable, and each connection's `publicBaseUrl`
points at the domain serving it. Set it with no trailing slash, for example
`https://cdn.example.com`.

- Cloudflare R2: attach a Custom Domain to the bucket. Cloudflare caches it.
- Amazon S3: put CloudFront in front of the bucket and point a custom domain at
  CloudFront. A CNAME straight to the S3 REST endpoint is not supported, and the
  S3 website endpoint is not HTTPS.

### 4. Bucket CORS

Uploads go from the browser straight to the bucket, so the bucket has to answer
the preflight for the app's own origin. R2 returns a 403 until its CORS policy
names that origin, and the browser reports that as an opaque failure: the PUT is
never sent, so it looks like the bytes died on the network.

The app writes the rule itself. Saving an R2 connection, and every presign, adds
the caller's origin to the bucket's CORS policy and keeps whatever rules are
already there. No dashboard step is needed, but the connection's credentials must
be allowed to read and edit the bucket's CORS settings.

### 5. Cron

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
that: uploads use presigned PUTs and downloads use public URLs, so no file bytes
flow through a function. The only content a function handles is editor text,
capped at 5 MB by the app itself.

## How it works

```
Browser --presign--> /api/uploads/presign --> S3 (signs a PUT)
   |
   +--PUT bytes---------------------------> S3
   |
   +--register--> /api/uploads/register --> HeadObject, then write the row
```

- Object key: `files/<uploader-token>/<filename>`
- Public URL: `<connection.publicBaseUrl>/files/<token>/<filename>`
- Namespace token: 5 lowercase letters, for example `files/qmzfd/photo.jpg`. It
  is not a secret, because the bucket is public and every signed-in user sees the
  whole pool, so it stays short and readable. Tokens created before this change
  are still 32 hex characters and keep working; rotating a user issues the new
  format.
- Collisions: `file.zip` becomes `file-1.zip`, per uploader namespace
- Names are sanitised to their final path segment, so a key can never escape its
  prefix
- Upload limit: per user, 2 GB by default
- Primary connection: the default bucket for uploads. An admin marks one under
  Connections, and a connection assigned to a specific user always wins over it
- Thumbnails load straight from the public URL, with no thumbnail pipeline, so
  the grid downloads the originals. Add server-side thumbnails if the pool grows
  to hold multi-megabyte photos
- Rotating a token moves every object to the new prefix, which is what makes the
  old links stop working. Changing the token alone would not, because the bucket
  is public

## Project layout

```
prisma/               schema and migrations
src/app/              routes: (auth) login, (app) pages, api handlers
src/components/       UI: layout shell, files, connections, preview
src/lib/              auth, connections, uploads, preview, public-links, audit, s3, crypto
src/lib/maintenance/  orphan cleanup
tests/                unit and integration
e2e/                  Playwright specs
```

## License

MIT. See [LICENSE](LICENSE).
