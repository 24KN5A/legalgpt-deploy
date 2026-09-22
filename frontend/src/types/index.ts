export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface LegalDocument {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  status: DocumentStatus;
  error_message: string | null;
  preview_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  documents: LegalDocument[];
  total: number;
}

export interface DocumentUploadResponse {
  document: LegalDocument;
  message: string;
}

export interface SourceChunk {
  document_id: string;
  document_name: string;
  chunk_index: number;
  text: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: SourceChunk[];
  created_at: string;
  // Improvement #4 — confidence metadata
  confidence?: number | null;        // 0.0–1.0
  match_quality?: string | null;     // "High" | "Medium" | "Low" | "No match"
  top_similarity?: number | null;    // best individual chunk score
}

export interface Conversation {
  id: string;
  title: string;
  document_id: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  conversation_id: string;
  message: ChatMessage;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskItem {
  clause: string;
  risk_level: RiskLevel;
  explanation: string;
  recommendation: string;
}

export interface ContractAnalysis {
  document_id: string;
  summary: string;
  key_clauses: string[];
  parties: string[];
  obligations: string[];
  risks: RiskItem[];
  generated_at: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  llm_provider: string;
  embedding_provider: string;
  vector_store_ready: boolean;
}

export interface ApiErrorBody {
  error_code: string;
  message: string;
}

// ---------- Auth ----------

export interface User {
  id: string;
  email: string;
  phone_number?: string | null;
  full_name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SendOTPResponse {
  message: string;
  phone_number: string;
  expires_in_seconds: number;
  debug_otp?: string;
}

export interface VerifyOTPResponse {
  message: string;
  reset_token: string;
  expires_in_minutes: number;
}

export interface ResetPasswordResponse {
  message: string;
  user: User;
}

// ---------- Evaluation ----------

export interface ClassMetric {
  label: RiskLevel | string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface AverageMetrics {
  precision: number;
  recall: number;
  f1: number;
}

export interface EvaluationResult {
  model_name: string;
  dataset_name: string;
  num_samples: number;
  labels: string[];
  accuracy: number;
  per_class: ClassMetric[];
  macro_avg: AverageMetrics;
  weighted_avg: AverageMetrics;
  confusion_matrix: Record<string, number[]>;
}
