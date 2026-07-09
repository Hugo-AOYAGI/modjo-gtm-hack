export function UserPromptBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-[15px] text-foreground">
        {text}
      </div>
    </div>
  );
}
