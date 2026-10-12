"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/auth/guards";
import { useEvent } from "@/features/events";
import { ApiErrorAlert } from "@/components/common/alerts";
export default function RegisterEvent() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const qc = useQueryClient();
  const me = useCurrentUser(); const event = useEvent(id); const { locale } = useI18n(); const zh = locale === "zh";
  const [name, setName] = useState(me?.name ?? ""); const [contact, setContact] = useState(""); const [notes, setNotes] = useState("");
  const register = useMutation({ mutationFn: () => api.post(`/events/${id}/register`, { participant_name: name, contact, notes }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); qc.invalidateQueries({ queryKey: ["me"] }); router.replace(`/events/${id}`); } });
  const field = "w-full rounded-lg border border-separator bg-field p-2";
  return <form className="mx-auto max-w-xl space-y-4" onSubmit={e => { e.preventDefault(); register.mutate(); }}>
    <h1 className="text-2xl font-bold">{zh ? "活动报名" : "Event registration"}</h1><p>{event.data?.title}</p>
    {(event.error || register.error) && <ApiErrorAlert error={event.error ?? register.error} />}
    <label className="block">{zh ? "参加者姓名" : "Participant name"}<input required maxLength={100} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="block">{zh ? "联系方式（电话或邮箱）" : "Contact (phone or email)"}<input required maxLength={200} className={field} value={contact} onChange={e => setContact(e.target.value)} /></label>
    <label className="block">{zh ? "备注（可选）" : "Notes (optional)"}<textarea maxLength={2000} rows={3} className={field} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <p className="text-sm text-muted">{zh ? "报名资料仅活动组织者及管理员可查看。" : "Only the event organizer and moderators can view these registration details."}</p>
    <Button type="submit" isPending={register.isPending} isDisabled={!event.data || event.data.status !== "published" || !!event.data.registered}>{zh ? "确认报名" : "Confirm registration"}</Button>
  </form>;
}
