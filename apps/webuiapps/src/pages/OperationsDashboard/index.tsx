import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import { APP_ID, ActionTypes } from './actions/constants';
import styles from './index.module.scss';

// ============ Type Definitions ============

interface LaunchdJob {
  name: string;
  status: number;
  exitCode: number;
  lastRunSeconds: number;
}

interface CronJob {
  name: string;
  status: number;
  lastRun: number;
}

interface Escalation {
  id: number;
  source: string;
  message: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  response: string | null;
}

interface FailureItem {
  name: string;
  type: 'launchd' | 'cron';
  exitCode: number;
  lastRunSeconds: number;
  acknowledged: boolean;
}

interface TimelineEntry {
  name: string;
  type: 'launchd' | 'cron';
  timestamp: number;
  success: boolean;
}

interface DashboardData {
  failures: FailureItem[];
  timeline: TimelineEntry[];
  escalations: Escalation[];
  lastFetched: number;
}

// ============ Prometheus Parser ============

function parsePrometheusForOps(text: string): {
  failures: FailureItem[];
  timeline: TimelineEntry[];
} {
  const lines = text.split('\n');
  const launchdMap = new Map<string, Partial<LaunchdJob>>();
  const cronMap = new Map<string, Partial<CronJob>>();

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    const launchdStatusMatch = line.match(
      /^clodette_launchd_job_status\{job="([^"]+)"\}\s+([\d.]+)/,
    );
    if (launchdStatusMatch) {
      const name = launchdStatusMatch[1];
      if (!launchdMap.has(name)) launchdMap.set(name, { name });
      launchdMap.get(name)!.status = parseFloat(launchdStatusMatch[2]);
      continue;
    }

    const launchdExitMatch = line.match(
      /^clodette_launchd_job_exit_code\{job="([^"]+)"\}\s+([\d.]+)/,
    );
    if (launchdExitMatch) {
      const name = launchdExitMatch[1];
      if (!launchdMap.has(name)) launchdMap.set(name, { name });
      launchdMap.get(name)!.exitCode = parseFloat(launchdExitMatch[2]);
      continue;
    }

    const launchdRunMatch = line.match(
      /^clodette_launchd_job_last_run_seconds\{job="([^"]+)"\}\s+([\d.]+)/,
    );
    if (launchdRunMatch) {
      const name = launchdRunMatch[1];
      if (!launchdMap.has(name)) launchdMap.set(name, { name });
      launchdMap.get(name)!.lastRunSeconds = parseFloat(launchdRunMatch[2]);
      continue;
    }

    const cronStatusMatch = line.match(/^clodette_cron_job_status\{job="([^"]+)"\}\s+([\d.]+)/);
    if (cronStatusMatch) {
      const name = cronStatusMatch[1];
      if (!cronMap.has(name)) cronMap.set(name, { name });
      cronMap.get(name)!.status = parseFloat(cronStatusMatch[2]);
      continue;
    }

    const cronRunMatch = line.match(/^clodette_cron_job_last_run\{job="([^"]+)"\}\s+([\d.]+)/);
    if (cronRunMatch) {
      const name = cronRunMatch[1];
      if (!cronMap.has(name)) cronMap.set(name, { name });
      cronMap.get(name)!.lastRun = parseFloat(cronRunMatch[2]);
      continue;
    }
  }

  // Build failures: launchd with exitCode != 0, cron with status == 0
  const failures: FailureItem[] = [];
  const timeline: TimelineEntry[] = [];

  for (const job of launchdMap.values()) {
    const name = job.name || 'unknown';
    const exitCode = job.exitCode ?? 0;
    const lastRunSeconds = job.lastRunSeconds ?? 0;

    if (exitCode !== 0) {
      failures.push({
        name,
        type: 'launchd',
        exitCode,
        lastRunSeconds,
        acknowledged: false,
      });
    }

    if (lastRunSeconds > 0) {
      timeline.push({
        name,
        type: 'launchd',
        timestamp: lastRunSeconds,
        success: exitCode === 0,
      });
    }
  }

  for (const job of cronMap.values()) {
    const name = job.name || 'unknown';
    const status = job.status ?? 0;
    const lastRun = job.lastRun ?? 0;

    if (status === 0) {
      failures.push({
        name,
        type: 'cron',
        exitCode: -1,
        lastRunSeconds: lastRun,
        acknowledged: false,
      });
    }

    if (lastRun > 0) {
      timeline.push({
        name,
        type: 'cron',
        timestamp: lastRun,
        success: status === 1,
      });
    }
  }

  // Sort failures: most recent failure first
  failures.sort((a, b) => b.lastRunSeconds - a.lastRunSeconds);

  // Sort timeline: most recent first, limit 20
  timeline.sort((a, b) => b.timestamp - a.timestamp);

  return { failures, timeline: timeline.slice(0, 20) };
}

// ============ Utility Functions ============

function formatRelativeTime(seconds: number): string {
  if (seconds <= 0) return 'never';
  const now = Date.now() / 1000;
  const diff = now - seconds;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatAbsoluteTime(seconds: number): string {
  if (seconds <= 0) return 'N/A';
  return new Date(seconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Known dependency chains from job-manifest.json
const DEPENDENCY_MAP: Record<string, string[]> = {
  'market-scanner': ['kaspa-digest', 'portfolio-monitor'],
  'email-digest': ['morning-briefing', 'email-digest-daily', 'nightly-export'],
  'kb-updater': ['kb-digest', 'nightly-export'],
  'qmd-refresh': ['openclaw (memory search)'],
  'com.sdm.dashboard-exporter': ['grafana dashboards', 'alert rules'],
  'com.sdm.it-command-center': ['store-lookup CLI', 'knowledge RAG'],
  'com.sdm.alert-mitigator': ['self-healer monitoring'],
};

function getDependencies(jobName: string): string[] {
  // Try exact match first, then prefix/partial
  if (DEPENDENCY_MAP[jobName]) return DEPENDENCY_MAP[jobName];
  for (const [key, deps] of Object.entries(DEPENDENCY_MAP)) {
    if (jobName.includes(key) || key.includes(jobName)) return deps;
  }
  return [];
}

// ============ SVG Icons ============

const Icons = {
  alert: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  chevron: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  check: (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  link: (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  refresh: (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  ),
};

// ============ Sub-components ============

interface FailureCardProps {
  failure: FailureItem;
  isExpanded: boolean;
  onToggle: () => void;
  onRerun: (name: string) => void;
  onAcknowledge: (name: string) => void;
}

const FailureCard: React.FC<FailureCardProps> = ({
  failure,
  isExpanded,
  onToggle,
  onRerun,
  onAcknowledge,
}) => {
  const deps = getDependencies(failure.name);

  return (
    <div className={styles.failureCard}>
      <div className={styles.failureCardHeader} onClick={onToggle}>
        <div className={`${styles.failureIcon} ${failure.acknowledged ? styles.acknowledged : ''}`}>
          {Icons.alert}
        </div>
        <div className={styles.failureInfo}>
          <div className={styles.failureName}>{failure.name}</div>
          <div className={styles.failureMeta}>
            <span className={styles.failureExitCode}>
              {failure.type === 'cron' ? 'disabled' : `exit ${failure.exitCode}`}
            </span>
            <span className={styles.failureTime}>{formatRelativeTime(failure.lastRunSeconds)}</span>
            <span className={styles.failureType}>{failure.type}</span>
          </div>
        </div>
        <div className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
          {Icons.chevron}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.failureDetails}>
          {/* Dependency impact */}
          {deps.length > 0 && (
            <div className={styles.dependencyList}>
              <div className={styles.depLabel}>Downstream Impact</div>
              {deps.map((dep) => (
                <div key={dep} className={styles.depItem}>
                  {dep}
                </div>
              ))}
            </div>
          )}

          {/* Log area placeholder */}
          <div className={styles.logArea}>
            <span className={styles.logPlaceholder}>
              Log output for {failure.name}.{'\n'}
              Check /tmp/{failure.name}.log or use the agent action GET_JOB_LOG.
            </span>
          </div>

          {/* Action buttons */}
          <div className={styles.actionBtns}>
            <button
              className={`${styles.actionBtn} ${styles.primary}`}
              onClick={(e) => {
                e.stopPropagation();
                onRerun(failure.name);
              }}
            >
              {Icons.play} Re-run Now
            </button>
            {!failure.acknowledged && (
              <button
                className={`${styles.actionBtn} ${styles.warn}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(failure.name);
                }}
              >
                {Icons.check} Acknowledge
              </button>
            )}
            <button className={styles.actionBtn} onClick={(e) => e.stopPropagation()}>
              {Icons.link} View Dependencies
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const TimelineItem: React.FC<{ entry: TimelineEntry }> = ({ entry }) => {
  const dotClass = entry.success ? styles.success : styles.failure;
  const tagClass = entry.success ? styles.success : styles.failure;

  return (
    <div className={styles.timelineItem}>
      <div className={`${styles.timelineDot} ${dotClass}`} />
      <div className={styles.timelineContent}>
        <div className={styles.timelineJobName}>{entry.name}</div>
        <div className={styles.timelineTime}>
          {formatAbsoluteTime(entry.timestamp)} ({formatRelativeTime(entry.timestamp)})
        </div>
      </div>
      <span className={`${styles.timelineTag} ${tagClass}`}>{entry.success ? 'OK' : 'FAIL'}</span>
    </div>
  );
};

// ============ Main Component ============

const OperationsDashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);
  const [acknowledgedJobs, setAcknowledgedJobs] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============ Data Fetching ============

  const fetchData = useCallback(async () => {
    try {
      // Fetch metrics and escalations in parallel
      const [metricsRes, escalationsRes] = await Promise.allSettled([
        fetch('/api/local-proxy', {
          headers: { 'X-Target-URL': 'http://localhost:9100/metrics' },
        }),
        fetch('/api/local-proxy', {
          headers: { 'X-Target-URL': 'http://localhost:5561/api/escalations?limit=100' },
        }),
      ]);

      let failures: FailureItem[] = [];
      let timeline: TimelineEntry[] = [];
      let escalations: Escalation[] = [];

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const text = await metricsRes.value.text();
        const parsed = parsePrometheusForOps(text);
        failures = parsed.failures;
        timeline = parsed.timeline;
      } else {
        const reason =
          metricsRes.status === 'rejected'
            ? String(metricsRes.reason)
            : `HTTP ${metricsRes.value.status}`;
        throw new Error(`Metrics fetch failed: ${reason}`);
      }

      if (escalationsRes.status === 'fulfilled' && escalationsRes.value.ok) {
        try {
          const json = await escalationsRes.value.json();
          escalations = Array.isArray(json) ? json : json.escalations || [];
        } catch {
          // Escalation fetch is non-critical
          console.warn('[OpsDashboard] escalations parse failed');
        }
      }

      // Apply acknowledged state
      failures = failures.map((f) => ({
        ...f,
        acknowledged: acknowledgedJobs.has(f.name),
      }));

      setData({ failures, timeline, escalations, lastFetched: Date.now() });
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[OpsDashboard] fetch error:', msg);
    } finally {
      setIsLoading(false);
    }
  }, [acknowledgedJobs]);

  // ============ Auto-refresh ============

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchData();
    }, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // ============ Handlers ============

  const handleRerun = useCallback((jobName: string) => {
    reportAction(APP_ID, ActionTypes.RERUN_JOB, { job_name: jobName });
  }, []);

  const handleAcknowledge = useCallback((jobName: string) => {
    setAcknowledgedJobs((prev) => {
      const next = new Set(prev);
      next.add(jobName);
      return next;
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        failures: prev.failures.map((f) => (f.name === jobName ? { ...f, acknowledged: true } : f)),
      };
    });
    reportAction(APP_ID, ActionTypes.ACKNOWLEDGE_FAILURE, { job_name: jobName });
  }, []);

  // ============ Agent Action Listener ============

  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case ActionTypes.GET_FAILURES: {
          if (!data) return 'error: no data loaded';
          const failureList = data.failures.map((f) => ({
            name: f.name,
            type: f.type,
            exitCode: f.exitCode,
            lastRun: formatRelativeTime(f.lastRunSeconds),
            acknowledged: f.acknowledged,
          }));
          return JSON.stringify(failureList);
        }

        case ActionTypes.RERUN_JOB: {
          const jobName = action.params?.job_name;
          if (!jobName) return 'error: missing job_name param';
          // Signal to the bridge that a re-run is requested
          reportAction(APP_ID, ActionTypes.RERUN_JOB, { job_name: jobName });
          return `success: re-run requested for ${jobName}`;
        }

        case ActionTypes.GET_JOB_LOG: {
          const jobName = action.params?.job_name;
          if (!jobName) return 'error: missing job_name param';
          return JSON.stringify({
            job: jobName,
            logPath: `/tmp/${jobName}.log`,
            hint: 'Read the log file at the path above for full output',
          });
        }

        case ActionTypes.GET_DEPENDENCIES: {
          const jobName = action.params?.job_name;
          if (!jobName) return 'error: missing job_name param';
          const deps = getDependencies(jobName);
          return JSON.stringify({ job: jobName, downstream: deps });
        }

        case ActionTypes.ACKNOWLEDGE_FAILURE: {
          const jobName = action.params?.job_name;
          if (!jobName) return 'error: missing job_name param';
          handleAcknowledge(jobName);
          return `success: ${jobName} acknowledged`;
        }

        case ActionTypes.SYNC_STATE: {
          await fetchData();
          return 'success: state synced';
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [data, fetchData, handleAcknowledge],
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
          name: 'Operations Dashboard',
          windowStyle: { width: 750, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Operations Dashboard',
          windowStyle: { width: 750, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (err) {
          console.warn('[OpsDashboard] fetchVibeInfo failed:', err);
        }

        await fetchData();

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[OpsDashboard] init error:', err);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Filtered Data ============

  const filteredFailures = useMemo(() => {
    if (!data) return [];
    let list = data.failures;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    return list;
  }, [data, searchQuery]);

  const filteredTimeline = useMemo(() => {
    if (!data) return [];
    let list = data.timeline;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (showFailuresOnly) {
      list = list.filter((e) => !e.success);
    }
    return list;
  }, [data, searchQuery, showFailuresOnly]);

  // ============ Render ============

  if (isLoading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          Loading operations data...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.errorState}>
          <div className={styles.errorTitle}>Connection Failed</div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.retryBtn} onClick={() => fetchData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const unacknowledgedCount = data.failures.filter((f) => !f.acknowledged).length;

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Operations</span>
          {unacknowledgedCount > 0 && (
            <span className={styles.failureBadge}>{unacknowledgedCount}</span>
          )}
        </div>
        <button className={styles.filterBtn} onClick={() => fetchData()}>
          {Icons.refresh} Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Filter jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className={`${styles.filterBtn} ${showFailuresOnly ? styles.active : ''}`}
          onClick={() => setShowFailuresOnly((v) => !v)}
        >
          Failures Only
        </button>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Failures Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleDot} />
              Failures
            </div>
            <span className={styles.sectionCount}>{filteredFailures.length}</span>
          </div>

          {filteredFailures.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>&#10003;</div>
              <div className={styles.emptyText}>All systems operational</div>
            </div>
          ) : (
            filteredFailures.map((failure) => (
              <FailureCard
                key={`${failure.type}-${failure.name}`}
                failure={failure}
                isExpanded={expandedJob === failure.name}
                onToggle={() =>
                  setExpandedJob((prev) => (prev === failure.name ? null : failure.name))
                }
                onRerun={handleRerun}
                onAcknowledge={handleAcknowledge}
              />
            ))
          )}
        </div>

        {/* Recent Activity Timeline */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Recent Activity</div>
            <span className={styles.sectionCount}>{filteredTimeline.length}</span>
          </div>

          <div className={styles.timeline}>
            {filteredTimeline.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyText}>No recent activity</div>
              </div>
            ) : (
              filteredTimeline.map((entry, idx) => (
                <TimelineItem key={`${entry.name}-${idx}`} entry={entry} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsDashboardPage;
