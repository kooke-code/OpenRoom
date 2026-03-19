import React, { useEffect, useState, useCallback, useRef } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 26;
const PROXY_BASE = '/api/local-proxy';
const REFRESH_INTERVAL = 120_000;

const ENDPOINTS = {
  daemonStatus: 'http://localhost:9999/api/status',
  results: 'http://localhost:9999/api/results',
} as const;

// ============ Type Definitions ============
interface DaemonStatus {
  online: boolean;
  workers: number;
  max_workers: number;
  queries_today: number;
  uptime?: string;
  model?: string;
}

interface ResearchSource {
  title: string;
  url?: string;
  snippet?: string;
}

interface ResearchResult {
  id: string;
  topic: string;
  query: string;
  summary: string;
  analysis: string;
  sources: ResearchSource[];
  source_count: number;
  timestamp: string;
  status: string;
}

// ============ Fetch Helper ============
async function proxyFetch<T>(targetUrl: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(PROXY_BASE, {
    ...options,
    headers: {
      ...options?.headers,
      'X-Target-URL': targetUrl,
    },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.json();
}

// ============ Utility Functions ============
const formatTimestamp = (ts: string): string => {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

// ============ Sub-components ============

// --- Daemon Status Bar ---
interface DaemonStatusBarProps {
  status: DaemonStatus | null;
  loading: boolean;
  error: string | null;
}

const DaemonStatusBar: React.FC<DaemonStatusBarProps> = ({ status, loading, error }) => {
  if (loading) {
    return (
      <div className={styles.statusBar}>
        <div className={styles.statusDot} data-state="loading" />
        <span className={styles.statusText}>Connecting to Swarm Daemon...</span>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className={styles.statusBar}>
        <div className={styles.statusDot} data-state="offline" />
        <span className={styles.statusText}>Swarm Daemon offline</span>
        {error && <span className={styles.statusError}>{error}</span>}
      </div>
    );
  }

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusDot} data-state={status.online ? 'online' : 'offline'} />
      <span className={styles.statusText}>
        {status.online ? 'Swarm Daemon online' : 'Swarm Daemon offline'}
      </span>
      <div className={styles.statusStats}>
        <span className={styles.statusStat}>
          <span className={styles.statusStatLabel}>Workers</span>
          <span className={styles.statusStatValue}>
            {status.workers}/{status.max_workers}
          </span>
        </span>
        <span className={styles.statusStat}>
          <span className={styles.statusStatLabel}>Queries Today</span>
          <span className={styles.statusStatValue}>{status.queries_today}</span>
        </span>
        {status.model && (
          <span className={styles.statusStat}>
            <span className={styles.statusStatLabel}>Model</span>
            <span className={styles.statusStatValue}>{status.model}</span>
          </span>
        )}
      </div>
    </div>
  );
};

// --- Research Card ---
interface ResearchCardProps {
  result: ResearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}

const ResearchCard: React.FC<ResearchCardProps> = ({ result, isExpanded, onToggle }) => (
  <div className={`${styles.researchCard} ${isExpanded ? styles.expanded : ''}`}>
    <button className={styles.cardToggle} onClick={onToggle}>
      <div className={styles.cardMeta}>
        <span className={styles.cardTopic}>{result.topic || 'Research'}</span>
        <span className={styles.cardTimestamp}>{formatTimestamp(result.timestamp)}</span>
      </div>
      <div className={styles.cardSummary}>{result.summary || result.query}</div>
      <div className={styles.cardFooter}>
        <span className={styles.sourceCount}>
          {result.source_count ?? result.sources?.length ?? 0} sources
        </span>
        <span className={styles.expandIcon}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </div>
    </button>

    {isExpanded && (
      <div className={styles.cardExpanded}>
        {result.analysis && (
          <div className={styles.analysisSection}>
            <div className={styles.analysisSectionTitle}>Analysis</div>
            <div className={styles.analysisText}>{result.analysis}</div>
          </div>
        )}

        {result.sources && result.sources.length > 0 && (
          <div className={styles.sourcesSection}>
            <div className={styles.analysisSectionTitle}>Sources</div>
            <ul className={styles.sourcesList}>
              {result.sources.map((src, i) => (
                <li key={i} className={styles.sourceItem}>
                  <span className={styles.sourceTitle}>{src.title}</span>
                  {src.url && <span className={styles.sourceUrl}>{src.url}</span>}
                  {src.snippet && <span className={styles.sourceSnippet}>{src.snippet}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )}
  </div>
);

// --- Research Input ---
interface ResearchInputProps {
  onSubmit: (query: string, topic: string) => void;
  isSubmitting: boolean;
}

const ResearchInput: React.FC<ResearchInputProps> = ({ onSubmit, isSubmitting }) => {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSubmit(query.trim(), topic.trim());
    setQuery('');
    setTopic('');
  };

  return (
    <form className={styles.researchInput} onSubmit={handleSubmit}>
      <div className={styles.inputTitle}>Run Research</div>
      <div className={styles.inputFields}>
        <input
          type="text"
          className={styles.inputField}
          placeholder="Research query..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSubmitting}
        />
        <input
          type="text"
          className={`${styles.inputField} ${styles.topicField}`}
          placeholder="Topic / angle (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={isSubmitting}
        />
        <button type="submit" className={styles.submitBtn} disabled={isSubmitting || !query.trim()}>
          {isSubmitting ? 'Running...' : 'Submit'}
        </button>
      </div>
    </form>
  );
};

// --- Portfolio Placeholder ---
const PortfolioPlaceholder: React.FC = () => (
  <div className={styles.portfolioSection}>
    <div className={styles.portfolioTitle}>Portfolio</div>
    <div className={styles.portfolioCards}>
      {['BTC', 'KAS', 'ETH'].map((asset) => (
        <div key={asset} className={styles.portfolioCard}>
          <span className={styles.portfolioAsset}>{asset}</span>
          <span className={styles.portfolioPlaceholder}>Awaiting bridge data from clodette.db</span>
        </div>
      ))}
    </div>
  </div>
);

// ============ Main Component ============
const MarketResearchPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [daemonLoading, setDaemonLoading] = useState(true);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  // ============ Data Fetching ============
  const fetchDaemonStatus = useCallback(async () => {
    setDaemonLoading(true);
    setDaemonError(null);
    try {
      const status = await proxyFetch<DaemonStatus>(ENDPOINTS.daemonStatus);
      setDaemonStatus(status);
    } catch (err) {
      setDaemonError(err instanceof Error ? err.message : 'Failed to connect');
      setDaemonStatus(null);
    } finally {
      setDaemonLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    setResultsError(null);
    try {
      const data = await proxyFetch<ResearchResult[]>(ENDPOINTS.results);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setResultsError(err instanceof Error ? err.message : 'Failed to fetch results');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchDaemonStatus(), fetchResults()]);
  }, [fetchDaemonStatus, fetchResults]);

  // ============ Research Submission ============
  const handleResearchSubmit = useCallback(
    async (query: string, topic: string) => {
      setIsSubmitting(true);
      try {
        await proxyFetch<{ status: string }>(`http://localhost:9999/api/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, topic: topic || undefined }),
        });
        reportAction(APP_ID, 'RUN_RESEARCH', { query, topic });
        // Refresh results after short delay to pick up new result
        setTimeout(() => fetchResults(), 3000);
      } catch (err) {
        console.error('[MarketResearch] Submit error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchResults],
  );

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'RUN_RESEARCH': {
          const { query, topic } = (action.params ?? {}) as { query?: string; topic?: string };
          if (!query) return 'error: missing query param';
          await handleResearchSubmit(query, topic ?? '');
          return 'success';
        }
        case 'GET_RESULTS': {
          return JSON.stringify(results);
        }
        case 'GET_PORTFOLIO': {
          return JSON.stringify({ status: 'placeholder', message: 'Awaiting clodette.db bridge' });
        }
        case 'GET_DAEMON_STATUS': {
          return JSON.stringify(daemonStatus);
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            daemonOnline: daemonStatus?.online ?? false,
            resultCount: results.length,
            expandedId,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [results, daemonStatus, expandedId, handleResearchSubmit],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // ============ Initialization ============
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MarketResearch',
          windowStyle: { width: 800, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MarketResearch',
          windowStyle: { width: 800, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[MarketResearch] fetchVibeInfo failed:', error);
        }

        await refreshAll();

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[MarketResearch] Init error:', error);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Auto-refresh ============
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      refreshAll();
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [refreshAll]);

  // ============ Toggle Expansion ============
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ============ Render ============
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Connecting to Swarm Daemon...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <DaemonStatusBar status={daemonStatus} loading={daemonLoading} error={daemonError} />

      <div className={styles.mainContent}>
        <div className={styles.resultsArea}>
          <div className={styles.resultsHeader}>
            <span className={styles.resultsTitle}>Research Results</span>
            <span className={styles.resultsCount}>{results.length} results</span>
          </div>

          {resultsError ? (
            <div className={styles.errorState}>{resultsError}</div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <p>No research results yet. Use the input below to run a swarm research query.</p>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {results.map((result) => (
                <ResearchCard
                  key={result.id}
                  result={result}
                  isExpanded={expandedId === result.id}
                  onToggle={() => handleToggle(result.id)}
                />
              ))}
            </div>
          )}
        </div>

        <ResearchInput onSubmit={handleResearchSubmit} isSubmitting={isSubmitting} />

        <PortfolioPlaceholder />
      </div>
    </div>
  );
};

export default MarketResearchPage;
