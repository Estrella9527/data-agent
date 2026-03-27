"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSourceStore } from "@/stores/source-store";

interface DatabaseConnectFormProps {
  onSuccess: () => void;
}

export function DatabaseConnectForm({ onSuccess }: DatabaseConnectFormProps) {
  const [dbType, setDbType] = useState<"mysql" | "postgresql">("postgresql");
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createDatabaseSource = useSourceStore((s) => s.createDatabaseSource);

  const handleSubmit = async () => {
    if (!name || !host || !database || !username) {
      setError("请填写所有必填字段");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createDatabaseSource({
        name,
        db_type: dbType,
        host,
        port: parseInt(port) || 5432,
        database,
        username,
        password,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "连接失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* DB Type */}
      <div>
        <label className="text-xs font-medium text-foreground-50 mb-1.5 block">数据库类型</label>
        <div className="flex gap-2">
          {(["postgresql", "mysql"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setDbType(t);
                setPort(t === "mysql" ? "3306" : "5432");
              }}
              className={`flex-1 px-3 py-2 text-sm rounded-inner border transition-colors ${
                dbType === t
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-foreground-10 text-foreground-50 hover:bg-foreground-3"
              }`}
            >
              {t === "postgresql" ? "PostgreSQL" : "MySQL"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground-50 mb-1.5 block">数据源名称 *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：生产数据库" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-foreground-50 mb-1.5 block">主机 *</label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground-50 mb-1.5 block">端口</label>
          <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground-50 mb-1.5 block">数据库名 *</label>
        <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="my_database" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-foreground-50 mb-1.5 block">用户名 *</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="postgres" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground-50 mb-1.5 block">密码</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="******" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive-text">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button className="w-full" disabled={loading} onClick={handleSubmit}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            连接中...
          </>
        ) : (
          "测试连接并添加"
        )}
      </Button>
    </div>
  );
}
