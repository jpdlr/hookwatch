import { useCallback, useEffect, useMemo, useState } from "react";

type ThemeName = "light" | "dark";

interface ReplayHistoryItem {
  replayedAt: string;
  targetUrl: string;
  statusCode: number;
  ok: boolean;
  durationMs: number;
}

interface WebhookEvent {
  id: string;
  source: string;
  createdAt: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  replayHistory: ReplayHistoryItem[];
}

interface EventListResponse {
  items: WebhookEvent[];
}

interface HealthResponse {
  status: "ok";
  events: number;
}

interface ReplayResponse {
  replay: ReplayHistoryItem & { body: string };
}

const getPreferredTheme = (): ThemeName => {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("hookwatch-theme");
  return stored === "dark" ? "dark" : "light";
};

const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => getPreferredTheme());
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayTarget, setReplayTarget] = useState("http://127.0.0.1:8899/ingest/replayed");
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("hookwatch-theme", theme);
  }, [theme]);

  const loadData = useCallback(async () => {
    try {
      const [healthResult, eventResult] = await Promise.all([
        fetchJson<HealthResponse>("/health"),
        fetchJson<EventListResponse>("/api/events"),
      ]);
      setHealth(healthResult);
      setEvents(eventResult.items);
      setSelectedId((current) => {
        if (current && eventResult.items.some((item) => item.id === current)) {
          return current;
        }
        return eventResult.items[0]?.id ?? null;
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const handle = window.setInterval(() => {
      void loadData();
    }, 4000);
    return () => window.clearInterval(handle);
  }, [loadData]);

  const sources = useMemo(() => {
    const unique = new Set(events.map((event) => event.source));
    return ["all", ...Array.from(unique)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const sourceMatches = sourceFilter === "all" || event.source === sourceFilter;
      const searchMatches =
        search.length === 0 ||
        event.path.toLowerCase().includes(search.toLowerCase()) ||
        event.body?.toLowerCase().includes(search.toLowerCase()) ||
        event.source.toLowerCase().includes(search.toLowerCase());
      return sourceMatches && searchMatches;
    });
  }, [events, search, sourceFilter]);

  const activeEvent = useMemo(() => {
    const selected = filteredEvents.find((event) => event.id === selectedId);
    return selected ?? filteredEvents[0] ?? null;
  }, [filteredEvents, selectedId]);

  useEffect(() => {
    if (activeEvent && activeEvent.id !== selectedId) {
      setSelectedId(activeEvent.id);
    }
    if (!activeEvent) {
      setSelectedId(null);
    }
  }, [activeEvent, selectedId]);

  const createSampleEvent = async () => {
    await fetchJson<{ id: string; received: boolean }>("/ingest/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "sample.created",
        project: "hookwatch",
      }),
    });
    await loadData();
  };

  const clearEvents = async () => {
    await fetchJson<{ cleared: boolean }>("/api/events", { method: "DELETE" });
    setReplayResult(null);
    await loadData();
  };

  const replayEvent = async () => {
    if (!activeEvent) return;
    setIsReplaying(true);
    setReplayResult(null);
    try {
      const response = await fetchJson<ReplayResponse>(
        `/api/events/${activeEvent.id}/replay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            targetUrl: replayTarget,
            includeOriginalHeaders: false,
          }),
        }
      );
      setReplayResult(`Replay status ${response.replay.statusCode} in ${response.replay.durationMs}ms`);
      await loadData();
    } catch (nextError) {
      setReplayResult(nextError instanceof Error ? nextError.message : "Replay failed");
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Webhook Debugger</p>
          <h1>Hookwatch</h1>
        </div>
        <div className="header-actions">
          <button
            className="ghost"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Theme: {theme === "light" ? "Light" : "Dark"}
          </button>
          <button className="primary" type="button" onClick={() => void createSampleEvent()}>
            Send sample
          </button>
          <button className="ghost" type="button" onClick={() => void clearEvents()}>
            Clear
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <p>Server</p>
          <h2>{health?.status ?? "offline"}</h2>
        </article>
        <article className="stat-card">
          <p>Total events</p>
          <h2>{health?.events ?? 0}</h2>
        </article>
        <article className="stat-card">
          <p>Sources</p>
          <h2>{sources.length - 1}</h2>
        </article>
      </section>

      <section className="workspace">
        <aside className="event-list card-surface">
          <div className="list-controls">
            <input
              type="search"
              aria-label="Search events"
              value={search}
              placeholder="Search source, path, or payload"
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Filter by source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          {loading ? <p className="empty">Loading events...</p> : null}
          {error ? <p className="empty">{error}</p> : null}

          <ul>
            {filteredEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className={`event-item ${event.id === activeEvent?.id ? "active" : ""}`}
                  onClick={() => setSelectedId(event.id)}
                >
                  <strong>{event.source}</strong>
                  <span>{event.method}</span>
                  <span>{event.path}</span>
                  <time>{formatDate(event.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="event-detail card-surface">
          {!activeEvent ? (
            <p className="empty">No events yet. Send a webhook to `/ingest/:source`.</p>
          ) : (
            <>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">Selected event</p>
                  <h2>{activeEvent.source}</h2>
                  <p className="muted">
                    {activeEvent.method} {activeEvent.path}
                  </p>
                </div>
              </header>

              <section className="panel-grid">
                <div>
                  <h3>Headers</h3>
                  <pre>{JSON.stringify(activeEvent.headers, null, 2)}</pre>
                </div>
                <div>
                  <h3>Body</h3>
                  <pre>{activeEvent.body ?? "(empty)"}</pre>
                </div>
              </section>

              <section className="replay-panel">
                <h3>Replay</h3>
                <div className="replay-actions">
                  <input
                    type="url"
                    aria-label="Replay target"
                    value={replayTarget}
                    onChange={(event) => setReplayTarget(event.target.value)}
                  />
                  <button
                    className="primary"
                    type="button"
                    disabled={isReplaying}
                    onClick={() => void replayEvent()}
                  >
                    {isReplaying ? "Replaying..." : "Replay event"}
                  </button>
                </div>
                {replayResult ? <p className="muted">{replayResult}</p> : null}
                {activeEvent.replayHistory.length > 0 ? (
                  <ul className="replay-history">
                    {activeEvent.replayHistory.map((item) => (
                      <li key={`${item.replayedAt}-${item.targetUrl}`}>
                        <span>{formatDate(item.replayedAt)}</span>
                        <span>{item.statusCode}</span>
                        <span>{item.targetUrl}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No replay history yet.</p>
                )}
              </section>
            </>
          )}
        </article>
      </section>
    </div>
  );
}
