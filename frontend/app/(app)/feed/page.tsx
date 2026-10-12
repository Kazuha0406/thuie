"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Card } from "@heroui/react";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Author } from "@/components/common/author";
import { Highlight } from "@/components/common/highlight";
import { StateBoundary } from "@/components/common/state";
import type { UserBrief } from "@/lib/api/types";

const labels = { all: ["全部", "All"], information: ["资讯", "Information"], discussion: ["讨论", "Discussion"], events: ["活动", "Events"], recruitment: ["招聘", "Recruitment"], "help-wanted": ["求助", "Help wanted"] };
type Item = { kind: "info" | "post" | "event"; id: string; title: string; content: string; created_at: string; tags: string[]; like_count: number; author: UserBrief };
function Feed() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const params = useSearchParams();
  const router = useRouter();
  const tag = params.get("tag") ?? "all";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["feed", tag, q, sort, page], queryFn: () => api.get<{ data: Item[]; total: number; tag_labels: Record<string,string> }>("/feed", { params: { tag: tag === "all" ? undefined : tag, q, sort, page, limit: 20 } }) });
  return <div className="mx-auto max-w-3xl space-y-5">
    <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">{zh ? "动态" : "Feed"}</h1><Link className="rounded-lg bg-accent px-4 py-2 text-accent-foreground" href="/feed/new">{zh ? "发布动态" : "Publish"}</Link></header>
    <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([key, label]) => <Button key={key} size="sm" variant={tag === key ? "primary" : "tertiary"} onPress={() => { setPage(1); router.replace(`/feed?tag=${key}`); }}>{label[zh ? 0 : 1]}</Button>)}</div>
    <div className="flex flex-wrap gap-3">
      <input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} aria-label={zh ? "搜索动态" : "Search feed"} placeholder={zh ? "搜索动态" : "Search feed"} className="min-w-0 flex-1 rounded-lg border border-separator bg-field p-2" />
      <select aria-label={zh ? "排序" : "Sort"} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className="rounded-lg border border-separator bg-field p-2">
        <option value="newest">{zh ? "最新发布" : "Newest first"}</option><option value="oldest">{zh ? "最早发布" : "Oldest first"}</option><option value="likes">{zh ? "最多点赞" : "Most liked"}</option>
      </select>
      <Link href="/events/registrations" className="self-center text-sm text-accent">{zh ? "我的报名" : "My registrations"}</Link>
    </div>
    <StateBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} isEmpty={!query.data?.data.length}>
      <div className="space-y-3">{query.data?.data.map(item => <Card key={`${item.kind}:${item.id}`}><Card.Content className="gap-3">
        <Author user={item.author} />
        <Link href={`/${{ info: "infos", post: "forum", event: "events" }[item.kind]}/${item.id}`} className="space-y-2 hover:text-accent">
          <h2 className="text-lg font-semibold"><Highlight text={item.title} query={q} /></h2>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm"><Highlight text={item.content} query={q} /></p>
        </Link>
        <div className="flex flex-wrap gap-2 text-xs text-muted">{item.tags.map(tag => <button key={tag} onClick={() => { setPage(1); router.replace(`/feed?tag=${encodeURIComponent(tag)}`); }}>#{labels[tag as keyof typeof labels]?.[zh ? 0 : 1] ?? query.data?.tag_labels[tag] ?? tag}</button>)}<span>♥ {item.like_count}</span><time>{new Date(item.created_at).toLocaleString(locale)}</time></div>
      </Card.Content></Card>)}</div>
    </StateBoundary>
    <div className="flex items-center justify-between"><Button variant="tertiary" isDisabled={page === 1} onPress={() => setPage(p => p - 1)}>{zh ? "上一页" : "Previous"}</Button><span>{page}</span><Button variant="tertiary" isDisabled={page * 20 >= (query.data?.total ?? 0)} onPress={() => setPage(p => p + 1)}>{zh ? "下一页" : "Next"}</Button></div>
  </div>;
}
export default function Page() { return <Suspense fallback={null}><Feed /></Suspense>; }
