"use client";

import { useState } from "react";
import { ArrowBigDown, ArrowBigUp, BellRing, MessageCircle, MessagesSquare, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCommentOnCommunityPost,
  useCommunityPosts,
  useCreateCommunityPost,
  useVoteOnCommunityPost,
} from "@/hooks/queries";
import { initials } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { CommunityPost, CommunityPostKind, CommunityVoteValue } from "@/lib/types";
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
    <Card className="border-primary/20 p-4 shadow-sm">
      <form className="space-y-4" onSubmit={submit}>
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
    <div className="flex min-w-10 flex-row items-center gap-1 rounded-lg bg-muted/60 p-1 sm:flex-col">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t.pages.community.upVote} disabled={vote.isPending} onClick={() => cast(1)} className={cn(post.viewerVote === 1 && "bg-primary/10 text-primary")}>
        <ArrowBigUp className={cn(post.viewerVote === 1 && "fill-current")} />
      </Button>
      <span className="min-w-6 text-center text-xs font-semibold" aria-label={t.pages.community.votes(post.score)}>{f.number(post.score)}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t.pages.community.downVote} disabled={vote.isPending} onClick={() => cast(-1)} className={cn(post.viewerVote === -1 && "bg-destructive/10 text-destructive")}>
        <ArrowBigDown className={cn(post.viewerVote === -1 && "fill-current")} />
      </Button>
      {vote.isError ? <span className="sr-only">{t.pages.community.voteError}</span> : null}
    </div>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  const t = useT();
  const f = useFmt();
  const comment = useCommentOnCommunityPost();
  const [body, setBody] = useState("");

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    await comment.mutateAsync({ postId: post.id, body });
    setBody("");
  };

  return (
    <Card id={post.id} className={cn("scroll-mt-20 overflow-hidden", post.kind === "announcement" && "border-primary/30 bg-primary/[0.025]")}>
      {post.kind === "announcement" ? (
        <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary">
          <BellRing className="size-3.5" /> {t.pages.community.announcement}
        </div>
      ) : null}
      <div className="flex gap-3 p-4">
        <VoteRail post={post} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-2.5">
            <Avatar size="sm"><AvatarFallback>{initials(post.authorName)}</AvatarFallback></Avatar>
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
          {post.comments?.length ? (
            <div className="space-y-3 border-l-2 border-border pl-3">
              {post.comments.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium">{item.authorName}</span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{t.roles[item.authorRole]}</Badge>
                    <time className="text-muted-foreground" dateTime={item.createdAt}>{f.fromNow(item.createdAt)}</time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{item.body}</p>
                </div>
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow={t.pages.community.eyebrow} title={t.pages.community.title} description={t.pages.community.description}>
        <Button size="sm" onClick={() => setComposing((value) => !value)}><Plus /> {t.pages.community.newPost}</Button>
      </PageHeader>
      {composing ? <Composer onClose={() => setComposing(false)} /> : null}
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>
      ) : isError ? (
        <Card className="p-6 text-center"><p className="text-sm text-destructive">{t.pages.community.loadError}</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>{t.common.retry}</Button></Card>
      ) : posts?.length ? (
        <div className="space-y-3">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>
      ) : (
        <EmptyState icon={MessagesSquare} title={t.pages.community.emptyTitle} description={t.pages.community.emptyBody} />
      )}
    </div>
  );
}
