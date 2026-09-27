"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Heart, ArrowLeft, Send, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCommunityPost, useCreateComment, useVotePost, useVoteComment, CommunityComment } from "@/hooks/community-queries";
import { useSessionStore } from "@/store/session";
import { initials } from "@/lib/format";
import Link from "next/link";
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

export default function PostDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: post, isLoading } = useCommunityPost(id);
  const userId = useSessionStore(s => s.userId);
  const votePost = useVotePost();
  const createComment = useCreateComment();
  
  const [newComment, setNewComment] = useState("");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>;
  }

  if (!post) {
    return <div className="p-8 text-center text-muted-foreground">Post not found</div>;
  }

  const upvotes = post.votes.filter(v => v.value === 1).length;
  const downvotes = post.votes.filter(v => v.value === -1).length;
  const score = upvotes - downvotes;
  const userVote = post.votes.find(v => v.userId === userId)?.value || 0;

  const handleVotePost = (value: number) => {
    if (!userId) return;
    const newValue = userVote === value ? 0 : value;
    votePost.mutate({ postId: post.id, value: newValue });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    createComment.mutate({ postId: post.id, content: newComment }, {
      onSuccess: () => {
        setNewComment("");
        toast.success("Comment added");
      }
    });
  };

  // Group comments into a tree
  const comments = post.comments || [];
  const topLevelComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId);

  return (
    <div className="w-full space-y-6 pb-20">
      <Link href="/community" className={buttonVariants({ variant: "ghost", className: "mb-2 -ml-4 text-muted-foreground w-fit" })}>
        <ArrowLeft className="mr-2 size-4" />
        Back to Community
      </Link>

      {/* Main Post Card */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-primary/15 dark:from-primary/10 dark:to-primary/20 shadow-sm">
        <div className="flex flex-col p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Avatar className="size-10 border shadow-sm">
              <AvatarImage src={post.author.avatarUrl || undefined} />
              <AvatarFallback>{initials(post.author.name)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold text-foreground">{post.author.name}</div>
              <div className="text-xs text-muted-foreground">
                Posted {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-foreground">
            {post.title}
          </h1>
          
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
            {post.content}
          </div>

          <div className="mt-8 flex items-center gap-2 border-t border-border/50 pt-4 -mx-2 px-2">
            <div className="flex items-center rounded-full bg-muted/40 p-0.5 border border-transparent hover:bg-muted transition-colors">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-9 rounded-full gap-2 px-4 ${userVote === 1 ? "text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => handleVotePost(1)}
              >
                <Heart className={`size-4.5 ${userVote === 1 ? "fill-current" : ""}`} />
                <span className="text-sm font-semibold">{score}</span>
              </Button>
            </div>
            
            <Dialog open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-9 rounded-full gap-2 px-4 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => setIsCommentsOpen(true)}
              >
                <MessageCircle className="size-4.5" />
                <span className="text-sm font-semibold">{post._count?.comments ?? comments.length}</span>
                <span className="sr-only sm:not-sr-only sm:ml-0.5 text-sm">Comments</span>
              </Button>
              <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-2 border-b">
                  <DialogTitle className="flex items-center gap-2">
                    <MessageCircle className="size-5 text-primary" />
                    {comments.length} Comments
                  </DialogTitle>
                </DialogHeader>
                
                <div className="p-6">
                  {/* Add Comment */}
                  <div className="mb-8 bg-card rounded-lg border shadow-sm p-4 sm:p-5">
                    <div className="flex gap-3">
                      <Avatar className="size-8 hidden sm:block mt-1">
                        <AvatarFallback>{"U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-3">
                        <Textarea 
                          placeholder="What are your thoughts?" 
                          className="min-h-[80px] resize-y"
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <Button size="sm" onClick={handleAddComment} disabled={createComment.isPending || !newComment.trim()}>
                            {createComment.isPending ? "Posting..." : "Post Comment"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Comment Thread */}
                  <div className="space-y-4">
                    {topLevelComments.map(comment => (
                      <div key={comment.id}>
                        <CommentItem comment={comment} postId={post.id} userId={userId} level={0} />
                        {getReplies(comment.id).map(reply => (
                          <CommentItem key={reply.id} comment={reply} postId={post.id} userId={userId} level={1} />
                        ))}
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No comments yet. Be the first to share your thoughts!
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:ml-auto">
              <Share2 className="size-4.5" />
              <span className="sr-only">Share</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
