"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Heart, User, Plus, Share2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCommunityPosts, useCreatePost, useVotePost, useVoteComment, useCreateComment, CommunityPost, CommunityComment } from "@/hooks/community-queries";
import { useSessionStore } from "@/store/session";
import Link from "next/link";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { toast } from "sonner";

function CommentItem({ comment, postId, userId, level = 0 }: { comment: CommunityComment, postId: string, userId?: string | null, level?: number }) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const createComment = useCreateComment();
  const voteComment = useVoteComment();

  const upvotes = comment.votes.filter(v => v.value === 1).length;
  const downvotes = comment.votes.filter(v => v.value === -1).length;
  const score = upvotes - downvotes;
  const userVote = comment.votes.find(v => v.userId === userId)?.value || 0;

  const handleVote = (value: number) => {
    if (!userId) return;
    const newValue = userVote === value ? 0 : value;
    voteComment.mutate({ commentId: comment.id, postId, value: newValue });
  };

  const handleReply = () => {
    if (!replyContent.trim()) return;
    createComment.mutate({ postId, content: replyContent, parentId: comment.id }, {
      onSuccess: () => {
        setIsReplying(false);
        setReplyContent("");
        toast.success("Reply added");
      }
    });
  };

  return (
    <div className={`flex gap-3 sm:gap-4 ${level > 0 ? "ml-6 sm:ml-12 mt-4" : "mt-6"}`}>
      <Avatar className="size-8 mt-1 border">
        <AvatarImage src={comment.author.avatarUrl || undefined} />
        <AvatarFallback className="text-xs">{initials(comment.author.name)}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-sm">{comment.author.name}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.content}</p>
        </div>
        
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center rounded-full bg-muted/40 p-0.5 border border-transparent hover:bg-muted transition-colors">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-7 rounded-full gap-1.5 px-2.5 ${userVote === 1 ? "text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => handleVote(1)}
            >
              <Heart className={`size-3.5 ${userVote === 1 ? "fill-current" : ""}`} />
              <span className="text-xs font-semibold">{score}</span>
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setIsReplying(!isReplying)}
          >
            Reply
          </Button>
        </div>

        {isReplying && (
          <div className="mt-2 flex gap-2 items-start">
            <Textarea 
              className="min-h-[60px] text-sm" 
              placeholder={`Replying to ${comment.author.name}...`}
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              autoFocus
            />
            <Button size="icon" onClick={handleReply} disabled={createComment.isPending || !replyContent.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { data: posts, isLoading } = useCommunityPosts();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const createPost = useCreatePost();
  const votePost = useVotePost();
  const voteComment = useVoteComment();
  const createComment = useCreateComment();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const userId = useSessionStore(s => s.userId);
  const t = useT();

  const handleCreatePost = () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) {
      toast.error("Title and content are required");
      return;
    }
    createPost.mutate({ title: newPostTitle, content: newPostContent }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setNewPostTitle("");
        setNewPostContent("");
        toast.success("Post created successfully");
      },
      onError: () => toast.error("Failed to create post")
    });
  };

  const handleVote = (post: CommunityPost, value: number) => {
    if (!userId) return;
    const existingVote = post.votes.find(v => v.userId === userId);
    const newValue = existingVote?.value === value ? 0 : value;
    votePost.mutate({ postId: post.id, value: newValue });
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>;
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.nav.communityBuild}</h1>
          <p className="text-muted-foreground mt-1">Discuss land issues, share advice, and help the community.</p>
        </div>
        
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="size-4" />
          New Post
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Create a new post</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input 
                  placeholder="What's on your mind?" 
                  value={newPostTitle}
                  onChange={e => setNewPostTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Content</label>
                <Textarea 
                  placeholder="Provide more details..." 
                  className="min-h-[150px]"
                  value={newPostContent}
                  onChange={e => setNewPostContent(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreatePost}
                disabled={createPost.isPending}
              >
                {createPost.isPending ? "Posting..." : "Post"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {posts?.map(post => {
          const upvotes = post.votes.filter(v => v.value === 1).length;
          const downvotes = post.votes.filter(v => v.value === -1).length;
          const score = upvotes - downvotes;
          const userVote = post.votes.find(v => v.userId === userId)?.value || 0;

          return (
            <Card key={post.id} className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-primary/15 dark:from-primary/10 dark:to-primary/20 transition-all hover:from-primary/10 hover:to-primary/20 dark:hover:from-primary/15 dark:hover:to-primary/25 hover:border-primary/30 hover:shadow-md">
              <div className="flex flex-col p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar className="size-6 border shadow-sm">
                    <AvatarImage src={post.author.avatarUrl || undefined} />
                    <AvatarFallback className="text-[10px]">{initials(post.author.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{post.author.name}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </span>
                </div>

                <Link href={`/community/${post.id}`} className="group block mb-3">
                  <h2 className="mb-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground line-clamp-3 text-sm sm:text-base leading-relaxed">
                    {post.content}
                  </p>
                </Link>
                
                <div className="flex items-center gap-1 sm:gap-4 -ml-2">
                  <div className="flex items-center rounded-full bg-muted/40 p-0.5 border border-transparent hover:bg-muted transition-colors">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`h-8 rounded-full gap-1.5 px-3 ${userVote === 1 ? "text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => handleVote(post, 1)}
                    >
                      <Heart className={`size-4 ${userVote === 1 ? "fill-current" : ""}`} />
                      <span className="text-xs font-semibold">{upvotes}</span>
                    </Button>
                  </div>
                  
                  <Link href={`/community/${post.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 rounded-full gap-1.5 px-3 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <MessageCircle className="size-4" />
                      <span className="text-xs font-semibold">{post._count?.comments ?? post.comments?.length ?? 0}</span>
                      <span className="sr-only sm:not-sr-only sm:ml-0.5 text-xs">Comments</span>
                    </Button>
                  </Link>

                  <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:ml-auto">
                    <Share2 className="size-4" />
                    <span className="sr-only">Share</span>
                  </Button>
                </div>
              </div>
            </Card>

          );
        })}
        {posts?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <div className="rounded-full bg-primary/10 p-3">
              <MessageCircle className="size-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No posts yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Be the first to start a discussion! Share a question, tip, or experience with the community.
            </p>
            <Button className="mt-6" onClick={() => setIsDialogOpen(true)}>
              Create First Post
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
