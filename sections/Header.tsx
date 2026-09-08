import Link from "next/link";
import { Logo } from "@/components/Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-sys-line bg-sys-bg/90 px-6 py-[13px] backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Logo size={30} />
        <span className="text-[18px] font-bold tracking-[-0.36px] text-sys-label-strong">
          Untangle
        </span>
      </div>
      {/* 랜딩에는 체험 동선만 둔다 — 소감·사전 신청은 체험 이후에만 묻는다. */}
      <Link
        href="/demo"
        className="text-[13px] font-semibold text-sys-primary-dark"
      >
        체험하기
      </Link>
    </header>
  );
}
