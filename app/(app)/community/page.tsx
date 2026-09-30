"use client";

import { useState } from "react";
import { ArrowBigDown, ArrowBigUp, BellRing, MessageCircle, MessagesSquare, Plus, Reply } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCommentOnCommunityPost,
  useCommunityPosts,
  useCreateCommunityPost,
  useVoteOnCommunityPost,
} from "@/hooks/queries";
import { initials } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { CommunityComment, CommunityPost, CommunityPostKind, CommunityVoteValue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";

function Composer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const role = useSessionStore((state) => state.role);
  const mutation = useCreateCommunityPost();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CommunityPostKind>("discussion");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await mutation.mutateAsync({ title, body, kind });
    onClose();
  };

  return (
    <Card className="relative overflow-hidden border-primary/30 p-5 shadow-lg bg-card/80 backdrop-blur-xl transition-all duration-500 animate-in fade-in slide-in-from-top-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50 pointer-events-none" />
      <form className="relative space-y-4" onSubmit={submit}>
        {role === "land-office" ? (
          <div className="flex gap-2" role="group" aria-label={t.pages.community.postType}>
            <Button type="button" size="sm" variant={kind === "discussion" ? "default" : "outline"} onClick={() => setKind("discussion")}>
              <MessagesSquare /> {t.pages.community.newPost}
            </Button>
            <Button type="button" size="sm" variant={kind === "announcement" ? "default" : "outline"} onClick={() => setKind("announcement")}>
              <BellRing /> {t.pages.community.newAnnouncement}
            </Button>
          </div>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          {t.pages.community.titleLabel}
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.pages.community.titlePlaceholder} minLength={4} maxLength={140} required />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t.pages.community.bodyLabel}
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t.pages.community.bodyPlaceholder} minLength={8} maxLength={5000} required className="min-h-28" />
        </label>
        {mutation.isError ? <p className="text-sm text-destructive">{t.pages.community.postError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t.pages.community.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending || title.trim().length < 4 || body.trim().length < 8}>
            {mutation.isPending ? t.pages.community.publishing : t.pages.community.publish}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function VoteRail({ post }: { post: CommunityPost }) {
  const t = useT();
  const f = useFmt();
  const vote = useVoteOnCommunityPost();
  const cast = (value: CommunityVoteValue) => vote.mutate({ postId: post.id, value });
  return (
    <div className="flex min-w-10 flex-row items-center gap-1 rounded-xl bg-muted/30 p-1.5 sm:flex-col backdrop-blur-md border border-border/40 shadow-sm transition-colors hover:bg-muted/50">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t.pages.community.upVote} disabled={vote.isPending} onClick={() => cast(1)} className={cn("hover:text-primary transition-colors hover:bg-primary/10 rounded-lg", post.viewerVote === 1 && "bg-primary/15 text-primary shadow-sm")}>
        <ArrowBigUp className={cn(post.viewerVote === 1 && "fill-current", "transition-transform group-hover:-translate-y-0.5")} />
      </Button>
      <span className="min-w-6 text-center text-xs font-semibold" aria-label={t.pages.community.votes(post.score)}>{f.number(post.score)}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t.pages.community.downVote} disabled={vote.isPending} onClick={() => cast(-1)} className={cn("hover:text-destructive transition-colors hover:bg-destructive/10 rounded-lg", post.viewerVote === -1 && "bg-destructive/15 text-destructive shadow-sm")}>
        <ArrowBigDown className={cn(post.viewerVote === -1 && "fill-current", "transition-transform group-hover:translate-y-0.5")} />
      </Button>
      {vote.isError ? <span className="sr-only">{t.pages.community.voteError}</span> : null}
    </div>
  );
}

function CommentThread({
  comment,
  repliesByParent,
  replyingToId,
  replyBody,
  isSubmitting,
  onReply,
  onReplyBodyChange,
  onCancelReply,
  onSubmitReply,
  depth = 0,
}: {
  comment: CommunityComment;
  repliesByParent: Map<string, CommunityComment[]>;
  replyingToId: string | null;
  replyBody: string;
  isSubmitting: boolean;
  onReply: (comment: CommunityComment) => void;
  onReplyBodyChange: (body: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (event: React.FormEvent, parentId: string) => void;
  depth?: number;
}) {
  const t = useT();
  const f = useFmt();
  const replies = repliesByParent.get(comment.id) ?? [];

  return (
    <div className={cn("space-y-2 group/comment relative transition-all duration-300", depth > 0 && "ml-4 border-l-2 border-primary/20 hover:border-primary/40 pl-4 sm:ml-6")}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium">{comment.authorName}</span>
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{t.roles[comment.authorRole]}</Badge>
          <time className="text-muted-foreground" dateTime={comment.createdAt}>{f.fromNow(comment.createdAt)}</time>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{comment.body}</p>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReply(comment)}>
          <Reply className="size-3.5" /> {t.pages.community.replyToComment}
        </Button>
      </div>
      {replyingToId === comment.id ? (
        <form className="space-y-2" onSubmit={(event) => onSubmitReply(event, comment.id)}>
          <Textarea
            autoFocus
            value={replyBody}
            onChange={(event) => onReplyBodyChange(event.target.value)}
            placeholder={t.pages.community.replyPlaceholder(comment.authorName)}
            maxLength={2000}
            required
            className="min-h-20"
            aria-label={t.pages.community.replyPlaceholder(comment.authorName)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancelReply}>{t.pages.community.cancel}</Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !replyBody.trim()}>{t.pages.community.postReply}</Button>
          </div>
        </form>
      ) : null}
      {replies.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          repliesByParent={repliesByParent}
          replyingToId={replyingToId}
          replyBody={replyBody}
          isSubmitting={isSubmitting}
          onReply={onReply}
          onReplyBodyChange={onReplyBodyChange}
          onCancelReply={onCancelReply}
          onSubmitReply={onSubmitReply}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  const t = useT();
  const f = useFmt();
  const comment = useCommentOnCommunityPost();
  const [body, setBody] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const comments = post.comments ?? [];
  const repliesByParent = new Map<string, CommunityComment[]>();
  for (const item of comments) {
    if (!item.parentId) continue;
    const replies = repliesByParent.get(item.parentId) ?? [];
    replies.push(item);
    repliesByParent.set(item.parentId, replies);
  }
  const rootComments = comments.filter((item) => !item.parentId);

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    await comment.mutateAsync({ postId: post.id, body });
    setBody("");
  };

  const submitReply = async (event: React.FormEvent, parentId: string) => {
    event.preventDefault();
    await comment.mutateAsync({ postId: post.id, body: replyBody, parentId });
    setReplyBody("");
    setReplyingToId(null);
  };

  return (
    <Card id={post.id} className={cn(
      "group scroll-mt-20 overflow-hidden transition-all duration-500 hover:shadow-xl hover:-translate-y-1 border-border/40 backdrop-blur-sm bg-card/80 animate-in fade-in slide-in-from-bottom-4",
      post.kind === "announcement" ? "border-primary/40 bg-gradient-to-br from-primary/[0.05] to-transparent hover:border-primary/60" : "hover:border-primary/30"
    )}>
      {post.kind === "announcement" ? (
        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary backdrop-blur-md shadow-sm">
          <BellRing className="size-3.5 animate-pulse" /> {t.pages.community.announcement}
        </div>
      ) : null}
      <div className="flex gap-3 p-4">
        <VoteRail post={post} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-2.5">
            <Avatar size="sm" className="ring-2 ring-primary/10 ring-offset-1 ring-offset-background transition-all duration-300 group-hover:ring-primary/40 group-hover:scale-105"><AvatarFallback className="bg-primary/10 text-primary font-medium">{initials(post.authorName)}</AvatarFallback></Avatar>
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{post.authorName}</span>
              <span className="mx-1.5">·</span>
              <span>{t.roles[post.authorRole]}</span>
              <span className="mx-1.5">·</span>
              <time dateTime={post.createdAt}>{f.fromNow(post.createdAt)}</time>
            </div>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{post.title}</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{post.body}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageCircle className="size-3.5" /> {t.pages.community.comments(post.commentCount)}
          </div>
          {rootComments.length ? (
            <div className="space-y-3 border-l-2 border-border pl-3">
              {rootComments.map((item) => (
                <CommentThread
                  key={item.id}
                  comment={item}
                  repliesByParent={repliesByParent}
                  replyingToId={replyingToId}
                  replyBody={replyBody}
                  isSubmitting={comment.isPending}
                  onReply={(selected) => {
                    setReplyingToId(selected.id);
                    setReplyBody("");
                  }}
                  onReplyBodyChange={setReplyBody}
                  onCancelReply={() => {
                    setReplyingToId(null);
                    setReplyBody("");
                  }}
                  onSubmitReply={submitReply}
                />
              ))}
            </div>
          ) : null}
          <form className="flex items-end gap-2" onSubmit={submitComment}>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t.pages.community.commentPlaceholder} maxLength={2000} required className="min-h-9 flex-1" aria-label={t.pages.community.addComment} />
            <Button type="submit" size="sm" disabled={comment.isPending || !body.trim()}>{t.pages.community.reply}</Button>
          </form>
          {comment.isError ? <p className="text-xs text-destructive">{t.pages.community.commentError}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export default function CommunityPage() {
  const t = useT();
  const { data: posts, isLoading, isError, refetch } = useCommunityPosts();
  const [composing, setComposing] = useState(false);

  const announcements = posts?.filter((post) => post.kind === "announcement") ?? [];
  const generalPosts = posts?.filter((post) => post.kind !== "announcement") ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow={t.pages.community.eyebrow} title={t.pages.community.title} description={t.pages.community.description}>
        <Button size="sm" onClick={() => setComposing((value) => !value)}><Plus /> {t.pages.community.newPost}</Button>
      </PageHeader>
      {composing ? <Composer onClose={() => setComposing(false)} /> : null}
      
      <Tabs defaultValue="general" className="w-full">
        <div className="flex justify-center mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/40 p-1.5 backdrop-blur-lg rounded-full shadow-inner border border-border/50">
            <TabsTrigger value="general" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground transition-all duration-300">{t.pages.community.tabDiscussions ?? "Discussions"}</TabsTrigger>
            <TabsTrigger value="announcements" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-300">{t.pages.community.tabAnnouncements ?? "Announcements"}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general" className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>
          ) : isError ? (
            <Card className="p-6 text-center"><p className="text-sm text-destructive">{t.pages.community.loadError}</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>{t.common.retry}</Button></Card>
          ) : generalPosts.length ? (
            <div className="space-y-3">{generalPosts.map((post) => <PostCard key={post.id} post={post} />)}</div>
          ) : (
            <EmptyState icon={MessagesSquare} title={t.pages.community.emptyTitle} description={t.pages.community.emptyBody} />
          )}
        </TabsContent>
        <TabsContent value="announcements" className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>
          ) : isError ? (
            <Card className="p-6 text-center"><p className="text-sm text-destructive">{t.pages.community.loadError}</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>{t.common.retry}</Button></Card>
          ) : announcements.length ? (
            <div className="space-y-3">{announcements.map((post) => <PostCard key={post.id} post={post} />)}</div>
          ) : (
            <EmptyState icon={BellRing} title={t.pages.community.emptyTitle} description={t.pages.community.emptyBody} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
