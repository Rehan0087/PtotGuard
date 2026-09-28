import type { ID, ISODateString } from "./common";

export interface CommunityAuthor {
  id: ID;
  name: string;
  avatarUrl: string | null;
}

export interface CommunityVote {
  id: ID;
  value: -1 | 1;
  userId: ID;
  postId?: ID | null;
  commentId?: ID | null;
  createdAt?: ISODateString;
}

export interface CommunityComment {
  id: ID;
  content: string;
  postId: ID;
  authorId: ID;
  author: CommunityAuthor;
  createdAt: ISODateString;
  updatedAt?: ISODateString;
  parentId: ID | null;
  votes: CommunityVote[];
}

export interface CommunityPost {
  id: ID;
  title: string;
  content: string;
  authorId: ID;
  author: CommunityAuthor;
  createdAt: ISODateString;
  updatedAt?: ISODateString;
  _count: { comments: number; votes: number };
  votes: CommunityVote[];
  comments?: CommunityComment[];
}
