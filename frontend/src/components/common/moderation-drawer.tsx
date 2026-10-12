"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Author } from "./author";
import { ApiErrorAlert } from "./alerts";
import { StatusChip } from "./status-chip";
import type { UserBrief } from "@/lib/api/types";

export type PreviewTarget = { type: string; id: string; reportId?: string; reason?: string; reportStatus?: string };
type Preview = { title: string; content: string | null; status: string; author: UserBrief; attachments: { id: string; url: string; mime_type: string }[] };
export function ModerationDrawer({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { locale } = useI18n(); const zh = locale === "zh";
  const [reason, setReason] = useState(""); const qc = useQueryClient();
  useEffect(() => { setReason(""); if (target) ref.current?.showModal(); else ref.current?.close(); }, [target]);
  const query = useQuery({ queryKey: ["moderation-preview", target?.type, target?.id], enabled: !!target,
    queryFn: () => api.get<Preview>(`/admin/content/${target!.type}/${target!.id}`) });
  const action = useMutation({ mutationFn: (kind: string) => target?.reportId
    ? api.post(`/admin/reports/${target.reportId}/resolve`, { outcome: kind, note: reason || undefined })
    : kind === "taken_down" ? api.post("/admin/takedown", { target_type: target?.type, target_id: target?.id, reason })
    : api.post(`/admin/review/${target?.type}/${target?.id}/${kind}`, { reason: reason || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["feed"] }); qc.invalidateQueries({ queryKey: ["discussion"] }); onClose(); } });
  const data = query.data;
  return <dialog ref={ref} onCancel={onClose} onClose={onClose} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl overflow-y-auto border-l border-separator bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40">
    <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{zh ? "内容审核" : "Content review"}</h2><Button variant="ghost" onPress={onClose}>{zh ? "关闭" : "Close"}</Button></div>
    {(query.error || action.error) && <ApiErrorAlert error={query.error ?? action.error} />}
    {query.isLoading && <p>{zh ? "加载中…" : "Loading…"}</p>}
    {data && <div className="space-y-4">
      <h3 className="text-xl font-semibold">{data.title}</h3><Author user={data.author} /><StatusChip status={data.status} />
      <p className="whitespace-pre-wrap break-words">{data.content}</p>
      {data.attachments.map(a => <div key={a.id}>{a.mime_type.startsWith("image/") && <img src={a.url} alt={zh ? "附件" : "Attachment"} className="max-w-full rounded-lg" />}<a href={a.url} target="_blank" rel="noreferrer" className="text-accent underline">{zh ? "打开附件" : "Open attachment"} · {a.id}</a></div>)}
      {target?.reason && <p className="rounded-lg bg-danger/10 p-3">{zh ? "举报原因" : "Report reason"}: {target.reason}</p>}
      {(!target?.reportId || target.reportStatus === "open") && <div className="sticky bottom-0 space-y-3 border-t border-separator bg-background py-4">
        <label className="block">{zh ? "处理说明" : "Decision reason"}<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-separator bg-field p-2" /></label>
        <div className="flex flex-wrap gap-2">{(target?.reportId ? [["ignored","忽略举报","Ignore report"],["deleted","移除内容","Remove content"],["restricted","限制用户","Restrict user"]] : [["approve","通过","Approve"],["reject","拒绝","Reject"],["taken_down","下架","Take down"]]).map(([key,cn,en]) => <Button key={key} size="sm" variant={key === "approve" || key === "ignored" ? "primary" : "danger"} isPending={action.isPending} isDisabled={!["approve","ignored"].includes(key) && !reason.trim()} onPress={() => action.mutate(key)}>{zh ? cn : en}</Button>)}</div>
      </div>}
    </div>}
  </dialog>;
}
