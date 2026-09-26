import type {
  AuthResponse,
  ChatResponse,
  Conversation,
  ContractAnalysis,
  DocumentListResponse,
  DocumentUploadResponse,
  EvaluationResult,
  HealthStatus,
  LegalDocument,
  ResetPasswordResponse,
  SendOTPResponse,
  User,
  VerifyOTPResponse,
} from "../types";
import { authHeader, clearToken } from "./auth";

// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.ts).
// In production, set VITE_API_BASE_URL to the deployed backend origin.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  errorCode: string;
  status: number;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error_code?: string; message?: string; detail?: string } = {};
    try {
      body = await res.json();
    } catch {
      // response wasn't JSON
    }
    if (res.status === 401) {
      // Token missing/expired/invalid -- drop it so the next protected-route
      // check redirects to /login instead of silently failing forever.
      clearToken();
    }
    throw new ApiError(
      res.status,
      body.error_code ?? "unknown_error",
      body.message ?? body.detail ?? `Request failed with status ${res.status}`
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- Health ----------

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BASE_URL}/health`);
  return handleResponse<HealthStatus>(res);
}

// ---------- Auth ----------

export async function signup(params: {
  full_name: string;
  email: string;
  password: string;
  phone_number?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<AuthResponse>(res);
}

export async function login(params: { email: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<AuthResponse>(res);
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${BASE_URL}/auth/me`, { headers: { ...authHeader() } });
  return handleResponse<User>(res);
}

export async function sendForgotPasswordOTP(phone_number: string): Promise<SendOTPResponse> {
  const res = await fetch(`${BASE_URL}/auth/forgot-password/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number }),
  });
  return handleResponse<SendOTPResponse>(res);
}

export async function verifyForgotPasswordOTP(
  phone_number: string,
  otp: string
): Promise<VerifyOTPResponse> {
  const res = await fetch(`${BASE_URL}/auth/forgot-password/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number, otp }),
  });
  return handleResponse<VerifyOTPResponse>(res);
}

export async function resetPasswordWithOTP(
  reset_token: string,
  new_password: string
): Promise<ResetPasswordResponse> {
  const res = await fetch(`${BASE_URL}/auth/forgot-password/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset_token, new_password }),
  });
  return handleResponse<ResetPasswordResponse>(res);
}

// ---------- Documents ----------

export async function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void
): Promise<DocumentUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/upload`);
    const token = authHeader().Authorization;
    if (token) xhr.setRequestHeader("Authorization", token);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: { error_code?: string; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as DocumentUploadResponse);
      } else {
        reject(
          new ApiError(
            xhr.status,
            body.error_code ?? "unknown_error",
            body.message ?? "Upload failed"
          )
        );
      }
    };

    xhr.onerror = () => reject(new ApiError(0, "network_error", "Network error during upload"));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export async function listDocuments(): Promise<DocumentListResponse> {
  const res = await fetch(`${BASE_URL}/documents`, { headers: { ...authHeader() } });
  return handleResponse<DocumentListResponse>(res);
}

export async function getDocument(id: string): Promise<LegalDocument> {
  const res = await fetch(`${BASE_URL}/documents/${id}`, { headers: { ...authHeader() } });
  return handleResponse<LegalDocument>(res);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/documents/${id}`, {
    method: "DELETE",
    headers: { ...authHeader() },
  });
  return handleResponse<void>(res);
}

export interface DocumentStatus {
  id: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  chunk_count: number;
  error_message?: string | null;
}

export async function getDocumentStatus(id: string): Promise<DocumentStatus> {
  const res = await fetch(`${BASE_URL}/documents/${id}/status`, {
    headers: { ...authHeader() },
  });
  return handleResponse<DocumentStatus>(res);
}


// ---------- Chat ----------

export async function sendChatMessage(params: {
  message: string;
  conversation_id?: string;
  document_id?: string;
  document_ids?: string[];
}): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(params),
  });
  return handleResponse<ChatResponse>(res);
}

// ---------- Evaluation ----------

export async function getRiskClassifierEvaluation(): Promise<EvaluationResult> {
  const res = await fetch(`${BASE_URL}/evaluation/risk-classifier`, {
    headers: { ...authHeader() },
  });
  return handleResponse<EvaluationResult>(res);
}

export type StreamEvent =
  | { type: "sources"; sources: ChatResponse["message"]["sources"] }
  | { type: "token"; content: string }
  | { type: "confidence"; confidence: number; match_quality: string; top_similarity: number }
  | { type: "done"; conversation_id: string; message_id: string };

/** Consumes the newline-delimited-JSON streaming chat endpoint. */
export async function streamChatMessage(
  params: { message: string; conversation_id?: string; document_id?: string; document_ids?: string[] },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok || !res.body) {
    let body: { error_code?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body.error_code ?? "unknown_error",
      body.message ?? "Streaming request failed"
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as StreamEvent);
    }
  }
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as StreamEvent);
  }
}

export async function listConversations(): Promise<{ conversations: Conversation[] }> {
  const res = await fetch(`${BASE_URL}/conversations`, { headers: { ...authHeader() } });
  return handleResponse(res);
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${BASE_URL}/conversations/${id}`, { headers: { ...authHeader() } });
  return handleResponse<Conversation>(res);
}

// ---------- Analysis & Clause Drafter ----------

export async function analyzeDocument(documentId: string): Promise<ContractAnalysis> {
  const res = await fetch(`${BASE_URL}/analysis/${documentId}`, {
    method: "POST",
    headers: { ...authHeader() },
  });
  return handleResponse<ContractAnalysis>(res);
}

export async function getDocumentAnalysis(documentId: string): Promise<ContractAnalysis> {
  const res = await fetch(`${BASE_URL}/analysis/${documentId}`, {
    headers: { ...authHeader() },
  });
  return handleResponse<ContractAnalysis>(res);
}

export async function draftClause(params: import("../types").DraftClauseParams): Promise<import("../types").DraftedClause> {
  const res = await fetch(`${BASE_URL}/analysis/draft-clause`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(params),
  });
  return handleResponse<import("../types").DraftedClause>(res);
}
