/*
  Warnings:

  - Added the required column `name` to the `Admin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "name" TEXT DEFAULT 'Owner';
UPDATE "Admin" SET "name" = 'Owner' WHERE "name" IS NULL;
ALTER TABLE "Admin" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Admin" ALTER COLUMN "name" DROP DEFAULT;
