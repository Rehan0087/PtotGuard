import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupServer } from "msw/node";

Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: new URL("http://localhost"),
});

const { handlers } = await import("./handlers.ts");
const { notifications } = await import("./data.ts");

const server = setupServer(...handlers);
const api = "http://localhost/api";

const auth = (userId) => ({
  authorization: `Bearer mock.${userId}.access`,
  "content-type": "application/json",
});

before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());

test("every authenticated role can read the shared community feed", async () => {
  for (const userId of ["usr-ayesha", "usr-officer", "usr-agent", "usr-mediator", "usr-admin"]) {
    const response = await fetch(`${api}/community`, { headers: auth(userId) });
    assert.equal(response.status, 200, userId);
    assert.ok((await response.json()).length >= 2, userId);
  }
});

test("only the land office can announce and an announcement reaches other users", async () => {
  const refused = await fetch(`${api}/community`, {
    method: "POST",
    headers: auth("usr-ayesha"),
    body: JSON.stringify({ title: "Citizen notice", body: "This must stay a discussion.", kind: "announcement" }),
  });
  assert.equal(refused.status, 403);

  const beforeCount = notifications.filter((item) => item.userId === "usr-ayesha").length;
  const response = await fetch(`${api}/community`, {
    method: "POST",
    headers: auth("usr-officer"),
    body: JSON.stringify({ title: "Registry service window", body: "The service window opens at ten tomorrow.", kind: "announcement" }),
  });
  assert.equal(response.status, 201);
  const post = await response.json();
  assert.equal(post.kind, "announcement");
  assert.equal(notifications.filter((item) => item.userId === "usr-ayesha").length, beforeCount + 1);
});

test("comments and Reddit-style votes update a post and repeat votes toggle off", async () => {
  const created = await fetch(`${api}/community`, {
    method: "POST",
    headers: auth("usr-ayesha"),
    body: JSON.stringify({ title: "Survey documents", body: "Which documents should I bring?", kind: "discussion" }),
  }).then((response) => response.json());

  const commented = await fetch(`${api}/community/${created.id}/comments`, {
    method: "POST",
    headers: auth("usr-agent"),
    body: JSON.stringify({ body: "Bring the deed, khatian, and survey map." }),
  }).then((response) => response.json());
  assert.equal(commented.commentCount, 1);
  assert.equal(commented.comments[0].authorRole, "field-agent");

  const upvoted = await fetch(`${api}/community/${created.id}/vote`, {
    method: "POST",
    headers: auth("usr-mediator"),
    body: JSON.stringify({ value: 1 }),
  }).then((response) => response.json());
  assert.equal(upvoted.score, 1);
  assert.equal(upvoted.viewerVote, 1);

  const toggled = await fetch(`${api}/community/${created.id}/vote`, {
    method: "POST",
    headers: auth("usr-mediator"),
    body: JSON.stringify({ value: 1 }),
  }).then((response) => response.json());
  assert.equal(toggled.score, 0);
  assert.equal(toggled.viewerVote, 0);
});
