import type { ID, ISODateString } from "./common";
import type { Role } from "./user";

export type CommunityPostKind = "discussion" | "announcement";
export type CommunityVoteValue = -1 | 1;

export interface CommunityComment {
  id: ID;
  postId: ID;
  authorId: ID;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: ISODateString;
}

export interface CommunityPost {
  id: ID;
  authorId: ID;
  authorName: string;
  authorRole: Role;
  title: string;
  body: string;
  kind: CommunityPostKind;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  score: number;
  viewerVote: CommunityVoteValue | 0;
  commentCount: number;
  comments?: CommunityComment[];
}

