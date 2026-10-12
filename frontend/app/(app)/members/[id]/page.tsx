"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/auth/guards";
import { StateBoundary } from "@/components/common/state";
type Member = { id: string; name: string; bio: string | null; role: string; graduated: boolean; grade_year: string | null; graduation_year: string | null; department: { name_zh: string; name_en: string } | null; program: string | null };
export default function MemberPage() {
  const { id } = useParams<{ id: string }>(); const me = useCurrentUser();
  const { locale } = useI18n(); const zh = locale === "zh";
  const query = useQuery({ queryKey: ["member", id], queryFn: () => api.get<Member>(`/members/${id}`) });
  const member = query.data;
  return <div className="mx-auto max-w-2xl"><StateBoundary isLoading={query.isLoading} isError={query.isError} error={query.error}>
    {member && <article className="space-y-4 rounded-xl border border-separator p-6">
      <h1 className="text-2xl font-bold">{member.name}</h1>
      <p>{member.role.startsWith("admin") ? (zh ? "管理员" : "Moderator") : member.graduated ? (zh ? "成员 · 已毕业" : "Member · Graduated") : (zh ? "成员 · 未毕业" : "Member · Not graduated")}</p>
      <p>{member.department?.[zh ? "name_zh" : "name_en"]} {member.program}</p>
      <p>{zh ? "入学年份" : "Enrollment year"}: {member.grade_year ?? "—"} · {zh ? "毕业年份" : "Graduation year"}: {member.graduation_year ?? "—"}</p>
      <p className="whitespace-pre-wrap">{member.bio}</p>
      {me?.id !== member.id && <Link className="inline-block rounded-lg bg-accent px-4 py-2 text-accent-foreground" href={`/messages/new?peer=${member.id}&name=${encodeURIComponent(member.name)}`}>{zh ? "发送私信" : "Send message"}</Link>}
    </article>}
  </StateBoundary></div>;
}
