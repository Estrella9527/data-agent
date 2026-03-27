"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown/Markdown";

interface ResponseCardProps {
  content: string;
  isStreaming?: boolean;
}

export function ResponseCard({ content, isStreaming }: ResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <div className="text-sm leading-relaxed text-foreground">
        <Markdown content={content} />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-accent rounded-sm animate-pulse" />
        )}
      </div>

      {/* Copy button — shown on hover */}
      {!isStreaming && content.length > 0 && (
        <button
          onClick={handleCopy}
          className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-foreground-5 text-foreground-40 hover:text-foreground-60"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
