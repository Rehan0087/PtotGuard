"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface CommunityAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface CommunityVote {
  id: string;
  value: number;
  userId: string;
}

export interface CommunityComment {
  id: string;
  content: string;
  authorId: string;
  author: CommunityAuthor;
  createdAt: string;
  parentId: string | null;
  votes: CommunityVote[];
}

export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author: CommunityAuthor;
  createdAt: string;
  _count: { comments: number; votes: number };
  votes: CommunityVote[];
  comments?: CommunityComment[]; // Only populated when fetching specific post
}

export function useCommunityPosts() {
  return useQuery<CommunityPost[]>({
    queryKey: ["community-posts"],
    queryFn: async () => {
      return await api.get<CommunityPost[]>("/community/posts");
    },
  });
}

export function useCommunityPost(id: string) {
  return useQuery<CommunityPost>({
    queryKey: ["community-posts", id],
    queryFn: async () => {
      return await api.get<CommunityPost>(`/community/posts/${id}`);
    },
    enabled: !!id,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return await api.post<CommunityPost>("/community/posts", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, content, parentId }: { postId: string; content: string; parentId?: string }) => {
      return await api.post<CommunityComment>(`/community/posts/${postId}/comments`, { content, parentId });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["community-posts", variables.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] }); // for comment count
    },
  });
}

export function useVotePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, value }: { postId: string; value: number }) => {
      return await api.post<void>(`/community/posts/${postId}/vote`, { value });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-posts", variables.postId] });
    },
  });
}

export function useVoteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, postId, value }: { commentId: string; postId: string, value: number }) => {
      return await api.post<void>(`/community/comments/${commentId}/vote`, { value });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["community-posts", variables.postId] });
    },
  });
}
