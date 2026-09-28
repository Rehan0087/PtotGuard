"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CommunityComment, CommunityPost } from "@/lib/types";

export type { CommunityComment, CommunityPost } from "@/lib/types";

export function useCommunityPosts() {
  return useQuery<CommunityPost[]>({
    queryKey: ["community-posts"],
    queryFn: async () => {
      return api.get<CommunityPost[]>("/community/posts");
    },
  });
}

export function useCommunityPost(id: string) {
  return useQuery<CommunityPost>({
    queryKey: ["community-posts", id],
    queryFn: async () => {
      return api.get<CommunityPost>(`/community/posts/${id}`);
    },
    enabled: !!id,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return api.post<CommunityPost>("/community/posts", data);
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
      return api.post<CommunityComment>(`/community/posts/${postId}/comments`, { content, parentId });
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
    mutationFn: async ({ commentId, value }: { commentId: string; postId: string; value: number }) => {
      return api.post<void>(`/community/comments/${commentId}/vote`, { value });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["community-posts", variables.postId] });
    },
  });
}
