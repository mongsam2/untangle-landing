import { AccentRule } from "@/components/AccentRule";

const CARDS = [
  { n: "01", title: "머릿속을 쏟아내면,\n할 일들로 뽑아줘요" },
  { n: "02", title: "오늘 뭐부터 할지는\n당신이 정해요" },
  { n: "03", title: "고른 일을, 지금 할 수 있는\n작은 행동으로 쪼개줘요" },
];

export function Differentiation() {
  return (
    <section className="flex flex-col gap-6 bg-sys-bg px-6 py-[52px]">
      <AccentRule />

      <h2 className="text-[24px] font-bold leading-[1.34] text-sys-label-strong">
        적은 것이 시작이 되도록
      </h2>

      <div className="flex flex-col gap-4">
        {CARDS.map((card) => (
          <div
            key={card.n}
            className="flex items-center gap-[13px] rounded-[20px] border border-sys-line bg-sys-bg p-6 shadow-[0_6px_20px_-4px_rgba(26,26,36,0.06)]"
          >
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-sys-primary-lighter text-[15px] font-bold text-sys-primary-dark">
              {card.n}
            </div>
            <p className="whitespace-pre-line text-[18.5px] font-bold leading-[1.36] text-sys-label-strong">
              {card.title}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
