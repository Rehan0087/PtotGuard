import assert from "node:assert/strict";
import test from "node:test";
import { communityComments, communityPosts, users } from "./data.ts";

test("community fixture relationships are complete and internally consistent", () => {
  const userIds = new Set(users.map((user) => user.id));
  const postIds = new Set(communityPosts.map((post) => post.id));
  const commentIds = new Set(communityComments.map((comment) => comment.id));

  for (const post of communityPosts) {
    assert.ok(userIds.has(post.authorId), `${post.id} has a missing author`);
    assert.equal(post.author.id, post.authorId);
    assert.equal(
      post._count.comments,
      communityComments.filter((comment) => comment.postId === post.id).length,
      `${post.id} has a stale comment count`,
    );
    assert.equal(post._count.votes, post.votes.length, `${post.id} has a stale vote count`);
    assert.equal(new Set(post.votes.map((vote) => vote.userId)).size, post.votes.length);
  }

  for (const comment of communityComments) {
    assert.ok(postIds.has(comment.postId), `${comment.id} has a missing post`);
    assert.ok(userIds.has(comment.authorId), `${comment.id} has a missing author`);
    assert.equal(comment.author.id, comment.authorId);
    if (comment.parentId) {
      const parent = communityComments.find((candidate) => candidate.id === comment.parentId);
      assert.ok(parent, `${comment.id} has a missing parent`);
      assert.equal(parent.postId, comment.postId, `${comment.id} replies across posts`);
    }
    assert.equal(new Set(comment.votes.map((vote) => vote.userId)).size, comment.votes.length);
  }

  assert.equal(commentIds.size, communityComments.length);
});
