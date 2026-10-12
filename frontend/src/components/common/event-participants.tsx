"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/auth/guards";
import { ApiErrorAlert } from "./alerts";
type Registrant = { user_id: string; name: string; participant_name: string | null; contact: string | null; notes: string | null; status: string };
export function EventParticipants({ id, organizerId }: { id: string; organizerId: string | null }) {
  const me = useCurrentUser(); const { locale } = useI18n(); const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const manager = !!me && (me.id === organizerId || me.role.startsWith("admin"));
  const query = useQuery({ queryKey: ["events", "participants", id], enabled: manager && open, queryFn: () => api.get<{ data: Registrant[] }>(`/events/${id}/registrations`) });
  if (!manager) return null;
  return <section className="space-y-3">
    <Button variant="secondary" onPress={() => setOpen(v => !v)} aria-expanded={open}>{zh ? "查看报名资料" : "View registrations"}</Button>
    {open && <div className="space-y-2">
      {query.error && <ApiErrorAlert error={query.error} />}
      {query.isLoading && <p>{zh ? "加载中…" : "Loading…"}</p>}
      {query.data?.data.length === 0 && <p>{zh ? "暂无报名" : "No registrations yet"}</p>}
      {query.data?.data.map(r => <article key={r.user_id} className="space-y-1 rounded-lg border border-separator p-3">
        <p className="font-medium">{r.participant_name || r.name}</p><p>{r.contact}</p><p className="whitespace-pre-wrap">{r.notes}</p><p className="text-sm text-muted">{r.status}</p>
      </article>)}
    </div>}
  </section>;
}
