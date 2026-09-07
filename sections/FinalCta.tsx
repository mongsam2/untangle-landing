import Link from "next/link";
import { CtaButton } from "@/components/CtaButton";
import { CONTACT_EMAIL } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="flex flex-col items-center gap-[14px] bg-sys-bg px-6 pt-[50px] pb-[58px]">
      {/* 스크롤 마무리도 체험으로 닫는다 — 소감 요청은 체험 이후에만 (실사용자
          피드백: 체험 전 소감 노출이 "왜 있지?" 이탈을 만들었다). */}
      <h2 className="whitespace-pre-line text-center text-[23px] font-bold leading-[1.36] tracking-[-0.3px] text-sys-label-strong">
        {"지금 가장 막막한 일,\n하나만 같이 쪼개봐요"}
      </h2>

      <p className="text-center text-[14px] leading-[1.6] text-sys-label-neutral">
        가입 없이 바로 시작해요. 하나만 해보고 닫아도 괜찮아요.
      </p>

      <div className="w-full pt-2.5">
        <CtaButton />
      </div>

      {/* 사전 신청으로 연락처를 받는 이상 두 링크는 실제로 닿아야 한다 —
          이전에는 href도 onClick도 없는 버튼이라 눌러도 아무 일도 없었다. */}
      <div className="flex justify-center gap-[18px] pt-1.5">
        <Link
          href="/privacy"
          className="text-[13px] text-sys-label-neutral transition-colors hover:text-sys-label-strong"
        >
          개인정보 처리방침
        </Link>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-[13px] text-sys-label-neutral transition-colors hover:text-sys-label-strong"
        >
          문의하기
        </a>
      </div>
    </section>
  );
}
