"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSourceStore } from "@/stores/source-store";

interface FileUploadFormProps {
  onSuccess: () => void;
}

export function FileUploadForm({ onSuccess }: FileUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFile = useSourceStore((s) => s.uploadFile);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "tsv"].includes(ext)) {
      setError("不支持的文件格式，请选择 CSV、Excel 或 TSV 文件");
      return;
    }
    setFile(f);
    setError("");
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }, [name]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await uploadFile(file, name || undefined);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-[var(--radius-inner)] p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-accent bg-accent/5"
            : file
            ? "border-success/50 bg-success/5"
            : "border-foreground-10 hover:border-foreground-20"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.tsv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-8 h-8 text-success" />
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-foreground-50">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-foreground-30" />
            <p className="text-sm text-foreground-50">
              拖拽文件到这里，或点击选择
            </p>
            <p className="text-xs text-foreground-30">
              支持 CSV、Excel、TSV，最大 200MB
            </p>
          </div>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-medium text-foreground-50 mb-1.5 block">
          数据源名称
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="为数据源取个名字"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive-text">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        className="w-full"
        disabled={!file || uploading}
        onClick={handleSubmit}
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            上传中...
          </>
        ) : (
          "上传并分析"
        )}
      </Button>
    </div>
  );
}
