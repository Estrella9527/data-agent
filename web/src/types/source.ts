export type SourceType = "file" | "database" | "api";

export interface ColumnInfo {
  name: string;
  dtype: string;
  nullable: boolean;
  sample_values: unknown[];
  min_value: unknown;
  max_value: unknown;
  mean_value: number | null;
  earliest: string | null;
  latest: string | null;
  unique_count: number;
  missing_count: number;
  missing_rate: number;
}

export interface QualityIssue {
  column: string | null;
  issue_type: string;
  description: string;
  severity: "warning" | "info";
}

export interface DataProfile {
  row_count: number;
  column_count: number;
  columns: ColumnInfo[];
  quality_issues: QualityIssue[];
}

export interface DataSource {
  id: string;
  name: string;
  source_type: SourceType;
  status: "active" | "error" | "testing";

  // File source fields
  file_path?: string;
  file_name?: string;
  file_size_bytes?: number;

  // Database source fields
  connection_config?: {
    db_type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  available_tables?: string[];
  selected_table?: string;
  selected_tables?: string[];
  table_profiles?: Record<string, {
    schema_info: ColumnInfo[];
    profile: DataProfile | null;
    row_count: number | null;
    column_count: number | null;
  }>;

  // API source fields (v3)
  api_config?: ApiConnectorConfig;

  // Common
  schema_info: ColumnInfo[];
  profile: DataProfile | null;
  row_count: number | null;
  column_count: number | null;
  created_at: string;
}

// ── API Connector 3.0 types ──

export type AuthType =
  | "none" | "api_key" | "bearer" | "basic"
  | "token_exchange" | "aliyun_sign" | "custom_header";

export interface AuthConfigV3 {
  auth_type: AuthType;
  // Layer 1: Static credentials
  api_key_header?: string;
  api_key_value?: string;
  api_key_position?: "header" | "query";
  bearer_token?: string;
  basic_username?: string;
  basic_password?: string;
  custom_headers?: Record<string, string>;
  // Layer 2: Token exchange
  token_url?: string;
  token_method?: "POST" | "GET";
  token_content_type?: "json" | "form" | "query";
  id_field?: string;
  secret_field?: string;
  id_value?: string;
  secret_value?: string;
  token_extra_fields?: Record<string, string>;
  token_response_path?: string;
  token_expires_path?: string;
  token_prefix?: string;
  // Layer 3: Alibaba Cloud signature
  aliyun_access_key_id?: string;
  aliyun_access_key_secret?: string;
  aliyun_api_version?: string;
}

export type PaginationMode =
  | "disabled" | "offset" | "cursor" | "link_header" | "page_number";

export interface PaginationConfigV3 {
  mode: PaginationMode;
  params_in?: "query" | "body";
  offset_param?: string;
  limit_param?: string;
  page_size?: number;
  max_pages?: number;
  cursor_param?: string;
  cursor_path?: string;
  page_param?: string;
  total_count_path?: string;
}

export interface ResponseParseConfig {
  records_path?: string;
  field_mapping?: Record<string, string>;
  flatten_nested?: boolean;
  exclude_fields?: string[];
}

export type SyncStrategy = "full_refresh" | "incremental";

export interface SyncConfig {
  strategy: SyncStrategy;
  incremental_field?: string;
  incremental_param?: string;
  last_sync_value?: string;
  last_sync_at?: string;
  sync_interval_minutes?: number;
}

export interface EndpointDependency {
  endpoint: string;
  method?: "GET" | "POST";
  records_path?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  iterate_field: string;
  inject_as: string;
  inject_in: "body" | "query" | "path";
  merge_fields?: string[];
  delay_ms?: number;
}

export interface ApiConnectorConfig {
  base_url: string;
  endpoint?: string;
  method?: string;
  auth?: AuthConfigV3;
  pagination?: PaginationConfigV3;
  response_parse?: ResponseParseConfig;
  sync?: SyncConfig;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
  dependency?: EndpointDependency;
}
