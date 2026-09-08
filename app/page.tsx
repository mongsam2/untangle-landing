import { Header } from "@/sections/Header";
import { Hero } from "@/sections/Hero";
import { Problem } from "@/sections/Problem";
import { Differentiation } from "@/sections/Differentiation";
import { WhoFor } from "@/sections/WhoFor";
import { FinalCta } from "@/sections/FinalCta";

export default function Home() {
  return (
    <div className="flex min-h-full justify-center bg-[var(--backdrop)]">
      <main className="w-full max-w-[480px] bg-sys-bg shadow-[0_0_60px_-20px_rgba(26,26,36,0.15)]">
        <Header />
        <Hero />
        <Problem />
        <Differentiation />
        <WhoFor />
        <FinalCta />
      </main>
    </div>
  );
}
