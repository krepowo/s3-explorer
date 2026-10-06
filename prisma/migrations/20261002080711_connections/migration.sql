-- CreateEnum
CREATE TYPE "S3Provider" AS ENUM ('r2', 's3', 'b2', 'minio', 'other');

-- CreateTable
CREATE TABLE "S3Connection" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" "S3Provider" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "bucket" TEXT NOT NULL,
    "publicBaseUrl" TEXT NOT NULL,
    "accessKeyIdEnc" TEXT NOT NULL,
    "secretAccessKeyEnc" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "S3Connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "S3Connection_isActive_idx" ON "S3Connection"("isActive");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_assignedConnectionId_fkey" FOREIGN KEY ("assignedConnectionId") REFERENCES "S3Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
