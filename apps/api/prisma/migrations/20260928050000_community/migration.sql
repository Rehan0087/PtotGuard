-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_votes" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "community_votes_value_check" CHECK ("value" IN (-1, 1)),
    CONSTRAINT "community_votes_target_check" CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "community_posts_authorId_idx" ON "community_posts"("authorId");
CREATE INDEX "community_posts_createdAt_idx" ON "community_posts"("createdAt");
CREATE INDEX "community_comments_postId_idx" ON "community_comments"("postId");
CREATE INDEX "community_comments_authorId_idx" ON "community_comments"("authorId");
CREATE INDEX "community_comments_parentId_idx" ON "community_comments"("parentId");
CREATE INDEX "community_votes_userId_idx" ON "community_votes"("userId");
CREATE INDEX "community_votes_postId_idx" ON "community_votes"("postId");
CREATE INDEX "community_votes_commentId_idx" ON "community_votes"("commentId");
CREATE UNIQUE INDEX "community_votes_userId_postId_key" ON "community_votes"("userId", "postId");
CREATE UNIQUE INDEX "community_votes_userId_commentId_key" ON "community_votes"("userId", "commentId");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
