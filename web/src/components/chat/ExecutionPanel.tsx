"use client";

import React, { useState, useCallback } from "react";
import type { GoalExecution } from "@/stores/chat-store";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Code2,
  Table2,
  Lightbulb,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  ImageIcon,
  X,
  FileText,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

SyntaxHighlighter.registerLanguage("python", python);

interface ExecutionPanelProps {
  executions: GoalExecution[];
  activeGoalId: string | null;
  isStreaming: boolean;
  reportMarkdown?: string | null;
}

export function ExecutionPanel({
  executions,
  activeGoalId,
  isStreaming,
  reportMarkdown,
}: ExecutionPanelProps) {
  if (executions.length === 0) return null;

  const completed = executions.filter((e) => e.status === "success").length;
  const total = executions[0]?.total ?? executions.length;
  const hasErrors = executions.some((e) => e.status === "error");
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-foreground-10 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-foreground-5 bg-foreground-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            ) : hasErrors ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-sm font-medium text-foreground-70">
              执行进度
            </span>
          </div>
          <span className="text-xs text-foreground-40">
            {completed}/{total} 目标完成
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-foreground-5 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Goal list */}
      <div className="divide-y divide-foreground-5">
        {executions.map((exec) => (
          <GoalExecutionRow
            key={exec.goalId}
            execution={exec}
            isActive={exec.goalId === activeGoalId}
          />
        ))}
      </div>

      {/* Report section */}
      {reportMarkdown && <ReportSection markdown={reportMarkdown} />}
    </div>
  );
}

function GoalExecutionRow({
  execution: exec,
  isActive,
}: {
  execution: GoalExecution;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(
    exec.code ||
    exec.columns ||
    exec.insight ||
    exec.error ||
    (exec.chartUrls && exec.chartUrls.length > 0)
  );

  return (
    <div className={isActive ? "bg-accent/3" : ""}>
      {/* Summary row */}
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-foreground-3 transition-colors disabled:cursor-default"
      >
        {/* Status icon */}
        <StatusIcon status={exec.status} />

        {/* Goal info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-30">
              目标 {exec.index + 1}
            </span>
            {exec.status === "retrying" && exec.attempt && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                重试 {exec.attempt}/{exec.maxAttempts}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground-70 truncate">{exec.title}</p>
        </div>

        {/* Expand toggle */}
        {hasDetail && (
          <span className="text-foreground-20">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>
        )}
      </button>

      {/* Detail section */}
      {expanded && hasDetail && (
        <div className="px-4 pb-3 space-y-3">
          {/* Generated code */}
          {exec.code && <CodeBlock code={exec.code} lang={exec.codeType} />}

          {/* Result table */}
          {exec.columns && exec.rows && exec.rows.length > 0 && (
            <ResultTable
              columns={exec.columns}
              rows={exec.rows}
              rowCount={exec.rowCount}
            />
          )}

          {/* Charts */}
          {exec.chartUrls && exec.chartUrls.length > 0 && (
            <ChartGallery
              urls={exec.chartUrls}
              interpretations={exec.chartInterpretations}
            />
          )}

          {/* Insight */}
          {exec.insight && (
            <div className="flex gap-2 p-3 rounded-lg bg-blue-50/70 border border-blue-100">
              <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 whitespace-pre-wrap">
                {exec.insight}
              </p>
            </div>
          )}

          {/* Error */}
          {exec.error && exec.status === "error" && (
            <div className="space-y-2">
              <div className="flex gap-2 p-3 rounded-lg bg-red-50/70 border border-red-100">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-mono whitespace-pre-wrap">
                  {exec.error}
                </p>
              </div>
              <p className="text-xs text-foreground-40 px-1">
                代码生成或执行出现问题，请尝试重新提问或调整问题描述
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: GoalExecution["status"] }) {
  switch (status) {
    case "pending":
      return (
        <div className="w-5 h-5 rounded-full border-2 border-foreground-10" />
      );
    case "running":
      return <Loader2 className="w-5 h-5 animate-spin text-accent" />;
    case "success":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case "error":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "retrying":
      return <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />;
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const lineCount = code.split("\n").length;
  const preview = code.split("\n").slice(0, 3).join("\n");
  const displayCode = show ? code : preview + (lineCount > 3 ? "\n..." : "");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback silently
    }
  }, [code]);

  return (
    <div className="rounded-lg border border-foreground-8 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground-3">
        <button
          onClick={() => setShow(!show)}
          className="flex items-center gap-2 flex-1 hover:opacity-70 transition-opacity text-left"
        >
          <Code2 className="w-3.5 h-3.5 text-foreground-30" />
          <span className="text-xs text-foreground-40">
            {lang || "python"} · {lineCount} 行
          </span>
          <span className="text-foreground-20">
            {show ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        </button>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-foreground-8 transition-colors text-foreground-30"
          title="复制代码"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language="python"
        style={githubGist}
        customStyle={{
          margin: 0,
          padding: "8px 12px",
          fontSize: "12px",
          maxHeight: "300px",
          overflow: "auto",
          background: "var(--foreground-2, #fafafa)",
        }}
      >
        {displayCode}
      </SyntaxHighlighter>
    </div>
  );
}

function ChartGallery({
  urls,
  interpretations,
}: {
  urls: string[];
  interpretations?: Record<string, string>;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Close lightbox on Escape key
  React.useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxUrl]);

  return (
    <>
      <div className="rounded-lg border border-foreground-8 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-foreground-3 border-b border-foreground-5">
          <ImageIcon className="w-3.5 h-3.5 text-foreground-30" />
          <span className="text-xs text-foreground-40">
            {urls.length} 张图表
          </span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {urls.map((url) => (
            <div key={url} className="space-y-1">
              <button
                onClick={() => setLightboxUrl(url)}
                className="rounded-lg overflow-hidden border border-foreground-5 hover:border-accent/40 transition-colors cursor-zoom-in w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Chart"
                  className="w-full h-auto"
                  loading="lazy"
                />
              </button>
              {interpretations?.[url] && (
                <p className="text-[11px] text-foreground-40 leading-relaxed px-1">
                  {interpretations[url]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox dialog */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full bg-white shadow-lg hover:bg-foreground-5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Chart (enlarged)"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}

function ResultTable({
  columns,
  rows,
  rowCount,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount?: number;
}) {
  // Show at most 20 rows
  const displayRows = rows.slice(0, 20);
  const hasMore = (rowCount ?? rows.length) > displayRows.length;

  // If single "output" column with raw text, render as text block
  if (
    columns.length === 1 &&
    columns[0] === "output" &&
    displayRows.length === 1
  ) {
    return (
      <div className="rounded-lg border border-foreground-8 p-3 bg-foreground-2">
        <pre className="text-xs font-mono text-foreground-60 whitespace-pre-wrap">
          {String(displayRows[0]?.output ?? "")}
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-foreground-8 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground-3 border-b border-foreground-5">
        <Table2 className="w-3.5 h-3.5 text-foreground-30" />
        <span className="text-xs text-foreground-40">
          {rowCount ?? rows.length} 行 · {columns.length} 列
        </span>
      </div>
      <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-foreground-5 bg-foreground-2">
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left px-3 py-1.5 font-medium text-foreground-50 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-foreground-3 hover:bg-foreground-2"
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-1.5 text-foreground-60 whitespace-nowrap max-w-[200px] truncate"
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="px-3 py-1.5 text-[10px] text-foreground-30 bg-foreground-2 border-t border-foreground-5">
          显示前 {displayRows.length} 行，共 {rowCount ?? rows.length} 行
        </div>
      )}
    </div>
  );
}

function ReportSection({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback silently
    }
  }, [markdown]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [markdown]);

  return (
    <div className="border-t border-foreground-10">
      {/* Report header */}
      <div className="flex items-center justify-between px-4 py-3 bg-foreground-2 border-b border-foreground-5">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground-70">
            分析报告
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-foreground-40 hover:bg-foreground-8 transition-colors"
            title="复制报告"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "已复制" : "复制"}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-foreground-40 hover:bg-foreground-8 transition-colors"
            title="下载 .md"
          >
            <Download className="w-3.5 h-3.5" />
            下载
          </button>
        </div>
      </div>
      {/* Report body */}
      <div className="px-4 py-4 prose prose-sm prose-slate max-w-none
        prose-headings:text-foreground-80 prose-headings:font-semibold
        prose-h1:text-base prose-h1:mb-3 prose-h1:mt-0
        prose-h2:text-sm prose-h2:mb-2 prose-h2:mt-4
        prose-h3:text-sm prose-h3:mb-1.5 prose-h3:mt-3
        prose-p:text-foreground-60 prose-p:text-sm prose-p:leading-relaxed
        prose-li:text-foreground-60 prose-li:text-sm
        prose-strong:text-foreground-70
        prose-img:rounded-lg prose-img:border prose-img:border-foreground-8 prose-img:max-w-md prose-img:mx-auto
        prose-table:text-xs
        prose-th:px-2 prose-th:py-1 prose-th:bg-foreground-3
        prose-td:px-2 prose-td:py-1
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
