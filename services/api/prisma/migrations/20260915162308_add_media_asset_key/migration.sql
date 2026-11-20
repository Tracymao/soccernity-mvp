/*
  Warnings:

  - Added the required column `key` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "key" TEXT NOT NULL;
