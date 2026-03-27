"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { ClarifyQuestion } from "@/types/events";

interface ClarifyCardProps {
  questions: ClarifyQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function ClarifyCard({
  questions,
  onSubmit,
  onSkip,
  disabled = false,
}: ClarifyCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    onSubmit(answers);
  };

  const handleSkip = () => {
    setSubmitted(true);
    onSkip();
  };

  if (!questions.length) return null;

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-100">
        <HelpCircle className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-blue-700">
          需要确认以下信息
        </span>
      </div>

      {/* Questions */}
      <div className="px-3 py-2 space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1">
            <label className="text-sm text-foreground-70 block">
              {q.question}
            </label>
            {q.default_assumption && (
              <p className="text-xs text-foreground-40">
                默认假设: {q.default_assumption}
              </p>
            )}
            {!submitted && (
              <input
                className="w-full text-sm bg-white border border-blue-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-400 placeholder:text-foreground-30"
                placeholder={q.default_assumption || "输入回答..."}
                value={answers[q.topic] || ""}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [q.topic]: e.target.value,
                  }))
                }
                disabled={disabled}
              />
            )}
            {submitted && answers[q.topic] && (
              <p className="text-sm text-foreground-60 bg-white/50 px-2.5 py-1 rounded">
                {answers[q.topic]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {!submitted && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-blue-100">
          <button
            onClick={handleSkip}
            disabled={disabled}
            className="text-xs text-foreground-50 hover:text-foreground-70 px-3 py-1.5 rounded-md hover:bg-foreground-5 transition-colors disabled:opacity-50"
          >
            使用默认假设继续
          </button>
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="text-xs text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          >
            提交回答
          </button>
        </div>
      )}

      {submitted && (
        <div className="px-3 py-1.5 border-t border-blue-100 text-xs text-blue-500">
          已提交
        </div>
      )}
    </div>
  );
}
