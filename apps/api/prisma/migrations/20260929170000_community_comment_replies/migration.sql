ALTER TABLE "community_comments" ADD COLUMN "parentId" TEXT;

CREATE INDEX "community_comments_parentId_idx" ON "community_comments"("parentId");

ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
