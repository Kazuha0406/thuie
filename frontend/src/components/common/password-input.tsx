"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function PasswordInput({ value, onChange, name = "password", disabled = false, autoComplete = "current-password" }: {
  value: string; onChange: (value: string) => void; name?: string; disabled?: boolean; autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const { locale } = useI18n();
  const label = locale === "zh" ? (visible ? "隐藏密码" : "显示密码") : (visible ? "Hide password" : "Show password");
  return <div className="relative flex items-center">
    <input name={name} aria-label={name === "confirm_password" ? (locale === "zh" ? "确认密码" : "Confirm password") : (locale === "zh" ? "密码" : "Password")}
      required type={visible ? "text" : "password"} autoComplete={autoComplete} disabled={disabled}
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-separator bg-field px-3 py-2 pr-12 [&::-ms-reveal]:hidden" />
    <button type="button" aria-label={label} aria-pressed={visible} title={label} disabled={disabled}
      onClick={() => setVisible(v => !v)} className="absolute right-3 rounded p-1 focus-visible:outline-2">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>;
}
