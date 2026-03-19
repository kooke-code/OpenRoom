import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  status: number; // 1 = running, 0 = stopped
  exitCode: number;
  lastRunSeconds: number;
}

interface CronJob {
  name: string;
  status: number; // 1 = enabled, 0 = disabled
  lastRun: number; // unix timestamp
}

interface ServiceStatus {
  name: string;
  up: boolean;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
}

interface DashboardState {
  launchdJobs: LaunchdJob[];
  cronJobs: CronJob[];
  services: ServiceStatus[];
  system: SystemMetrics;
  lastFetched: number;
}

// ============ Prometheus Parser ============

function parsePrometheusMetrics(text: string): DashboardState {
  const lines = text.split('\n');
  const launchdMap = new Map<string, Partial<LaunchdJob>>();
  const cronMap = new Map<string, Partial<CronJob>>();
  const services: ServiceStatus[] = [];
  const system: SystemMetrics = { cpu: 0, memory: 0, disk: 0 };

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    // System metrics
    const cpuMatch = line.match(/^clodette_system_cpu_percent\s+([\d.]+)/);
    if (cpuMatch) {
      system.cpu = parseFloat(cpuMatch[1]);
      continue;
    }

    const memMatch = line.match(/^clodette_system_memory_percent\s+([\d.]+)/);
    if (memMatch) {
      system.memory = parseFloat(memMatch[1]);
      continue;
    }

    const diskMatch = line.match(/^clodette_system_disk_percent\s+([\d.]+)/);
    if (diskMatch) {
      system.disk = parseFloat(diskMatch[1]);
      continue;
    }

    // Service up/down
    const svcMatch = line.match(/^clodette_service_up\{service="([^"]+)"\}\s+([\d.]+)/);
    if (svcMatch) {
      services.push({ name: svcMatch[1], up: parseFloat(svcMatch[2]) === 1 });
      continue;
    }

    // Launchd jobs
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

    // Cron jobs
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

  const launchdJobs: LaunchdJob[] = Array.from(launchdMap.values()).map((j) => ({
    name: j.name || 'unknown',
    status: j.status ?? 0,
    exitCode: j.exitCode ?? 0,
    lastRunSeconds: j.lastRunSeconds ?? 0,
  }));

  const cronJobs: CronJob[] = Array.from(cronMap.values()).map((j) => ({
    name: j.name || 'unknown',
    status: j.status ?? 0,
    lastRun: j.lastRun ?? 0,
  }));

  // Sort: errors first, then by name
  launchdJobs.sort((a, b) => {
    const aErr = a.exitCode !== 0 ? 0 : 1;
    const bErr = b.exitCode !== 0 ? 0 : 1;
    if (aErr !== bErr) return aErr - bErr;
    return a.name.localeCompare(b.name);
  });

  cronJobs.sort((a, b) => {
    const aErr = a.status === 0 ? 0 : 1;
    const bErr = b.status === 0 ? 0 : 1;
    if (aErr !== bErr) return aErr - bErr;
    return a.name.localeCompare(b.name);
  });

  return { launchdJobs, cronJobs, services, system, lastFetched: Date.now() };
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

function formatTimestamp(ts: number): string {
  if (ts <= 0) return 'never';
  const date = new Date(ts * 1000);
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getGaugeLevel(value: number): 'ok' | 'warning' | 'critical' {
  if (value >= 85) return 'critical';
  if (value >= 70) return 'warning';
  return 'ok';
}

function isJobStale(lastRunSeconds: number): boolean {
  if (lastRunSeconds <= 0) return true;
  const hoursSinceRun = (Date.now() / 1000 - lastRunSeconds) / 3600;
  return hoursSinceRun > 24;
}

function isCronStale(lastRun: number): boolean {
  if (lastRun <= 0) return true;
  const hoursSinceRun = (Date.now() / 1000 - lastRun) / 3600;
  return hoursSinceRun > 24;
}

// ============ SVG Icons ============

const Icons = {
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
  server: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
};

// ============ Sub-components ============

const SystemGauge: React.FC<{ label: string; value: number; unit?: string }> = ({
  label,
  value,
  unit = '%',
}) => {
  const level = getGaugeLevel(value);
  return (
    <div className={styles.gauge}>
      <span className={styles.gaugeLabel}>{label}</span>
      <span className={`${styles.gaugeValue} ${styles[level]}`}>
        {value.toFixed(1)}
        {unit}
      </span>
      <div className={styles.gaugeBar}>
        <div
          className={`${styles.gaugeBarFill} ${styles[level]}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
};

const JobCard: React.FC<{ job: LaunchdJob }> = ({ job }) => {
  const hasError = job.exitCode !== 0;
  const stale = isJobStale(job.lastRunSeconds);
  const cardClass = hasError ? styles.error : stale ? styles.stale : '';
  const dotClass = hasError ? styles.error : stale ? styles.warning : styles.ok;

  return (
    <div className={`${styles.jobCard} ${cardClass}`}>
      <div className={styles.jobStatus}>
        <div className={`${styles.statusDot} ${dotClass}`} />
      </div>
      <div className={styles.jobInfo}>
        <div className={styles.jobName} title={job.name}>
          {job.name}
        </div>
        <div className={styles.jobMeta}>
          <span className={styles.jobTime}>{formatRelativeTime(job.lastRunSeconds)}</span>
          {hasError && <span className={styles.jobExitCode}>exit {job.exitCode}</span>}
        </div>
      </div>
    </div>
  );
};

const CronCard: React.FC<{ job: CronJob }> = ({ job }) => {
  const disabled = job.status === 0;
  const stale = isCronStale(job.lastRun);
  const cardClass = disabled ? styles.error : stale ? styles.stale : '';
  const dotClass = disabled ? styles.error : stale ? styles.warning : styles.ok;

  return (
    <div className={`${styles.jobCard} ${cardClass}`}>
      <div className={styles.jobStatus}>
        <div className={`${styles.statusDot} ${dotClass}`} />
      </div>
      <div className={styles.jobInfo}>
        <div className={styles.jobName} title={job.name}>
          {job.name}
        </div>
        <div className={styles.jobMeta}>
          <span className={styles.jobTime}>{formatTimestamp(job.lastRun)}</span>
          {disabled && <span className={styles.jobExitCode}>disabled</span>}
        </div>
      </div>
    </div>
  );
};

// ============ Main Component ============

const MissionControlPage: React.FC = () => {
  const [state, setState] = useState<DashboardState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============ Data Fetching ============

  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch('/api/local-proxy', {
        headers: { 'X-Target-URL': 'http://localhost:9100/metrics' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const text = await response.text();
      const parsed = parsePrometheusMetrics(text);
      setState(parsed);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[MissionControl] fetch error:', msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // ============ Auto-refresh ============

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchMetrics(true);
    }, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMetrics]);

  // ============ Agent Action Listener ============

  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case ActionTypes.REFRESH_STATUS: {
          await fetchMetrics();
          reportAction(APP_ID, ActionTypes.REFRESH_STATUS);
          return 'success: data refreshed';
        }
        case ActionTypes.GET_JOB_STATUS: {
          const jobName = action.params?.job_name;
          if (!jobName) return 'error: missing job_name param';
          if (!state) return 'error: no data loaded';

          const launchd = state.launchdJobs.find(
            (j) => j.name.toLowerCase() === jobName.toLowerCase(),
          );
          if (launchd) {
            return JSON.stringify({
              type: 'launchd',
              name: launchd.name,
              status: launchd.status === 1 ? 'running' : 'stopped',
              exitCode: launchd.exitCode,
              lastRun: formatRelativeTime(launchd.lastRunSeconds),
            });
          }

          const cron = state.cronJobs.find((j) => j.name.toLowerCase() === jobName.toLowerCase());
          if (cron) {
            return JSON.stringify({
              type: 'cron',
              name: cron.name,
              status: cron.status === 1 ? 'enabled' : 'disabled',
              lastRun: formatTimestamp(cron.lastRun),
            });
          }

          return `error: job "${jobName}" not found`;
        }
        case ActionTypes.SYNC_STATE: {
          await fetchMetrics();
          return 'success: state synced';
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [fetchMetrics, state],
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
          name: 'Mission Control',
          windowStyle: { width: 800, height: 600 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Mission Control',
          windowStyle: { width: 800, height: 600 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (err) {
          console.warn('[MissionControl] fetchVibeInfo failed:', err);
        }

        await fetchMetrics();

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[MissionControl] init error:', err);
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

  // ============ Derived State ============

  const overallStatus = state
    ? state.launchdJobs.some((j) => j.exitCode !== 0) || state.services.some((s) => !s.up)
      ? 'error'
      : state.launchdJobs.some((j) => isJobStale(j.lastRunSeconds))
        ? 'warning'
        : 'ok'
    : 'unknown';

  const launchdErrorCount = state ? state.launchdJobs.filter((j) => j.exitCode !== 0).length : 0;

  const cronDisabledCount = state ? state.cronJobs.filter((j) => j.status === 0).length : 0;

  // ============ Render ============

  if (isLoading) {
    return (
      <div className={styles.missionControl}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          Connecting to exporter...
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className={styles.missionControl}>
        <div className={styles.errorState}>
          <div className={styles.errorTitle}>Connection Failed</div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.retryBtn} onClick={() => fetchMetrics()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className={styles.missionControl}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={`${styles.statusDot} ${styles[overallStatus]}`} />
          <span className={styles.title}>Mission Control</span>
        </div>
        <div className={styles.headerLeft}>
          <span className={styles.lastUpdated}>
            {new Date(state.lastFetched).toLocaleTimeString()}
          </span>
          <button
            className={`${styles.refreshBtn} ${isRefreshing ? styles.spinning : ''}`}
            onClick={() => fetchMetrics()}
            disabled={isRefreshing}
          >
            {Icons.refresh}
            Refresh
          </button>
        </div>
      </div>

      {/* System Stats */}
      <div className={styles.systemStats}>
        <SystemGauge label="CPU" value={state.system.cpu} />
        <SystemGauge label="Memory" value={state.system.memory} />
        <SystemGauge label="Disk" value={state.system.disk} />
      </div>

      {/* Services Row */}
      {state.services.length > 0 && (
        <div className={styles.servicesRow}>
          <span className={styles.servicesLabel}>Services</span>
          {state.services.map((svc) => (
            <div
              key={svc.name}
              className={`${styles.serviceDot} ${svc.up ? styles.up : styles.down}`}
            >
              <span className={styles.serviceIndicator} />
              {svc.name}
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className={styles.servicesRow} style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <span className={styles.servicesLabel} style={{ color: '#ef4444' }}>
            Last fetch failed: {error}
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className={styles.mainContent}>
        <div className={styles.jobGrid}>
          {/* Launchd Column */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              Launchd Services
              <span className={styles.columnCount}>
                {state.launchdJobs.length}
                {launchdErrorCount > 0 && ` / ${launchdErrorCount} err`}
              </span>
            </div>
            {state.launchdJobs.map((job) => (
              <JobCard key={job.name} job={job} />
            ))}
            {state.launchdJobs.length === 0 && (
              <div className={styles.jobCard}>
                <div className={styles.jobInfo}>
                  <div className={styles.jobName} style={{ color: '#8b949e' }}>
                    No launchd jobs found
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cron Column */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              Cron Jobs
              <span className={styles.columnCount}>
                {state.cronJobs.length}
                {cronDisabledCount > 0 && ` / ${cronDisabledCount} off`}
              </span>
            </div>
            {state.cronJobs.map((job) => (
              <CronCard key={job.name} job={job} />
            ))}
            {state.cronJobs.length === 0 && (
              <div className={styles.jobCard}>
                <div className={styles.jobInfo}>
                  <div className={styles.jobName} style={{ color: '#8b949e' }}>
                    No cron jobs found
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionControlPage;
