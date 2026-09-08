import { AccentRule } from "@/components/AccentRule";

export function Problem() {
  return (
    <section className="flex flex-col gap-[18px] bg-sys-bg-gray px-6 py-12">
      <AccentRule />

      <h2 className="whitespace-pre-line text-[25px] font-bold leading-[1.34] tracking-[-0.4px] text-sys-label-strong">
        {"계획은 다 있는데,\n시작이 안 됐다면"}
      </h2>

      <p className="text-[15px] leading-[1.66] text-sys-label-neutral">
        종이에, 메모앱에, 투두에 적기는 했어요. 그런데 목록은 길어지고, 손은 안
        움직이고, 밀린 걸 보면 더 미루게 되죠.
      </p>

      <p className="whitespace-pre-line text-[16px] font-semibold leading-[1.6] text-sys-label-strong">
        {
          "부족한 건 ‘적는 도구’가 아니라, \n적은 게 시작으로 이어지는 작은 한 걸음이에요."
        }
      </p>
    </section>
  );
}
