-- AlterTable
ALTER TABLE "S3Connection" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- An existing install should have a working default straight away: the oldest
-- connection becomes primary until an admin picks another one.
UPDATE "S3Connection" SET "isPrimary" = true
WHERE "id" = (SELECT "id" FROM "S3Connection" ORDER BY "createdAt" ASC LIMIT 1);
