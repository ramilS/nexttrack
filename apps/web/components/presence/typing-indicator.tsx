'use client';

interface TypingIndicatorProps {
  userNames: string[];
}

export function TypingIndicator({ userNames }: TypingIndicatorProps) {
  if (userNames.length === 0) return null;

  const text =
    userNames.length === 1
      ? `${userNames[0]} is typing...`
      : userNames.length === 2
        ? `${userNames[0]} and ${userNames[1]} are typing...`
        : `${userNames[0]} and ${userNames.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex gap-0.5">
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-xs text-muted-foreground">{text}</span>
    </div>
  );
}
