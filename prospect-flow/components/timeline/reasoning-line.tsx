"use client";

import { useEffect, useState } from "react";
import { Sunburst } from "@/components/timeline/sunburst";

/** Reveals `text` word-by-word for a live "thinking" feel. */
function useStreamedText(text: string, msPerToken = 45) {
  const [count, setCount] = useState(0);
  const tokens = text.split(/(\s+)/); // keep whitespace so spacing is preserved

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= tokens.length) clearInterval(timer);
    }, msPerToken);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { shown: tokens.slice(0, count).join(""), done: count >= tokens.length };
}

export function ReasoningLine({ text }: { text: string }) {
  const { shown, done } = useStreamedText(text);

  return (
    <div className="flex gap-2.5 px-1 text-muted-foreground">
      <Sunburst className="mt-0.5 size-4" />
      <p className="text-[13px] leading-relaxed">
        {shown}
        {!done && (
          <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-brand/60 align-middle" />
        )}
      </p>
    </div>
  );
}
