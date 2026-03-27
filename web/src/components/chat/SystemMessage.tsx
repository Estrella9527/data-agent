"use client";

interface SystemMessageProps {
  content: string;
}

export function SystemMessage({ content }: SystemMessageProps) {
  return (
    <div className="flex justify-center">
      <div className="text-xs text-foreground-40 bg-foreground-2 px-3 py-1 rounded-full">
        {content}
      </div>
    </div>
  );
}
