export interface ReplayResult {
  replayedAt: string;
  targetUrl: string;
  statusCode: number;
  ok: boolean;
  durationMs: number;
}

export interface WebhookEvent {
  id: string;
  source: string;
  createdAt: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  replayHistory: ReplayResult[];
}

export interface ReplayRequest {
  targetUrl: string;
  includeOriginalHeaders?: boolean;
  additionalHeaders?: Record<string, string>;
}
