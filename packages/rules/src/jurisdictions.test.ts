import { describe, expect, it } from "vitest";
import {
  ancestryOf,
  buildTree,
  childLevelOf,
  countByLevel,
  deletionGate,
  descendantIds,
  eligibleParents,
  parentLevelOf,
  reviewDraft,
  suggestCode,
  usageOf,
  type JurisdictionDraft,
} from "./jurisdictions";
import type { Jurisdiction, Parcel, User } from "./types";

/**
 * Cumilla, one branch deep on every rung:
 *
 *   Chattogram (division)
 *   └ Cumilla (district)
 *     └ Debidwar (upazila)
 *       ├ Payalgacha (mouza)
 *       └ Rajamehar (mouza)
 */
const TREE: Jurisdiction[] = [
  { id: "j-ctg", name: "Chattogram", code: "CTG", level: "division", parentId: null },
  { id: "j-cum", name: "Cumilla", code: "CTG-CUM", level: "district", parentId: "j-ctg" },
  { id: "j-deb", name: "Debidwar", code: "CTG-CUM-DEB", level: "upazila", parentId: "j-cum" },
  { id: "j-raj", name: "Rajamehar", code: "CTG-CUM-DEB-RAJ", level: "mouza", parentId: "j-deb" },
  { id: "j-pay", name: "Payalgacha", code: "CTG-CUM-DEB-PAY", level: "mouza", parentId: "j-deb" },
];

const user = (id: string, jurisdictionId: string) => ({ id, jurisdictionId }) as User;
const parcel = (id: string, jurisdictionId: string) => ({ id, jurisdictionId }) as Parcel;

/** A valid new mouza under Debidwar, for tests that vary one field at a time. */
function draft(over: Partial<JurisdictionDraft> = {}): JurisdictionDraft {
  return {
    name: "Barera",
    code: "CTG-CUM-DEB-BAR",
    level: "mouza",
    parentId: "j-deb",
    ...over,
  };
}

describe("the ladder", () => {
  it("puts each level exactly one rung under its parent", () => {
    expect(parentLevelOf("mouza")).toBe("upazila");
    expect(parentLevelOf("upazila")).toBe("district");
    expect(parentLevelOf("district")).toBe("division");
  });

  it("gives a division no parent and a mouza no children", () => {
    expect(parentLevelOf("division")).toBeNull();
    expect(childLevelOf("mouza")).toBeNull();
  });

  it("counts the tree by rung", () => {
    expect(countByLevel(TREE)).toEqual({ division: 1, district: 1, upazila: 1, mouza: 2 });
  });
});

describe("buildTree", () => {
  it("roots at the nodes with no parent and nests the rest by depth", () => {
    const { roots } = buildTree(TREE);

    expect(roots).toHaveLength(1);
    expect(roots[0].jurisdiction.name).toBe("Chattogram");
    expect(roots[0].depth).toBe(0);
    expect(roots[0].children[0].jurisdiction.name).toBe("Cumilla");
    expect(roots[0].children[0].depth).toBe(1);
  });

  it("sorts siblings by name", () => {
    const debidwar = buildTree(TREE).roots[0].children[0].children[0];

    expect(debidwar.children.map((c) => c.jurisdiction.name)).toEqual([
      "Payalgacha",
      "Rajamehar",
    ]);
  });

  it("surfaces a node whose parent no longer exists rather than dropping it", () => {
    // A jurisdiction nobody can see is one nobody can fix.
    const orphan: Jurisdiction = {
      id: "j-ghost",
      name: "Ghost Mouza",
      code: "X-GHO",
      level: "mouza",
      parentId: "j-deleted",
    };
    const { roots, unreachable } = buildTree([...TREE, orphan]);

    expect(unreachable.map((j) => j.id)).toEqual(["j-ghost"]);
    expect(roots).toHaveLength(1);
  });

  // Note on the `visited` guard inside build(): every node carries exactly one
  // parentId, so a node in a cycle can never also have a root ancestor — a cycle
  // is always disconnected from the roots, and the walk reaches it only as
  // `unreachable`. The guard is therefore defence in depth that well-formed
  // data cannot exercise, and removing it fails no test here. What is asserted
  // instead is the behaviour that is observable: a cycle terminates and is
  // reported rather than silently dropped.
  it("does not recurse forever on a cycle, and reports both nodes", () => {
    const a: Jurisdiction = { id: "a", name: "A", code: "A", level: "upazila", parentId: "b" };
    const b: Jurisdiction = { id: "b", name: "B", code: "B", level: "mouza", parentId: "a" };
    const { roots, unreachable } = buildTree([a, b]);

    expect(roots).toEqual([]);
    expect(unreachable.map((j) => j.id).sort()).toEqual(["a", "b"]);
  });
});

describe("descendantIds and ancestryOf", () => {
  it("finds every node beneath one, at any depth", () => {
    expect([...descendantIds("j-cum", TREE)].sort()).toEqual(["j-deb", "j-pay", "j-raj"]);
  });

  it("excludes the node itself", () => {
    expect(descendantIds("j-cum", TREE).has("j-cum")).toBe(false);
  });

  it("returns nothing for a leaf", () => {
    expect(descendantIds("j-raj", TREE).size).toBe(0);
  });

  it("terminates on a malformed cycle", () => {
    const a: Jurisdiction = { id: "a", name: "A", code: "A", level: "upazila", parentId: "b" };
    const b: Jurisdiction = { id: "b", name: "B", code: "B", level: "mouza", parentId: "a" };

    expect(() => descendantIds("a", [a, b])).not.toThrow();
  });

  it("reads the chain from the root down, the node last", () => {
    expect(ancestryOf("j-raj", TREE).map((j) => j.name)).toEqual([
      "Chattogram",
      "Cumilla",
      "Debidwar",
      "Rajamehar",
    ]);
  });

  it("terminates rather than looping on a broken chain", () => {
    const a: Jurisdiction = { id: "a", name: "A", code: "A", level: "upazila", parentId: "b" };
    const b: Jurisdiction = { id: "b", name: "B", code: "B", level: "mouza", parentId: "a" };

    expect(() => ancestryOf("a", [a, b])).not.toThrow();
  });
});

describe("eligibleParents", () => {
  it("offers only the rung directly above", () => {
    expect(eligibleParents("mouza", TREE).map((j) => j.id)).toEqual(["j-deb"]);
    expect(eligibleParents("upazila", TREE).map((j) => j.id)).toEqual(["j-cum"]);
  });

  it("offers nothing to a division", () => {
    expect(eligibleParents("division", TREE)).toEqual([]);
  });

  it("never offers a node its own subtree as a home", () => {
    // Re-parenting Cumilla under Debidwar would strand both.
    const options = eligibleParents("district", [...TREE], "j-cum");

    expect(options.map((j) => j.id)).not.toContain("j-cum");
  });

  it("excludes a descendant even when it sits at the right level", () => {
    const sibling: Jurisdiction = {
      id: "j-other",
      name: "Other District",
      code: "CTG-OTH",
      level: "district",
      parentId: "j-ctg",
    };
    // Debidwar promoted to district would be its own subtree's parent.
    const all = [...TREE, sibling];
    const options = eligibleParents("upazila", all, "j-cum");

    expect(options.map((j) => j.id)).toEqual(["j-other"]);
  });
});

describe("usageOf", () => {
  const users = [user("u-1", "j-deb"), user("u-2", "j-raj"), user("u-3", "j-raj")];
  const parcels = [parcel("p-1", "j-raj"), parcel("p-2", "j-pay")];

  it("counts what points at exactly this node", () => {
    const usage = usageOf("j-deb", TREE, users, parcels);

    expect(usage.children).toBe(2);
    expect(usage.users).toBe(1);
    expect(usage.parcels).toBe(0);
  });

  it("counts the subtree separately, including the node itself", () => {
    const usage = usageOf("j-deb", TREE, users, parcels);

    expect(usage.subtree).toEqual({ jurisdictions: 2, users: 3, parcels: 2 });
  });
});

describe("deletionGate", () => {
  it("allows removing an empty leaf", () => {
    expect(deletionGate("j-pay", TREE, [], [])).toEqual({ canDelete: true, blockers: [] });
  });

  it("refuses while children still hang off it, naming the rung below", () => {
    const gate = deletionGate("j-deb", TREE, [], []);

    expect(gate.canDelete).toBe(false);
    expect(gate.blockers).toContainEqual({ code: "children", count: 2, childLevel: "mouza" });
  });

  it("refuses while a parcel is registered against it", () => {
    // Deleting it would leave a record nobody can place.
    const gate = deletionGate("j-raj", TREE, [], [parcel("p-1", "j-raj")]);

    expect(gate.blockers).toEqual([{ code: "parcels", count: 1 }]);
  });

  it("refuses while a user is assigned to it", () => {
    const gate = deletionGate("j-raj", TREE, [user("u-1", "j-raj")], []);

    expect(gate.blockers).toEqual([{ code: "users", count: 1 }]);
  });

  it("returns every blocker at once, each with its count", () => {
    // The screen lists each with its own fix, rather than greying out a button.
    const gate = deletionGate(
      "j-deb",
      TREE,
      [user("u-1", "j-deb")],
      [parcel("p-1", "j-deb")],
    );

    expect(gate.blockers).toEqual([
      { code: "children", count: 2, childLevel: "mouza" },
      { code: "parcels", count: 1 },
      { code: "users", count: 1 },
    ]);
  });

  it("only counts what points at the node itself, not its subtree", () => {
    // Payalgacha's parcel does not block deleting Rajamehar.
    const gate = deletionGate("j-raj", TREE, [], [parcel("p-2", "j-pay")]);

    expect(gate.canDelete).toBe(true);
  });

  it("reports a node that is not there", () => {
    expect(deletionGate("j-nope", TREE, [], [])).toEqual({
      canDelete: false,
      blockers: [{ code: "missing" }],
    });
  });
});

describe("reviewDraft — name and code", () => {
  it("accepts a well-formed new node", () => {
    expect(reviewDraft(draft(), TREE).valid).toBe(true);
  });

  it("requires a name that is not just spaces", () => {
    expect(reviewDraft(draft({ name: "   " }), TREE).errors.name).toEqual({
      code: "name-required",
    });
  });

  it("requires a code", () => {
    expect(reviewDraft(draft({ code: "" }), TREE).errors.code).toEqual({
      code: "code-required",
    });
  });

  it.each(["CTG CUM", "CTG--CUM", "CTG-", "-CTG", "CTG_CUM"])(
    "rejects %s as a code",
    (code) => {
      expect(reviewDraft(draft({ code }), TREE).errors.code).toEqual({ code: "code-pattern" });
    },
  );

  it("refuses a code another node already holds, naming the holder", () => {
    const review = reviewDraft(draft({ code: "CTG-CUM-DEB-RAJ" }), TREE);

    expect(review.errors.code).toEqual({
      code: "code-taken",
      holderName: "Rajamehar",
      holderCode: "CTG-CUM-DEB-RAJ",
    });
  });

  it("compares codes case-insensitively", () => {
    expect(reviewDraft(draft({ code: "ctg-cum-deb-raj" }), TREE).errors.code?.code).toBe(
      "code-taken",
    );
  });

  it("does not accuse a node of clashing with itself", () => {
    const editing = draft({ id: "j-raj", name: "Rajamehar", code: "CTG-CUM-DEB-RAJ" });

    expect(reviewDraft(editing, TREE).errors.code).toBeUndefined();
  });
});

describe("reviewDraft — the rung above", () => {
  it("refuses a mouza hung straight off a district", () => {
    // covers() walks parent links; a skipped rung makes coverage mean something
    // different on each branch.
    const review = reviewDraft(draft({ parentId: "j-cum" }), TREE);

    expect(review.errors.parentId).toEqual({
      code: "parent-wrong-level",
      level: "mouza",
      needs: "upazila",
      parentName: "Cumilla",
      parentLevel: "district",
    });
  });

  it("requires a parent for anything below a division", () => {
    expect(reviewDraft(draft({ parentId: null }), TREE).errors.parentId).toEqual({
      code: "parent-required",
      needs: "upazila",
      level: "mouza",
    });
  });

  it("refuses a parent for a division", () => {
    const review = reviewDraft(
      draft({ level: "division", code: "SYL", parentId: "j-ctg" }),
      TREE,
    );

    expect(review.errors.parentId).toEqual({ code: "division-has-no-parent" });
  });

  it("accepts a division with no parent", () => {
    expect(reviewDraft(draft({ level: "division", code: "SYL", parentId: null }), TREE).valid).toBe(
      true,
    );
  });

  it("reports a parent that is not there", () => {
    expect(reviewDraft(draft({ parentId: "j-gone" }), TREE).errors.parentId).toEqual({
      code: "parent-missing",
    });
  });
});

describe("reviewDraft — loops", () => {
  it("refuses a node parented to itself", () => {
    const selfParented = draft({
      id: "j-deb",
      name: "Debidwar",
      code: "CTG-CUM-DEB",
      level: "upazila",
      parentId: "j-deb",
    });

    // Its own level wants a district parent, so the ladder catches this first;
    // either way it must not be accepted.
    expect(reviewDraft(selfParented, TREE).valid).toBe(false);
  });

  it("refuses re-parenting a node under its own descendant", () => {
    // Reaching this check needs data that is *already* malformed, and that is
    // the point of it. In a well-formed tree a descendant always sits at a
    // lower rung than its ancestor, so the ladder check catches the loop first
    // and `eligibleParents()` never offers the subtree at all. The guard here
    // is defence in depth for a tree that is already broken — modelled by a
    // division wrongly parented under a district.
    const strayDivision: Jurisdiction = {
      id: "j-inner",
      name: "Inner Division",
      code: "CTG-CUM-INN",
      level: "division",
      parentId: "j-cum",
    };
    const all = [...TREE, strayDivision];
    const move = draft({
      id: "j-cum",
      name: "Cumilla",
      code: "CTG-CUM",
      level: "district",
      parentId: "j-inner",
    });

    expect(reviewDraft(move, all).errors.parentId).toEqual({
      code: "cycle",
      parentName: "Inner Division",
      currentName: "Cumilla",
    });
  });

  it("catches a loop through the ladder check when the tree is well-formed", () => {
    // The same intent, on sane data: Cumilla under Debidwar is refused because
    // a district cannot hang off an upazila, before cycles are even considered.
    const move = draft({
      id: "j-cum",
      name: "Cumilla",
      code: "CTG-CUM",
      level: "district",
      parentId: "j-deb",
    });

    expect(reviewDraft(move, TREE).valid).toBe(false);
  });
});

describe("reviewDraft — the rung below", () => {
  it("refuses a level change that would strand the node's own children", () => {
    // Promoting Debidwar to district leaves its mouzas on the wrong rung —
    // children constrain the level just as much as the parent does.
    const promote = draft({
      id: "j-deb",
      name: "Debidwar",
      code: "CTG-CUM-DEB",
      level: "district",
      parentId: "j-ctg",
    });
    const review = reviewDraft(promote, TREE);

    expect(review.errors.level).toEqual({
      code: "children-stranded",
      count: 2,
      exampleName: "Rajamehar",
      exampleLevel: "mouza",
      wants: "upazila",
    });
  });

  it("allows a level change on a node with no children", () => {
    const change = draft({
      id: "j-pay",
      name: "Payalgacha",
      code: "CTG-CUM-DEB-PAY",
      level: "mouza",
      parentId: "j-deb",
    });

    expect(reviewDraft(change, TREE).errors.level).toBeUndefined();
  });

  it("does not check children when creating, since a new node has none", () => {
    expect(reviewDraft(draft({ level: "district", parentId: "j-ctg" }), TREE).errors.level)
      .toBeUndefined();
  });
});

describe("reviewDraft — conventions are flagged, never enforced", () => {
  it("warns when a code does not extend its parent's, but still saves", () => {
    const review = reviewDraft(draft({ code: "ZZZ-BAR" }), TREE);

    expect(review.valid).toBe(true);
    expect(review.warnings).toContainEqual({ code: "code-prefix", parentCode: "CTG-CUM-DEB" });
  });

  it("warns that descendants still carry the old prefix after a rename", () => {
    const recode = draft({
      id: "j-deb",
      name: "Debidwar",
      code: "CTG-CUM-DBW",
      level: "upazila",
      parentId: "j-cum",
    });
    const review = reviewDraft(recode, TREE);

    expect(review.valid).toBe(true);
    expect(review.warnings).toContainEqual({
      code: "stale-descendant-codes",
      count: 2,
      currentCode: "CTG-CUM-DEB",
    });
  });

  it("warns about a sibling with the same name", () => {
    const review = reviewDraft(draft({ name: "rajamehar" }), TREE);

    expect(review.valid).toBe(true);
    expect(review.warnings).toContainEqual({ code: "sibling-name", name: "Rajamehar" });
  });

  it("does not warn about a same name under a different parent", () => {
    // Two mouzas called Rajamehar in different upazilas is ordinary.
    const other: Jurisdiction = {
      id: "j-other-up",
      name: "Other Upazila",
      code: "CTG-CUM-OTH",
      level: "upazila",
      parentId: "j-cum",
    };
    const review = reviewDraft(
      draft({ name: "Rajamehar", code: "CTG-CUM-OTH-RAJ", parentId: "j-other-up" }),
      [...TREE, other],
    );

    expect(review.warnings).toEqual([]);
  });

  it("keeps a warning from making a draft invalid", () => {
    const review = reviewDraft(draft({ code: "ZZZ-BAR", name: "rajamehar" }), TREE);

    expect(review.warnings.length).toBeGreaterThan(1);
    expect(review.valid).toBe(true);
  });
});

describe("suggestCode", () => {
  it("starts a child from its parent's prefix", () => {
    expect(suggestCode(TREE[2])).toBe("CTG-CUM-DEB-");
  });

  it("starts a root from nothing", () => {
    expect(suggestCode(null)).toBe("");
  });
});
