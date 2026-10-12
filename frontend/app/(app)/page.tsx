"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth/guards";
export default function HomePage() {
  const user = useCurrentUser();
  const router = useRouter();
  useEffect(() => { if (user) router.replace(user.role.startsWith("admin") ? "/admin/review" : "/feed"); }, [user, router]);
  return null;
}
