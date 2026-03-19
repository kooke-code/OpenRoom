import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  type CharacterAppAction,
} from '@/lib';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 24;
const APP_NAME = 'EscalationCenter';
const PROXY_BASE = '/api/local-proxy';
const API_BASE = 'http://localhost:5561';

// ============ Type Definitions ============
type TabType = 'pending' | 'resolved' | 'all';
type EscalationStatus = 'pending' | 'resolved';

interface Escalation {
  id: string | number;
  source_agent?: string;
  source?: string;
  message: string;
  context?: string;
  status: EscalationStatus;
  created_at: string;
  resolved_at?: string;
  response?: string;
  resolved_by?: string;
  priority?: string;
  tags?: string[];
}

interface EscalationStats {
  total: number;
  pending: number;
  resolved: number;
  avg_resolution_time?: string;
  avg_resolution_minutes?: number;
}

// ============ Proxy fetch helper ============
async function proxyFetch(targetUrl: string, options?: RequestInit): Promise<Response> {
  return fetch(PROXY_BASE, {
    ...options,
    headers: {
      ...options?.headers,
      'X-Target-URL': targetUrl,
      'Content-Type': 'application/json',
    },
  });
}

// ============ Utility Functions ============
const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatResolutionTime = (minutes?: number): string => {
  if (!minutes && minutes !== 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};

// ============ SVG Icons ============
const Icons = {
  pending: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  resolved: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  ),
  empty: (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  ),
};

// ============ Sub-component: Stats Bar ============
interface StatsBarProps {
  stats: EscalationStats | null;
  isLoading: boolean;
}

const StatsBar: React.FC<StatsBarProps> = ({ stats, isLoading }) => {
  return (
    <div className={styles.statsBar}>
      <div className={styles.statCard}>
        <div className={styles.statValue}>{isLoading ? '--' : (stats?.total ?? 0)}</div>
        <div className={styles.statLabel}>Total</div>
      </div>
      <div className={`${styles.statCard} ${styles.statPending}`}>
        <div className={styles.statValue}>
          {isLoading ? '--' : (stats?.pending ?? 0)}
          {!isLoading && (stats?.pending ?? 0) > 0 && <span className={styles.pendingDot} />}
        </div>
        <div className={styles.statLabel}>Pending</div>
      </div>
      <div className={`${styles.statCard} ${styles.statResolved}`}>
        <div className={styles.statValue}>{isLoading ? '--' : (stats?.resolved ?? 0)}</div>
        <div className={styles.statLabel}>Resolved</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statValue}>
          {isLoading
            ? '--'
            : stats?.avg_resolution_time || formatResolutionTime(stats?.avg_resolution_minutes)}
        </div>
        <div className={styles.statLabel}>Avg Resolution</div>
      </div>
    </div>
  );
};

// ============ Sub-component: Escalation Card ============
interface EscalationCardProps {
  escalation: Escalation;
  isExpanded: boolean;
  onToggle: (id: string | number) => void;
  onResolve: (id: string | number, response: string) => void;
}

const EscalationCard: React.FC<EscalationCardProps> = ({
  escalation,
  isExpanded,
  onToggle,
  onResolve,
}) => {
  const [resolveText, setResolveText] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [showResolveInput, setShowResolveInput] = useState(false);

  const handleResolve = async () => {
    if (!resolveText.trim()) return;
    setIsResolving(true);
    await onResolve(escalation.id, resolveText.trim());
    setIsResolving(false);
    setResolveText('');
    setShowResolveInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleResolve();
    }
  };

  const isPending = escalation.status === 'pending';

  return (
    <div
      className={`${styles.escalationCard} ${isPending ? styles.cardPending : styles.cardResolved}`}
    >
      <div className={styles.cardHeader} onClick={() => onToggle(escalation.id)}>
        <div className={styles.cardHeaderLeft}>
          <span
            className={`${styles.statusBadge} ${isPending ? styles.badgePending : styles.badgeResolved}`}
          >
            {isPending ? 'PENDING' : 'RESOLVED'}
          </span>
          <span className={styles.cardId}>#{String(escalation.id).slice(-6)}</span>
          {escalation.source_agent && (
            <span className={styles.cardSource}>{escalation.source_agent}</span>
          )}
          {escalation.source && !escalation.source_agent && (
            <span className={styles.cardSource}>{escalation.source}</span>
          )}
        </div>
        <div className={styles.cardHeaderRight}>
          <span className={styles.cardTime}>{formatRelativeTime(escalation.created_at)}</span>
          <span className={styles.expandIcon}>{isExpanded ? Icons.collapse : Icons.expand}</span>
        </div>
      </div>

      <div className={styles.cardMessage}>{escalation.message}</div>

      {isExpanded && (
        <div className={styles.cardExpanded}>
          {escalation.context && (
            <div className={styles.cardContext}>
              <div className={styles.contextLabel}>Context</div>
              <div className={styles.contextBody}>{escalation.context}</div>
            </div>
          )}

          {escalation.resolved_at && (
            <div className={styles.cardResolution}>
              <div className={styles.resolutionLabel}>
                Resolved {formatRelativeTime(escalation.resolved_at)}
                {escalation.resolved_by && ` by ${escalation.resolved_by}`}
              </div>
              {escalation.response && (
                <div className={styles.resolutionBody}>{escalation.response}</div>
              )}
            </div>
          )}

          {isPending && !showResolveInput && (
            <button
              className={styles.resolveBtn}
              onClick={(e) => {
                e.stopPropagation();
                setShowResolveInput(true);
              }}
            >
              Resolve
            </button>
          )}

          {isPending && showResolveInput && (
            <div className={styles.resolveArea}>
              <textarea
                className={styles.resolveInput}
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your resolution response..."
                rows={3}
                autoFocus
              />
              <div className={styles.resolveActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowResolveInput(false);
                    setResolveText('');
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleResolve}
                  disabled={!resolveText.trim() || isResolving}
                >
                  {isResolving ? 'Resolving...' : 'Submit'}
                  {!isResolving && Icons.send}
                </button>
              </div>
              <div className={styles.resolveHint}>Cmd+Enter to submit</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ Main Component ============
const EscalationCenterPage: React.FC = () => {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [stats, setStats] = useState<EscalationStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============ Data Fetching ============
  const fetchEscalations = useCallback(async () => {
    try {
      const res = await proxyFetch(`${API_BASE}/api/escalations?limit=100`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.escalations || data.items || [];
        setEscalations(items);
      } else {
        console.warn('[EscalationCenter] API returned', res.status);
        setError('Escalation API returned an error');
      }
    } catch (err) {
      console.error('[EscalationCenter] Fetch escalations error:', err);
      setError('Failed to connect to escalation service');
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await proxyFetch(`${API_BASE}/api/escalations/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('[EscalationCenter] Fetch stats error:', err);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await Promise.all([fetchEscalations(), fetchStats()]);
    setIsLoading(false);
  }, [fetchEscalations, fetchStats]);

  const resolveEscalation = useCallback(
    async (id: string | number, response: string) => {
      try {
        const res = await proxyFetch(`${API_BASE}/api/escalations/${id}/resolve`, {
          method: 'PUT',
          body: JSON.stringify({ response }),
        });

        if (res.ok) {
          // Update local state
          setEscalations((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    status: 'resolved' as EscalationStatus,
                    resolved_at: new Date().toISOString(),
                    response,
                    resolved_by: 'Opus (UI)',
                  }
                : e,
            ),
          );
          // Refresh stats
          await fetchStats();
          reportAction(APP_ID, 'RESOLVE_ESCALATION', { id, response });
        } else {
          console.error('[EscalationCenter] Resolve failed:', res.status);
        }
      } catch (err) {
        console.error('[EscalationCenter] Resolve error:', err);
      }
    },
    [fetchStats],
  );

  // ============ Event Handlers ============
  const handleToggleExpand = useCallback((id: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_PENDING': {
          const pending = escalations.filter((e) => e.status === 'pending');
          return JSON.stringify(pending);
        }
        case 'RESOLVE_ESCALATION': {
          const id = action.params?.id;
          const response = action.params?.response;
          if (!id || !response) return 'error: missing id or response';
          await resolveEscalation(id, response);
          return 'success';
        }
        case 'GET_STATS': {
          return JSON.stringify(stats);
        }
        case 'SEARCH_HISTORY': {
          const query = action.params?.query;
          if (!query) return 'error: missing query';
          const results = escalations.filter(
            (e) =>
              e.message.toLowerCase().includes(query.toLowerCase()) ||
              (e.response && e.response.toLowerCase().includes(query.toLowerCase())) ||
              (e.context && e.context.toLowerCase().includes(query.toLowerCase())),
          );
          return JSON.stringify(results);
        }
        case 'REFRESH': {
          await fetchAll();
          return 'success: data refreshed';
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            activeTab,
            totalEscalations: escalations.length,
            pendingCount: escalations.filter((e) => e.status === 'pending').length,
            resolvedCount: escalations.filter((e) => e.status === 'resolved').length,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [escalations, stats, activeTab, resolveEscalation, fetchAll],
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
          name: APP_NAME,
          windowStyle: { width: 700, height: 600 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: APP_NAME,
          windowStyle: { width: 700, height: 600 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);
        await fetchAll();
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[EscalationCenter] Init error:', err);
        setIsLoading(false);
        setError('Failed to initialize Escalation Center');
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ============ Computed Values ============
  const filteredEscalations = useMemo(() => {
    let items = escalations;

    // Filter by tab
    if (activeTab === 'pending') {
      items = items.filter((e) => e.status === 'pending');
    } else if (activeTab === 'resolved') {
      items = items.filter((e) => e.status === 'resolved');
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.context && e.context.toLowerCase().includes(q)) ||
          (e.response && e.response.toLowerCase().includes(q)) ||
          (e.source_agent && e.source_agent.toLowerCase().includes(q)) ||
          String(e.id).includes(q),
      );
    }

    // Sort: pending first, then by created_at desc
    return items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [escalations, activeTab, searchQuery]);

  const pendingCount = escalations.filter((e) => e.status === 'pending').length;
  const resolvedCount = escalations.filter((e) => e.status === 'resolved').length;

  // ============ Render ============
  return (
    <div className={styles.app}>
      {/* Stats Bar */}
      <StatsBar stats={stats} isLoading={isLoading} />

      {/* Tab Bar + Search */}
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'pending' ? styles.active : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending
            {pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'resolved' ? styles.active : ''}`}
            onClick={() => setActiveTab('resolved')}
          >
            Resolved
            <span className={styles.tabCount}>{resolvedCount}</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
            <span className={styles.tabCount}>{escalations.length}</span>
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.searchArea}>
            <span className={styles.searchIcon}>{Icons.search}</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search escalations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className={styles.refreshBtn} onClick={fetchAll} title="Refresh">
            {Icons.refresh}
          </button>
        </div>
      </div>

      {/* Main List */}
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.emptyState}>
            <div className={styles.spinner} />
            <p>Loading escalations...</p>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryBtn} onClick={fetchAll}>
              Retry
            </button>
          </div>
        ) : filteredEscalations.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>{Icons.empty}</div>
            <p>
              {activeTab === 'pending'
                ? 'No pending escalations'
                : activeTab === 'resolved'
                  ? 'No resolved escalations'
                  : searchQuery
                    ? `No results for "${searchQuery}"`
                    : 'No escalations found'}
            </p>
            {activeTab === 'pending' && !searchQuery && (
              <p className={styles.emptySubtext}>All escalations have been resolved</p>
            )}
          </div>
        ) : (
          filteredEscalations.map((escalation) => (
            <EscalationCard
              key={escalation.id}
              escalation={escalation}
              isExpanded={expandedIds.has(escalation.id)}
              onToggle={handleToggleExpand}
              onResolve={resolveEscalation}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default EscalationCenterPage;
