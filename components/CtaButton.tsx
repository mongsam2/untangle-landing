import Link from "next/link";
import { Icon } from "@/components/Icon";

/**
 * Primary full-width call-to-action. Defaults to the demo — 랜딩에서는 기능
 * 체험만 권한다. 소감·사전 신청 동선은 체험을 마친 뒤에만 나타나므로, 그쪽을
 * 가리킬 때는 `href`/`label`을 명시적으로 넘긴다.
 *
 * Renders an anchor rather than a <button> because it navigates: that keeps the
 * component server-rendered and preserves native link affordances such as
 * middle-click and "open in new tab".
 */
export function CtaButton({
  label = "지금 바로 체험하기",
  href = "/demo",
  className = "",
}: {
  label?: string;
  href?: string;
  className?: string;
}) {
  const classNames = `flex w-full items-center justify-center gap-2 rounded-[14px] bg-sys-primary-dark px-[30px] py-[19px] text-[17px] font-bold text-sys-on-primary shadow-[0_9px_24px_-2px_rgba(106,69,231,0.28)] transition-shadow hover:shadow-[0_12px_28px_-2px_rgba(106,69,231,0.4)] ${className}`;
  const inner = (
    <>
      {label}
      <Icon name="arrow-right" size={18} strokeWidth={2.2} />
    </>
  );

  return (
    <Link href={href} className={classNames}>
      {inner}
    </Link>
  );
}
