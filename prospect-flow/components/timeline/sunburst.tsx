import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Claude sunburst mark. `spinning` gives the "thinking" state. */
export function Sunburst({
  className,
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0",
        spinning && "motion-safe:animate-[spin_2.6s_linear_infinite]",
        className,
      )}
    >
      <Image
        src="/claude-logo.png"
        alt=""
        aria-hidden
        fill
        sizes="64px"
        className="object-contain"
        priority
      />
    </span>
  );
}
