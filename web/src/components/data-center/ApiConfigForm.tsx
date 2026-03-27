"use client";

import { useState } from "react";
import {
  Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronRight,
  Zap, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSourceStore } from "@/stores/source-store";
import type { AuthType, PaginationMode, SyncStrategy } from "@/types/source";

interface ApiConfigFormProps {
  onSuccess: () => void;
}

/* ── Reusable UI pieces ────────────────────── */

function Section({
  title, subtitle, open, onToggle, children,
}: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border border-foreground-5 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-foreground-2 transition-colors">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-foreground-40 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-foreground-40 flex-shrink-0" />}
        <span className="text-xs font-medium text-foreground">{title}</span>
        {subtitle && <span className="text-[10px] text-foreground-30 ml-auto">{subtitle}</span>}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function PillSelect<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs rounded-inner border transition-colors ${
            value === o.value ? "border-accent bg-accent/10 text-accent" : "border-foreground-10 text-foreground-50 hover:bg-foreground-3"
          }`}>{o.label}</button>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-foreground-50 mb-1 block">{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-foreground-30 mt-1">{children}</p>;
}

function SecretInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-8" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-40">
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/* ── Presets ────────────────────────────────── */
const AUTH_PRESETS: Record<string, {
  label: string; id_field: string; secret_field: string;
  token_content_type: string; token_method: string;
  token_response_path: string; extra_fields?: Record<string, string>;
}> = {
  custom: { label: "自定义", id_field: "client_id", secret_field: "client_secret", token_content_type: "json", token_method: "POST", token_response_path: "$.access_token" },
  xiaotie: { label: "小铁柜", id_field: "corp_id", secret_field: "corp_secret", token_content_type: "json", token_method: "POST", token_response_path: "$.access_token" },
  oauth2: { label: "标准 OAuth2", id_field: "client_id", secret_field: "client_secret", token_content_type: "form", token_method: "POST", token_response_path: "$.access_token", extra_fields: { grant_type: "client_credentials" } },
  feishu: { label: "飞书", id_field: "app_id", secret_field: "app_secret", token_content_type: "json", token_method: "POST", token_response_path: "$.tenant_access_token" },
  wecom: { label: "企业微信", id_field: "corpid", secret_field: "corpsecret", token_content_type: "query", token_method: "GET", token_response_path: "$.access_token" },
  dingtalk: { label: "钉钉", id_field: "appkey", secret_field: "appsecret", token_content_type: "query", token_method: "GET", token_response_path: "$.access_token" },
};

/* ── Main form ─────────────────────────────── */

export function ApiConfigForm({ onSuccess }: ApiConfigFormProps) {
  // Basic
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");

  // Auth type
  const [authType, setAuthType] = useState<AuthType>("none");

  // Layer 1: Static
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeyPosition, setApiKeyPosition] = useState<"header" | "query">("header");
  const [bearerToken, setBearerToken] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");

  // Layer 2: Token exchange
  const [tokenPreset, setTokenPreset] = useState("custom");
  const [tokenUrl, setTokenUrl] = useState("");
  const [tokenMethod, setTokenMethod] = useState<"POST" | "GET">("POST");
  const [tokenContentType, setTokenContentType] = useState<"json" | "form" | "query">("json");
  const [idField, setIdField] = useState("client_id");
  const [secretField, setSecretField] = useState("client_secret");
  const [idValue, setIdValue] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [tokenResponsePath, setTokenResponsePath] = useState("$.access_token");
  const [tokenExtraFields, setTokenExtraFields] = useState("");

  // Layer 3: Alibaba Cloud
  const [aliyunKeyId, setAliyunKeyId] = useState("");
  const [aliyunKeySecret, setAliyunKeySecret] = useState("");
  const [aliyunApiVersion, setAliyunApiVersion] = useState("");

  // Request extras
  const [extraParams, setExtraParams] = useState("");
  const [extraHeaders, setExtraHeaders] = useState("");
  const [requestBody, setRequestBody] = useState("");

  // Response parse
  const [recordsPath, setRecordsPath] = useState("");
  const [flattenNested, setFlattenNested] = useState(true);
  const [fieldMapping, setFieldMapping] = useState("");
  const [excludeFields, setExcludeFields] = useState("");

  // Pagination
  const [pagMode, setPagMode] = useState<PaginationMode>("disabled");
  const [paramsIn, setParamsIn] = useState<"query" | "body">("query");
  const [pageSize, setPageSize] = useState("100");
  const [maxPages, setMaxPages] = useState("50");
  const [offsetParam, setOffsetParam] = useState("offset");
  const [limitParam, setLimitParam] = useState("limit");
  const [cursorParam, setCursorParam] = useState("cursor");
  const [cursorPath, setCursorPath] = useState("");
  const [pageParam, setPageParam] = useState("page");

  // Sync
  const [syncStrategy, setSyncStrategy] = useState<SyncStrategy>("full_refresh");
  const [incrementalField, setIncrementalField] = useState("");
  const [incrementalParam, setIncrementalParam] = useState("");

  // Dependency (parent→child)
  const [depEnabled, setDepEnabled] = useState(false);
  const [depEndpoint, setDepEndpoint] = useState("");
  const [depMethod, setDepMethod] = useState<"GET" | "POST">("POST");
  const [depRecordsPath, setDepRecordsPath] = useState("");
  const [depBody, setDepBody] = useState("");
  const [depIterateField, setDepIterateField] = useState("");
  const [depInjectAs, setDepInjectAs] = useState("");
  const [depInjectIn, setDepInjectIn] = useState<"body" | "query" | "path">("body");
  const [depMergeFields, setDepMergeFields] = useState("");
  const [depDelayMs, setDepDelayMs] = useState("0");
  // Dependency: parent test state
  const [depTesting, setDepTesting] = useState(false);
  const [depParentFields, setDepParentFields] = useState<string[]>([]);
  const [depParentResult, setDepParentResult] = useState<{
    success: boolean; message?: string; error?: string; record_count?: number;
  } | null>(null);

  // Sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ auth: true });
  const toggleSection = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // State
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean; message?: string; error?: string; sample?: Record<string, unknown>[];
  } | null>(null);

  const createApiSource = useSourceStore((s) => s.createApiSource);
  const testApiConnection = useSourceStore((s) => s.testApiConnection);

  // Apply preset — also auto-configures pagination/method for known platforms
  const applyPreset = (key: string) => {
    setTokenPreset(key);
    const p = AUTH_PRESETS[key];
    if (p) {
      setIdField(p.id_field);
      setSecretField(p.secret_field);
      setTokenContentType(p.token_content_type as "json" | "form" | "query");
      setTokenMethod(p.token_method as "POST" | "GET");
      setTokenResponsePath(p.token_response_path);
      setTokenExtraFields(p.extra_fields ? Object.entries(p.extra_fields).map(([k, v]) => `${k}=${v}`).join("\n") : "");
    }
    // Platform-specific: auto-set pagination & method for 小铁
    if (key === "xiaotie") {
      setMethod("POST");
      setPagMode("offset");
      setParamsIn("body");
      setOffsetParam("skip");     // 小铁用 skip 而非 offset
      setLimitParam("limit");
      setPageSize("100");
      setRecordsPath("$.data");
      // Auto-fill dependency for lattices endpoint
      setDepEnabled(true);
      setDepEndpoint("/v1/data/cabinet/all");
      setDepMethod("POST");
      setDepRecordsPath("$.data");
      setDepBody(JSON.stringify({ limit: 500 }, null, 2));
      setDepIterateField("machine_code");
      setDepInjectAs("machine_code");
      setDepInjectIn("body");
      setDepMergeFields("address_info, name");
      setDepDelayMs("0");
      setOpenSections((s) => ({ ...s, dependency: true }));
    }
  };

  // ── Test parent endpoint ──
  const handleTestParent = async () => {
    if (!baseUrl || !depEndpoint) return;
    setDepTesting(true); setDepParentResult(null); setDepParentFields([]);
    try {
      // Build auth config inline (reuse the same auth the main endpoint uses)
      const auth: Record<string, unknown> = { auth_type: authType };
      if (authType === "token_exchange") {
        auth.token_url = tokenUrl.trim(); auth.token_method = tokenMethod; auth.token_content_type = tokenContentType;
        auth.id_field = idField; auth.secret_field = secretField;
        auth.id_value = idValue.trim(); auth.secret_value = secretValue.trim();
        auth.token_response_path = tokenResponsePath;
        const ef: Record<string, string> = {};
        tokenExtraFields.split("\n").forEach((l) => { const [k, v] = l.split("=").map((s) => s.trim()); if (k && v) ef[k] = v; });
        if (Object.keys(ef).length) auth.token_extra_fields = ef;
      } else if (authType === "bearer") { auth.bearer_token = bearerToken; }
      else if (authType === "api_key") { auth.api_key_header = apiKeyHeader; auth.api_key_value = apiKeyValue; auth.api_key_position = apiKeyPosition; }
      else if (authType === "basic") { auth.basic_username = basicUsername; auth.basic_password = basicPassword; }

      let depBodyParsed: Record<string, unknown> | undefined;
      if (depBody.trim()) { try { depBodyParsed = JSON.parse(depBody); } catch { /* ignore */ } }

      const res = await fetch("/api/sources/api/test-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl, dep_endpoint: depEndpoint, dep_method: depMethod,
          dep_records_path: depRecordsPath, dep_body: depBodyParsed,
          auth: authType !== "none" ? auth : undefined,
        }),
      });
      const data = await res.json();
      setDepParentResult(data);
      if (data.success && data.fields) {
        setDepParentFields(data.fields);
      }
    } catch (e: unknown) {
      setDepParentResult({ success: false, error: e instanceof Error ? e.message : "测试失败" });
    } finally { setDepTesting(false); }
  };

  // ── Build config ──
  function buildConfig() {
    // Auth
    const auth: Record<string, unknown> = { auth_type: authType };
    if (authType === "api_key") {
      auth.api_key_header = apiKeyHeader; auth.api_key_value = apiKeyValue; auth.api_key_position = apiKeyPosition;
    } else if (authType === "bearer") {
      auth.bearer_token = bearerToken;
    } else if (authType === "basic") {
      auth.basic_username = basicUsername; auth.basic_password = basicPassword;
    } else if (authType === "token_exchange") {
      auth.token_url = tokenUrl.trim(); auth.token_method = tokenMethod; auth.token_content_type = tokenContentType;
      auth.id_field = idField; auth.secret_field = secretField;
      auth.id_value = idValue.trim(); auth.secret_value = secretValue.trim();
      auth.token_response_path = tokenResponsePath;
      const ef: Record<string, string> = {};
      tokenExtraFields.split("\n").forEach((l) => { const [k, v] = l.split("=").map((s) => s.trim()); if (k && v) ef[k] = v; });
      if (Object.keys(ef).length) auth.token_extra_fields = ef;
    } else if (authType === "aliyun_sign") {
      auth.aliyun_access_key_id = aliyunKeyId; auth.aliyun_access_key_secret = aliyunKeySecret;
      auth.aliyun_api_version = aliyunApiVersion;
    }

    // Pagination
    const pagination: Record<string, unknown> = {
      mode: pagMode, params_in: paramsIn,
      page_size: parseInt(pageSize) || 100, max_pages: parseInt(maxPages) || 50,
    };
    if (pagMode === "offset") { pagination.offset_param = offsetParam; pagination.limit_param = limitParam; }
    else if (pagMode === "cursor") { pagination.cursor_param = cursorParam; pagination.cursor_path = cursorPath; pagination.limit_param = limitParam; }
    else if (pagMode === "page_number") { pagination.page_param = pageParam; pagination.limit_param = limitParam; }

    // Response parse
    const response_parse: Record<string, unknown> = { flatten_nested: flattenNested };
    if (recordsPath) response_parse.records_path = recordsPath;
    if (fieldMapping) {
      const m: Record<string, string> = {};
      fieldMapping.split("\n").forEach((l) => { const [k, v] = l.split("=").map((s) => s.trim()); if (k && v) m[k] = v; });
      if (Object.keys(m).length) response_parse.field_mapping = m;
    }
    if (excludeFields) response_parse.exclude_fields = excludeFields.split(",").map((s) => s.trim()).filter(Boolean);

    // Sync
    const sync: Record<string, unknown> = { strategy: syncStrategy };
    if (syncStrategy === "incremental") { sync.incremental_field = incrementalField; sync.incremental_param = incrementalParam; }

    // Params / headers / body
    const params: Record<string, string> = {};
    extraParams.split("\n").forEach((l) => { const [k, v] = l.split("=").map((s) => s.trim()); if (k && v) params[k] = v; });
    const headers: Record<string, string> = {};
    extraHeaders.split("\n").forEach((l) => { const [k, v] = l.split("=").map((s) => s.trim()); if (k && v) headers[k] = v; });
    let body: Record<string, unknown> | undefined;
    if (requestBody.trim()) { try { body = JSON.parse(requestBody); } catch { /* ignore */ } }

    // Dependency
    let dependency: Record<string, unknown> | undefined;
    if (depEnabled && depEndpoint && depIterateField) {
      dependency = {
        endpoint: depEndpoint,
        method: depMethod,
        records_path: depRecordsPath || undefined,
        iterate_field: depIterateField,
        inject_as: depInjectAs || depIterateField,
        inject_in: depInjectIn,
        delay_ms: parseInt(depDelayMs) || 0,
      };
      if (depBody.trim()) { try { dependency.body = JSON.parse(depBody); } catch { /* ignore */ } }
      const mf = depMergeFields.split(",").map((s) => s.trim()).filter(Boolean);
      if (mf.length) dependency.merge_fields = mf;
    }

    return {
      name, base_url: baseUrl, endpoint, method, auth, pagination, response_parse, sync,
      dependency,
      params: Object.keys(params).length ? params : undefined,
      headers: Object.keys(headers).length ? headers : undefined,
      body,
    };
  }

  const handleTest = async () => {
    if (!baseUrl) { setError("请填写基础 URL"); return; }
    setTesting(true); setError(""); setTestResult(null);
    try { setTestResult(await testApiConnection(buildConfig())); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "测试失败"); }
    finally { setTesting(false); }
  };

  const handleSubmit = async () => {
    if (!name || !baseUrl) { setError("请填写名称和基础 URL"); return; }
    setLoading(true); setError("");
    try { await createApiSource(buildConfig()); onSuccess(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "创建失败"); }
    finally { setLoading(false); }
  };

  // ── Auth label for section subtitle ──
  const authLabel: Record<string, string> = {
    none: "无", api_key: "API Key", bearer: "Bearer", basic: "Basic",
    token_exchange: "Token 换取", aliyun_sign: "阿里云签名", custom_header: "自定义 Header",
  };

  return (
    <div className="space-y-3">
      {/* Basic info */}
      <div>
        <Label>数据源名称 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="为数据源起个名称" />
      </div>
      <div>
        <Label>基础 URL *</Label>
        <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Label>端点路径</Label>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/api/v1/resource" />
        </div>
        <div>
          <Label>方法</Label>
          <PillSelect options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} value={method} onChange={setMethod} />
        </div>
      </div>

      {/* ── 认证配置 ── */}
      <Section title="认证配置" subtitle={authLabel[authType]} open={!!openSections.auth} onToggle={() => toggleSection("auth")}>
        <PillSelect<AuthType>
          options={[
            { value: "none", label: "无" }, { value: "api_key", label: "API Key" },
            { value: "bearer", label: "Bearer" }, { value: "basic", label: "Basic" },
            { value: "token_exchange", label: "Token 换取" },
            { value: "aliyun_sign", label: "阿里云签名" },
            { value: "custom_header", label: "自定义" },
          ]}
          value={authType} onChange={setAuthType}
        />

        {/* Layer 1: Static */}
        {authType === "api_key" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Header / 参数名</Label><Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} /></div>
              <div><Label>位置</Label><PillSelect options={[{ value: "header", label: "Header" }, { value: "query", label: "Query" }]} value={apiKeyPosition} onChange={setApiKeyPosition} /></div>
            </div>
            <div><Label>API Key</Label><SecretInput value={apiKeyValue} onChange={setApiKeyValue} placeholder="sk-..." /></div>
          </div>
        )}
        {authType === "bearer" && <div><Label>Bearer Token</Label><SecretInput value={bearerToken} onChange={setBearerToken} placeholder="eyJ..." /></div>}
        {authType === "basic" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>用户名</Label><Input value={basicUsername} onChange={(e) => setBasicUsername(e.target.value)} /></div>
            <div><Label>密码</Label><SecretInput value={basicPassword} onChange={setBasicPassword} /></div>
          </div>
        )}

        {/* Layer 2: Token exchange */}
        {authType === "token_exchange" && (
          <div className="space-y-2.5">
            <div>
              <Label>快捷预设</Label>
              <PillSelect
                options={Object.entries(AUTH_PRESETS).map(([k, v]) => ({ value: k, label: v.label }))}
                value={tokenPreset} onChange={applyPreset}
              />
            </div>
            <div><Label>Token URL *</Label><Input value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://api.example.com/oauth/token" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>请求方法</Label><PillSelect options={[{ value: "POST", label: "POST" }, { value: "GET", label: "GET" }]} value={tokenMethod} onChange={setTokenMethod} /></div>
              <div><Label>内容格式</Label><PillSelect options={[{ value: "json", label: "JSON" }, { value: "form", label: "表单" }, { value: "query", label: "Query" }]} value={tokenContentType} onChange={setTokenContentType} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ID 字段名</Label><Input value={idField} onChange={(e) => setIdField(e.target.value)} /></div>
              <div><Label>Secret 字段名</Label><Input value={secretField} onChange={(e) => setSecretField(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ID 值 *</Label><Input value={idValue} onChange={(e) => setIdValue(e.target.value)} placeholder="your-client-id" /></div>
              <div><Label>Secret 值 *</Label><SecretInput value={secretValue} onChange={setSecretValue} placeholder="your-secret" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Token 响应路径</Label><Input value={tokenResponsePath} onChange={(e) => setTokenResponsePath(e.target.value)} /></div>
              <div>
                <Label>额外字段（每行 key=value）</Label>
                <textarea className="w-full h-10 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-1.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
                  value={tokenExtraFields} onChange={(e) => setTokenExtraFields(e.target.value)} placeholder="grant_type=client_credentials" />
              </div>
            </div>
            <Hint>Token 换取适用于：小铁、飞书、企业微信、钉钉、标准 OAuth2 等所有「凭证换 Token」模式</Hint>
          </div>
        )}

        {/* Layer 3: Alibaba Cloud */}
        {authType === "aliyun_sign" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>AccessKey ID</Label><Input value={aliyunKeyId} onChange={(e) => setAliyunKeyId(e.target.value)} placeholder="LTAI5t..." /></div>
              <div><Label>AccessKey Secret</Label><SecretInput value={aliyunKeySecret} onChange={setAliyunKeySecret} /></div>
            </div>
            <div><Label>API Version</Label><Input value={aliyunApiVersion} onChange={(e) => setAliyunApiVersion(e.target.value)} placeholder="2014-05-26" /></div>
            <Hint>每次请求自动计算 ACS3-HMAC-SHA256 签名，需在「请求构造」中设置 x-acs-action</Hint>
          </div>
        )}
      </Section>

      {/* ── 请求构造 ── */}
      <Section title="请求构造" subtitle="参数 / Headers / Body" open={!!openSections.request} onToggle={() => toggleSection("request")}>
        <div><Label>Query 参数（每行 key=value）</Label>
          <textarea className="w-full h-16 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            value={extraParams} onChange={(e) => setExtraParams(e.target.value)} placeholder={"format=json\nfields=id,name"} />
        </div>
        <div><Label>额外 Headers（每行 key=value）</Label>
          <textarea className="w-full h-16 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            value={extraHeaders} onChange={(e) => setExtraHeaders(e.target.value)} placeholder={"x-acs-action=DescribeInstances\nAccept=application/json"} />
        </div>
        {method === "POST" && (
          <div><Label>Request Body（JSON）</Label>
            <textarea className="w-full h-20 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-2 text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
              value={requestBody} onChange={(e) => setRequestBody(e.target.value)} placeholder={'{\n  "query": "...",\n  "limit": 100\n}'} />
          </div>
        )}
      </Section>

      {/* ── 响应解析 ── */}
      <Section title="响应解析" subtitle={recordsPath || "自动检测"} open={!!openSections.response} onToggle={() => toggleSection("response")}>
        <div>
          <Label>数据路径（JSONPath）</Label>
          <Input value={recordsPath} onChange={(e) => setRecordsPath(e.target.value)} placeholder="留空自动检测，或输入如 $.data、$.items" />
          <Hint>指定 JSON 响应中数据数组的路径，如 $.data、$.items</Hint>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setFlattenNested(!flattenNested)}
            className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ${flattenNested ? "bg-accent" : "bg-foreground-15"}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${flattenNested ? "left-[calc(100%-16px)]" : "left-[2px]"}`} />
          </button>
          <span className="text-xs text-foreground-50">展平嵌套对象（address → address.city）</span>
        </div>
        <div><Label>字段重命名（每行 原名=新名）</Label>
          <textarea className="w-full h-14 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            value={fieldMapping} onChange={(e) => setFieldMapping(e.target.value)} placeholder={"user_id=id\nfull_name=name"} />
        </div>
        <div><Label>排除字段（逗号分隔）</Label>
          <Input value={excludeFields} onChange={(e) => setExcludeFields(e.target.value)} placeholder="password, __v, _internal" />
        </div>
      </Section>

      {/* ── 分页拉取 ── */}
      <Section title="分页拉取" subtitle={pagMode === "disabled" ? "单次请求" : `${pagMode} (${paramsIn})`} open={!!openSections.pagination} onToggle={() => toggleSection("pagination")}>
        <PillSelect<PaginationMode>
          options={[
            { value: "disabled", label: "不分页" }, { value: "offset", label: "Offset" },
            { value: "cursor", label: "Cursor" }, { value: "page_number", label: "页码" },
            { value: "link_header", label: "Link Header" },
          ]}
          value={pagMode} onChange={setPagMode}
        />
        {pagMode !== "disabled" && (
          <>
            <div>
              <Label>参数位置</Label>
              <PillSelect options={[{ value: "query", label: "Query 参数" }, { value: "body", label: "JSON Body" }]} value={paramsIn} onChange={setParamsIn} />
              <Hint>部分企业 API（如小铁）要求分页参数放在 POST Body 中</Hint>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>每页条数</Label><Input value={pageSize} onChange={(e) => setPageSize(e.target.value)} /></div>
              <div><Label>最大页数</Label><Input value={maxPages} onChange={(e) => setMaxPages(e.target.value)} /></div>
            </div>
          </>
        )}
        {pagMode === "offset" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Offset 参数名</Label><Input value={offsetParam} onChange={(e) => setOffsetParam(e.target.value)} /></div>
            <div><Label>Limit 参数名</Label><Input value={limitParam} onChange={(e) => setLimitParam(e.target.value)} /></div>
          </div>
        )}
        {pagMode === "cursor" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Cursor 参数名</Label><Input value={cursorParam} onChange={(e) => setCursorParam(e.target.value)} /></div>
              <div><Label>Limit 参数名</Label><Input value={limitParam} onChange={(e) => setLimitParam(e.target.value)} /></div>
            </div>
            <div><Label>Cursor 路径（JSONPath）</Label><Input value={cursorPath} onChange={(e) => setCursorPath(e.target.value)} placeholder="$.meta.next_cursor" /></div>
          </div>
        )}
        {pagMode === "page_number" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Page 参数名</Label><Input value={pageParam} onChange={(e) => setPageParam(e.target.value)} /></div>
            <div><Label>Limit 参数名</Label><Input value={limitParam} onChange={(e) => setLimitParam(e.target.value)} /></div>
          </div>
        )}
      </Section>

      {/* ── 依赖接口（父子关系） ── */}
      <Section title="依赖接口（父子关系）" subtitle={depEnabled ? `${depEndpoint} → ${depIterateField}` : "未启用"} open={!!openSections.dependency} onToggle={() => toggleSection("dependency")}>
        <button
          onClick={() => setDepEnabled(!depEnabled)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
            depEnabled ? "bg-accent/8 border border-accent/20" : "bg-foreground-2 border border-transparent hover:bg-foreground-3"
          }`}
        >
          <div className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ${depEnabled ? "bg-accent" : "bg-foreground-15"}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${depEnabled ? "left-[calc(100%-16px)]" : "left-[2px]"}`} />
          </div>
          <div>
            <span className={`text-xs font-medium ${depEnabled ? "text-accent" : "text-foreground-60"}`}>启用父子接口依赖</span>
            <p className="text-[10px] text-foreground-30 mt-0.5">先请求父接口获取列表，再遍历每条记录调用子接口</p>
          </div>
        </button>

        {depEnabled && (
          <div className="space-y-2.5 border-l-2 border-accent/20 pl-3 ml-1">
            {/* Step 1: Parent endpoint config */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>父接口路径 *</Label>
                <Input value={depEndpoint} onChange={(e) => { setDepEndpoint(e.target.value); setDepParentFields([]); setDepParentResult(null); }} placeholder="/api/v1/parent-resource" />
              </div>
              <div>
                <Label>方法</Label>
                <PillSelect options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} value={depMethod} onChange={setDepMethod} />
              </div>
            </div>
            <div>
              <Label>父接口数据路径（JSONPath）</Label>
              <Input value={depRecordsPath} onChange={(e) => setDepRecordsPath(e.target.value)} placeholder="留空自动检测，或输入 JSONPath" />
            </div>
            {depMethod === "POST" && (
              <div>
                <Label>父接口请求体（JSON）</Label>
                <textarea className="w-full h-16 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2.5 py-2 text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
                  value={depBody} onChange={(e) => setDepBody(e.target.value)} placeholder={'{\n  "key": "value"\n}'} />
              </div>
            )}

            {/* Test parent button */}
            <Button variant="outline" size="sm" disabled={!baseUrl || !depEndpoint || depTesting} onClick={handleTestParent} className="gap-1.5">
              {depTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}测试父接口
            </Button>

            {/* Parent test result */}
            {depParentResult && (
              <div className={`rounded-lg border p-2.5 text-xs ${
                depParentResult.success ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
              }`}>
                <div className="flex items-center gap-1.5">
                  {depParentResult.success ? <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />}
                  <span className={depParentResult.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>{depParentResult.message || depParentResult.error}</span>
                </div>
              </div>
            )}

            {/* Step 2: Field selection — only shown after successful parent test or manual input */}
            {(depParentFields.length > 0 || depIterateField) && (
              <div className="space-y-2.5 border-t border-foreground-5 pt-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>遍历字段 *</Label>
                    {depParentFields.length > 0 ? (
                      <select value={depIterateField} onChange={(e) => { setDepIterateField(e.target.value); if (!depInjectAs) setDepInjectAs(e.target.value); }}
                        className="w-full h-9 text-xs bg-foreground-2 border border-foreground-10 rounded-inner px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50">
                        <option value="">选择字段...</option>
                        {depParentFields.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    ) : (
                      <Input value={depIterateField} onChange={(e) => setDepIterateField(e.target.value)} placeholder="id" />
                    )}
                    <Hint>从父记录提取的字段名</Hint>
                  </div>
                  <div>
                    <Label>注入参数名</Label>
                    <Input value={depInjectAs} onChange={(e) => setDepInjectAs(e.target.value)} placeholder={depIterateField || "同遍历字段"} />
                    <Hint>留空则与遍历字段同名</Hint>
                  </div>
                  <div>
                    <Label>注入位置</Label>
                    <PillSelect options={[{ value: "body", label: "Body" }, { value: "query", label: "Query" }, { value: "path", label: "Path" }]} value={depInjectIn} onChange={setDepInjectIn} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>合并父字段</Label>
                    {depParentFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-1.5 bg-foreground-2 border border-foreground-10 rounded-inner">
                        {depParentFields.map((f) => {
                          const selected = depMergeFields.split(",").map((s) => s.trim()).filter(Boolean);
                          const isSelected = selected.includes(f);
                          return (
                            <button key={f} onClick={() => {
                              const cur = depMergeFields.split(",").map((s) => s.trim()).filter(Boolean);
                              setDepMergeFields(isSelected ? cur.filter((x) => x !== f).join(", ") : [...cur, f].join(", "));
                            }}
                              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                                isSelected ? "border-accent bg-accent/10 text-accent" : "border-foreground-10 text-foreground-40 hover:bg-foreground-3"
                              }`}>{f}</button>
                          );
                        })}
                      </div>
                    ) : (
                      <Input value={depMergeFields} onChange={(e) => setDepMergeFields(e.target.value)} placeholder="field1, field2" />
                    )}
                    <Hint>父记录字段会以 _parent_ 前缀合并到子记录</Hint>
                  </div>
                  <div>
                    <Label>请求间延迟 (ms)</Label>
                    <Input value={depDelayMs} onChange={(e) => setDepDelayMs(e.target.value)} placeholder="0" />
                    <Hint>防止触发 API 限流</Hint>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── 数据同步策略 ── */}
      <Section title="数据同步策略" subtitle={syncStrategy === "full_refresh" ? "全量刷新" : "增量同步"} open={!!openSections.sync} onToggle={() => toggleSection("sync")}>
        <PillSelect<SyncStrategy> options={[{ value: "full_refresh", label: "全量刷新" }, { value: "incremental", label: "增量同步" }]} value={syncStrategy} onChange={setSyncStrategy} />
        {syncStrategy === "incremental" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>增量字段</Label><Input value={incrementalField} onChange={(e) => setIncrementalField(e.target.value)} placeholder="updated_at" /></div>
            <div><Label>增量参数</Label><Input value={incrementalParam} onChange={(e) => setIncrementalParam(e.target.value)} placeholder="since" /></div>
          </div>
        )}
        <Hint>增量同步：每次拉取时自动传入上次同步的最大值作为过滤条件</Hint>
      </Section>

      {/* ── Test result ── */}
      {testResult && (
        <div className={`rounded-xl border p-3 space-y-2 ${
          testResult.success ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
        }`}>
          <div className="flex items-center gap-2 text-xs">
            {testResult.success ? <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
            <span className={testResult.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>{testResult.message || testResult.error}</span>
          </div>
          {testResult.success && testResult.sample && testResult.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-[10px] w-full border-collapse">
                <thead><tr>
                  {Object.keys(testResult.sample[0]).slice(0, 6).map((k) => (
                    <th key={k} className="text-left px-1.5 py-1 border-b border-foreground-10 text-foreground-50 font-medium">{k}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {testResult.sample.slice(0, 3).map((row, i) => (
                    <tr key={i}>{Object.keys(testResult.sample![0]).slice(0, 6).map((k) => (
                      <td key={k} className="px-1.5 py-1 border-b border-foreground-5 text-foreground-60 truncate max-w-[120px]">{String(row[k] ?? "")}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && <div className="flex items-center gap-2 text-xs text-destructive-text"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" disabled={!baseUrl || testing} onClick={handleTest} className="gap-1.5">
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}测试连接
        </Button>
        <Button className="flex-1" disabled={!name || !baseUrl || loading} onClick={handleSubmit}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />创建中...</> : "创建数据源"}
        </Button>
      </div>
    </div>
  );
}
