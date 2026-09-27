import re

with open('/home/toufiq/SWE/PtotGuard/app/(app)/community/[id]/page.tsx', 'r') as f:
    id_content = f.read()

# Extract CommentItem
comment_item_match = re.search(r'(function CommentItem.*?)(?=\nexport default function)', id_content, re.DOTALL)
if not comment_item_match:
    print("Failed to find CommentItem")
    exit(1)

comment_item = comment_item_match.group(1)

with open('/home/toufiq/SWE/PtotGuard/app/(app)/community/page.tsx', 'r') as f:
    feed_content = f.read()

# Inject CommentItem before export default function
feed_content = feed_content.replace('export default function CommunityPage() {', comment_item + '\nexport default function CommunityPage() {')

# Now add the expanded rendering logic
render_logic = """                  <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:ml-auto">
                    <Share2 className="size-4" />
                    <span className="sr-only">Share</span>
                  </Button>
                </div>
              </div>

              {/* Inline Comments Section */}
              {expandedPostId === post.id && (
                <div className="p-4 sm:p-5 bg-card/50 border-t border-border/50">
                  <div className="mb-6 flex gap-3">
                    <Avatar className="size-8 hidden sm:block mt-1">
                      <AvatarFallback>{initials(useSessionStore.getState().user?.name || "U")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex gap-2">
                      <Textarea 
                        placeholder="Write a comment..." 
                        className="min-h-[40px] h-[40px] resize-none"
                        id={`comment-input-${post.id}`}
                      />
                      <Button onClick={() => {
                        const input = document.getElementById(`comment-input-${post.id}`) as HTMLTextAreaElement;
                        if (!input || !input.value.trim()) return;
                        createComment.mutate({ postId: post.id, content: input.value }, {
                          onSuccess: () => { input.value = ''; toast.success('Comment added'); }
                        });
                      }} disabled={createComment.isPending}>
                        Post
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {(post.comments || []).filter(c => !c.parentId).map(comment => (
                      <div key={comment.id}>
                        <CommentItem comment={comment} postId={post.id} userId={userId} level={0} />
                        {(post.comments || []).filter(c => c.parentId === comment.id).map(reply => (
                          <CommentItem key={reply.id} comment={reply} postId={post.id} userId={userId} level={1} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
"""
feed_content = re.sub(r'                  <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full.*?</Card>', render_logic, feed_content, flags=re.DOTALL)

with open('/home/toufiq/SWE/PtotGuard/app/(app)/community/page.tsx', 'w') as f:
    f.write(feed_content)

print("Patch applied")
