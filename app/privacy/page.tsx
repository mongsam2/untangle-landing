import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CONTACT_EMAIL, PRIVACY_EFFECTIVE_DATE } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — Untangle",
  description:
    "Untangle 베타 체험에서 받는 정보와 이용 목적, 보유기간, 처리위탁 현황을 안내합니다.",
};

/**
 * 개인정보 처리방침 — `/privacy`.
 *
 * 정적 문서라 인터랙션이 없어 Server Component 하나로 끝난다. 셸 구성은
 * app/register/page.tsx와 같다(min-h-dvh + max-w-[480px]): 화면보다 짧은 문서라
 * 퍼센트 min-height는 auto 높이 body에 붙어 무너진다.
 *
 * 본문은 코드가 실제로 하는 일과 일치해야 한다. 수집 항목은
 * app/register/actions.ts, AI 전송은 app/api/chat/route.ts와 lib/chat/proxy.ts,
 * 기기 저장은 components/demo/state.ts를 근거로 적었다. 그쪽 동작이 바뀌면
 * 이 문서도 함께 고쳐야 한다.
 */

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  footnote?: string;
};

const SECTIONS: Section[] = [
  {
    title: "1. 받는 정보",
    paragraphs: [
      "체험을 마친 뒤 소감 폼에 직접 적어주시는 내용을 받습니다. 데모에서 나눈 대화와 정리된 할 일은 답변을 만드는 동안에만 서버를 지나가며, 어디에도 저장하지 않습니다.",
    ],
    bullets: [
      "필수 — 체험 만족도 점수(1~5)",
      "선택 — 아쉬웠던 이유, 자유롭게 적어주신 의견",
      "선택 — 사전 신청·인터뷰 연락처(이메일 또는 휴대폰 번호), 사용자 인터뷰 참여 의향",
      "데모 대화와 할 일 — 답변을 만들기 위해 저희 서버를 거쳐 AI 제공자에게 전송됩니다.",
    ],
    footnote:
      "데모에서 적으신 문장과 정리된 할 일은 AI 답변을 만드는 데에만 씁니다. 저희 서버는 그 내용을 받아 AI 서버로 전달할 뿐, 데이터베이스에 저장하거나 서비스 로그에 남기지 않습니다. 방문을 추적하는 익명 식별자나 화면 기록도 남기지 않고, 광고 식별자와 쿠키도 쓰지 않습니다. 대화와 할 일이 이어지는 것은 7항처럼 이용자 브라우저에 저장되기 때문입니다.",
  },
  {
    title: "2. 쓰는 곳",
    bullets: [
      "체험이 어땠는지 파악하고 서비스를 고쳐나가는 데 씁니다.",
      "정식 출시 안내 — 연락처를 남겨주신 분에게만 보냅니다.",
      "사용자 인터뷰 요청 — 연락처를 남겨주신 분에게 인터뷰 참여를 여쭤보는 연락을 드릴 수 있습니다. 참여 의향을 남겨주신 분에게 우선 연락드립니다.",
    ],
    footnote: "위 세 가지 밖의 일에는 쓰지 않습니다.",
  },
  {
    title: "3. 얼마나 두는지, 어떻게 지우는지",
    bullets: [
      "연락처 — 정식 출시 안내와 인터뷰 요청 연락을 마친 뒤 곧바로 지웁니다.",
      "만족도와 소감 — 서비스를 고치는 데 참고하려고 보관합니다. 연락처를 지운 뒤에는 누가 남긴 것인지 알아볼 수 없는 형태로 남습니다.",
      "지워달라고 하시면 요청하신 내용을 곧바로 지웁니다.",
    ],
  },
  {
    title: "4. 맡기는 곳과 국외 이전",
    paragraphs: [
      "아래 사업자에게 처리를 맡기고 있으며, 모두 미국에 서버를 두고 있습니다.",
    ],
    bullets: [
      "Google LLC — 소감 응답 저장(스프레드시트)",
      "Anthropic PBC · OpenAI — 데모 대화를 이해하고 할 일로 정리하는 처리",
      "Vercel Inc. — 웹사이트 호스팅",
    ],
    footnote:
      "데모에서 적으신 문장과 지금까지 정리된 할 일은, 다음 답변을 만들기 위해 저희 AI 서버를 거쳐 위 AI 제공자에게 그대로 전송됩니다. 이름이나 연락처처럼 누군가를 특정할 수 있는 내용은 적지 않으시길 권해요.",
  },
  {
    title: "5. 이용자의 권리",
    paragraphs: [
      "언제든지 본인의 정보를 보여달라고 하거나, 고치거나 지워달라고, 또는 처리를 멈춰달라고 요청하실 수 있습니다.",
      "아래 문의처로 연락 주시면 확인한 뒤 지체 없이 처리하고 결과를 알려드립니다. 이때 요청하신 분이 본인이 맞는지 확인하기 위해, 남겨주신 연락처로 회신드립니다.",
    ],
  },
  {
    title: "6. 안전하게 지키기 위해 하는 일",
    bullets: [
      "주고받는 모든 구간을 HTTPS로 암호화합니다.",
      "응답을 저장하는 경로는 서버에만 있는 토큰으로 인증합니다.",
      "외부 서비스 키는 서버 환경변수에만 두고 브라우저로 내려보내지 않습니다.",
    ],
  },
  {
    title: "7. 기기에 남는 정보",
    paragraphs: [
      "다시 방문하셔도 이어서 하실 수 있도록 데모의 대화 내용, 정리된 할 일의 제목·설명·서브태스크, 그리고 완료 체크 여부를 브라우저 저장소에 남깁니다. 이 정보는 이용자 기기에만 있고 저희 서버에 저장하지 않습니다. 완료 여부는 브라우저에만 두며 AI에게 보내지 않습니다.",
    ],
    footnote:
      "데모 안에는 저장된 내용을 지우는 버튼을 따로 두지 않았습니다. 지우시려면 브라우저 설정에서 이 사이트의 데이터(사이트 데이터·저장 공간)를 삭제해 주세요. 그러면 대화와 할 일, 완료 상태가 모두 사라집니다.",
  },
];

export default function Privacy() {
  return (
    <div className="flex min-h-dvh justify-center bg-[var(--backdrop)]">
      <main className="flex w-full max-w-[480px] flex-col bg-sys-bg px-6 pt-3 pb-10 shadow-[0_0_60px_-20px_rgba(26,26,36,0.15)]">
        <div className="flex justify-end pb-1">
          <Link
            href="/"
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center text-sys-label-neutral"
          >
            <Icon name="x" size={22} />
          </Link>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <h1 className="text-[27px] font-bold leading-[1.34] tracking-[-0.5px] text-sys-label-strong">
            개인정보 처리방침
          </h1>
          <p className="text-[15px] leading-[1.6] text-sys-label-neutral">
            소감으로 적어주시는 내용을 받아요. 데모에서 나눈 대화와 할 일은
            답변을 만드는 동안에만 지나가고, 이용자 브라우저에만 남아요.
          </p>
        </div>

        <div className="flex flex-col gap-7 pt-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-bold text-sys-label-strong">
                {section.title}
              </h2>

              {section.paragraphs?.map((text) => (
                <p
                  key={text}
                  className="text-[14px] leading-[1.7] text-sys-label-neutral"
                >
                  {text}
                </p>
              ))}

              {section.bullets && (
                <ul className="flex flex-col gap-1.5">
                  {section.bullets.map((text) => (
                    <li key={text} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-sys-label-alt"
                      />
                      <span className="text-[14px] leading-[1.7] text-sys-label-neutral">
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {section.footnote && (
                <p className="rounded-xl bg-sys-bg-gray px-4 py-3 text-[13px] leading-[1.65] text-sys-label-neutral">
                  {section.footnote}
                </p>
              )}
            </section>
          ))}

          {/* 문의처만 링크가 들어가 별도로 렌더한다 — 나머지는 순수 텍스트다. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-bold text-sys-label-strong">
              8. 문의처
            </h2>
            <p className="text-[14px] leading-[1.7] text-sys-label-neutral">
              개인정보와 관련한 문의나 요청은{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-sys-primary-dark underline"
              >
                {CONTACT_EMAIL}
              </a>
              으로 보내주세요.
            </p>
            <p className="text-[14px] leading-[1.7] text-sys-label-neutral">
              만 14세 미만 아동의 개인정보는 받지 않습니다.
            </p>
          </section>
        </div>

        <div className="mt-9 border-t border-sys-line pt-5">
          <p className="text-[12.5px] leading-[1.6] text-sys-label-alt">
            Untangle 팀
            <br />
            시행일 {PRIVACY_EFFECTIVE_DATE}
          </p>
        </div>
      </main>
    </div>
  );
}
