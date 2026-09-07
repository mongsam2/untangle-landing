import { AccentRule } from "@/components/AccentRule";

const STATS = [
  {
    num: "4.4%",
    caption: "성인 4.4%가 ADHD, 도움받는 비율은 20% 미만",
    source: "NIH",
  },
  {
    num: "80%",
    caption: "정리·시간관리·할 일 완료에 어려움",
    source: "J. of Attention Disorders",
  },
  {
    num: "3×",
    caption: "스트레스·우울 등 정서적 어려움 가능성",
    source: "NCS-R",
  },
];

export function WhoFor() {
  return (
    <section className="flex flex-col gap-[18px] bg-sys-bg-gray px-6 py-[52px]">
      <AccentRule />

      <h2 className="whitespace-pre-line text-[23px] font-bold leading-[1.38] tracking-[-0.3px] text-sys-label-strong">
        {"여러 앱 다 써봤는데도,\n시작에서 무너진다면"}
      </h2>

      <p className="text-[15px] leading-[1.64] text-sys-label-neutral">
        메모앱·투두·플래너에 적기는 하는데 그게 시작으로 안 이어지는 분들을 위해
        만들고 있어요.
      </p>

      <div className="flex flex-col gap-[14px] pt-[26px]">
        <span className="text-[11.5px] font-semibold tracking-[0.8px] text-sys-label-neutral">
          참고 — ADHD 연구가 말해주는 것
        </span>
        <div className="flex gap-[14px]">
          {STATS.map((stat) => (
            <div key={stat.num} className="flex flex-1 flex-col gap-[5px]">
              <span className="text-[26px] font-bold tracking-[-0.5px] text-sys-primary-dark">
                {stat.num}
              </span>
              <span className="text-[11.5px] leading-[1.42] text-sys-label-neutral">
                {stat.caption}
              </span>
              <span className="text-[10px] leading-[1.3] text-sys-label-alt">
                {stat.source}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
