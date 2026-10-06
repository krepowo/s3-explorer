-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL,
    "etag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadedFile_ownerId_idx" ON "UploadedFile"("ownerId");

-- CreateIndex
CREATE INDEX "UploadedFile_createdAt_idx" ON "UploadedFile"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_connectionId_key_key" ON "UploadedFile"("connectionId", "key");

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "S3Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
