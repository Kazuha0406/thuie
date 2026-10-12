"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { ApiErrorAlert } from "@/components/common/alerts";
import { useCan } from "@/lib/auth/guards";

export default function Publish() {
  const { locale } = useI18n(); const zh = locale === "zh";
  const router = useRouter(); const qc = useQueryClient();
  const [tag, setTag] = useState("discussion");
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [starts, setStarts] = useState(""); const [ends, setEnds] = useState("");
  const [location, setLocation] = useState(""); const [organizer, setOrganizer] = useState("");
  const [capacity, setCapacity] = useState("");
  const info = tag === "information" || tag === "recruitment";
  const event = tag === "events";
  const canInfo = useCan("can_submit_info"); const canPost = useCan("can_post_forum");
  const publish = useMutation({ mutationFn: () => {
    const path = event ? "events" : info ? "infos" : "posts";
    const body = event ? { title, description: content, starts_at: new Date(starts).toISOString(), ends_at: ends ? new Date(ends).toISOString() : undefined, location, organizer, capacity: capacity ? Number(capacity) : undefined, status: "published", type: "other" }
      : info ? { title, content, category: tag === "recruitment" ? "recruitment" : "open", visibility: "all" }
      : { title, content, tags: [tag] };
    return api.post<{ id: string }>(`/${path}`, body);
  }, onSuccess: data => { qc.invalidateQueries({ queryKey: ["feed"] }); router.push(`/${event ? "events" : info ? "infos" : "forum"}/${data.id}`); } });
  const field = "w-full rounded-lg border border-separator bg-field p-2";
  return <form className="mx-auto max-w-2xl space-y-4" onSubmit={e => { e.preventDefault(); publish.mutate(); }}>
    <h1 className="text-2xl font-bold">{zh ? "发布动态" : "Publish to feed"}</h1>
    {publish.error && <ApiErrorAlert error={publish.error} />}
    <label className="block space-y-1"><span>{zh ? "标签" : "Tag"}</span><select className={field} value={tag} onChange={e => setTag(e.target.value)}>
      {[['discussion','讨论','Discussion'],['information','资讯','Information'],['events','活动','Events'],['recruitment','招聘','Recruitment'],['help-wanted','求助','Help wanted']].map(([v,c,en]) => <option key={v} value={v}>{zh ? c : en}</option>)}
    </select></label>
    <label className="block space-y-1"><span>{zh ? "标题" : "Title"}</span><input className={field} required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label className="block space-y-1"><span>{zh ? "正文" : "Content"}</span><textarea className={field} required maxLength={20000} rows={8} value={content} onChange={e => setContent(e.target.value)} /></label>
    {event && <fieldset className="space-y-3 rounded-lg border border-separator p-4"><legend>{zh ? "活动及报名设置" : "Event and registration"}</legend>
      <label className="block">{zh ? "开始时间" : "Starts at"}<input className={field} type="datetime-local" required value={starts} onChange={e => setStarts(e.target.value)} /></label>
      <label className="block">{zh ? "结束时间（可选）" : "Ends at (optional)"}<input className={field} type="datetime-local" min={starts} value={ends} onChange={e => setEnds(e.target.value)} /></label>
      <label className="block">{zh ? "地点" : "Location"}<input className={field} maxLength={240} value={location} onChange={e => setLocation(e.target.value)} /></label>
      <label className="block">{zh ? "组织者名称" : "Organizer name"}<input className={field} maxLength={200} value={organizer} onChange={e => setOrganizer(e.target.value)} /></label>
      <label className="block">{zh ? "人数上限（留空不限）" : "Capacity (blank for unlimited)"}<input className={field} type="number" min={1} max={1000000} value={capacity} onChange={e => setCapacity(e.target.value)} /></label>
      <p className="text-sm text-muted">{zh ? "报名者需填写姓名、联系方式及可选备注。" : "Participants will enter their name, contact details and optional notes."}</p>
    </fieldset>}
    <Button type="submit" isPending={publish.isPending} isDisabled={info ? !canInfo : !canPost}>{zh ? "发布" : "Publish"}</Button>
  </form>;
}
