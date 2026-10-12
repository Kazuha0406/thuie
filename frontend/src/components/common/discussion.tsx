"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useCan, useCurrentUser } from "@/lib/auth/guards";
import { Author } from "./author";
import { ApiErrorAlert } from "./alerts";
import type { UserBrief } from "@/lib/api/types";

type DiscussionData = { count: number; liked: boolean; comments: { id: string; content: string; status: string; author: UserBrief }[] };
export function Discussion({ kind, id }: { kind: "info" | "post" | "event"; id: string }) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const me = useCurrentUser();
  const canComment = useCan("can_comment");
  const qc = useQueryClient();
  const base = `/feed/${kind}/${id}`;
  const key = ["discussion", kind, id];
  const [content, setContent] = useState("");
  const query = useQuery({ queryKey: key, queryFn: () => api.get<DiscussionData>(`${base}/discussion`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["feed"] }); };
  const comment = useMutation({ mutationFn: () => api.post(`${base}/comments`, { content }), onSuccess: () => { setContent(""); refresh(); } });
  const like = useMutation({ mutationFn: () => api.post(`${base}/like`), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (cid: string) => api.del(`/comments/${cid}`), onSuccess: refresh });
  const error = query.error ?? comment.error ?? like.error ?? remove.error;
  return <section className="space-y-4 border-t border-separator pt-4">
    {error && <ApiErrorAlert error={error} />}
    <Button variant="secondary" aria-pressed={query.data?.liked ?? false} isPending={like.isPending} onPress={() => like.mutate()}>
      {query.data?.liked ? (zh ? "已赞" : "Liked") : (zh ? "赞" : "Like")} · {query.data?.count ?? 0}
    </Button>
    <h2 className="font-semibold">{zh ? "评论" : "Comments"}</h2>
    {query.isLoading && <p>{zh ? "加载中…" : "Loading…"}</p>}
    {query.data?.comments.map(c => <div key={c.id} className="space-y-2 rounded-lg border border-separator p-3">
      <Author user={c.author} /><p className="whitespace-pre-wrap">{c.content}</p>
      {c.status !== "approved" && <p className="text-sm text-muted">{c.status === "pending" ? (zh ? "等待审核，仅你和管理员可见" : "Awaiting review; visible only to you and moderators") : c.status}</p>}
      {(me?.id === c.author.id || me?.role.startsWith("admin")) && <Button size="sm" variant="ghost" isPending={remove.isPending} onPress={() => remove.mutate(c.id)}>{zh ? "删除" : "Delete"}</Button>}
    </div>)}
    {canComment && <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (content.trim()) comment.mutate(); }}>
      <textarea required maxLength={5000} rows={3} aria-label={zh ? "评论内容" : "Comment"} placeholder={zh ? "写下评论…" : "Write a comment…"} value={content} onChange={e => setContent(e.target.value)} className="w-full rounded-lg border border-separator bg-field p-3" />
      <Button type="submit" isPending={comment.isPending} isDisabled={!content.trim()}>{zh ? "提交评论" : "Submit comment"}</Button>
    </form>}
  </section>;
}
