import React, { useEffect, useState, useCallback } from 'react';
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
const APP_ID = 30;

// ============ Types ============
type TabType = 'health' | 'backups' | 'media' | 'browser';

interface DiskInfo {
  id: string;
  name: string;
  model: string;
  size_tb: number;
  health: 'healthy' | 'warning' | 'failing';
  temperature: number;
}

interface NasHealth {
  status: 'online' | 'offline' | 'degraded';
  model: string;
  capacity_tb: number;
  used_tb: number;
  disks: DiskInfo[];
  temperature: number;
  uptime: string;
}

interface BackupEntry {
  id: string;
  date: string;
  size_gb: number;
  duration_min: number;
  status: 'success' | 'failed' | 'running' | 'pending';
  type: string;
}

interface PipelineStage {
  name: string;
  queued: number;
  completed: number;
  errors: number;
  active: boolean;
}

interface MediaItem {
  id: string;
  name: string;
  size_mb: number;
  type: 'video' | 'image' | 'audio';
  stage: string;
}

interface FileEntry {
  name: string;
  type: 'folder' | 'file';
  size?: string;
}

// ============ Mock Data ============
const MOCK_HEALTH: NasHealth = {
  status: 'online',
  model: 'Asustor AS5404T (Nimbustor)',
  capacity_tb: 11,
  used_tb: 2.2,
  disks: [
    {
      id: 'd1',
      name: 'Disk 1',
      model: 'WD Red Plus 4TB',
      size_tb: 4,
      health: 'healthy',
      temperature: 38,
    },
    {
      id: 'd2',
      name: 'Disk 2',
      model: 'WD Red Plus 4TB',
      size_tb: 4,
      health: 'healthy',
      temperature: 39,
    },
    {
      id: 'd3',
      name: 'Disk 3',
      model: 'WD Red Plus 2TB',
      size_tb: 2,
      health: 'healthy',
      temperature: 37,
    },
    {
      id: 'd4',
      name: 'Disk 4',
      model: 'WD Red Plus 1TB',
      size_tb: 1,
      health: 'warning',
      temperature: 44,
    },
  ],
  temperature: 42,
  uptime: '47 days, 12 hours',
};

const MOCK_BACKUPS: BackupEntry[] = [
  {
    id: 'b1',
    date: '2026-03-16T02:00:00Z',
    size_gb: 14.2,
    duration_min: 38,
    status: 'success',
    type: 'Weekly SSD Backup',
  },
  {
    id: 'b2',
    date: '2026-03-09T02:00:00Z',
    size_gb: 13.8,
    duration_min: 35,
    status: 'success',
    type: 'Weekly SSD Backup',
  },
  {
    id: 'b3',
    date: '2026-03-02T02:00:00Z',
    size_gb: 13.5,
    duration_min: 34,
    status: 'success',
    type: 'Weekly SSD Backup',
  },
  {
    id: 'b4',
    date: '2026-02-23T02:00:00Z',
    size_gb: 13.1,
    duration_min: 33,
    status: 'success',
    type: 'Weekly SSD Backup',
  },
  {
    id: 'b5',
    date: '2026-02-16T02:00:00Z',
    size_gb: 12.8,
    duration_min: 31,
    status: 'failed',
    type: 'Weekly SSD Backup',
  },
];

const MOCK_PIPELINE_STAGES: PipelineStage[] = [
  { name: 'Scan', queued: 12, completed: 856, errors: 0, active: true },
  { name: 'Analyze', queued: 8, completed: 844, errors: 2, active: true },
  { name: 'Cluster', queued: 3, completed: 830, errors: 0, active: false },
  { name: 'Script', queued: 0, completed: 0, errors: 0, active: false },
  { name: 'Render', queued: 0, completed: 0, errors: 0, active: false },
];

const MOCK_MEDIA: MediaItem[] = [
  {
    id: 'm1',
    name: 'GoPro_2025_costarica_001.mp4',
    size_mb: 2340,
    type: 'video',
    stage: 'Analyze',
  },
  { id: 'm2', name: 'DJI_0042_aerial_sunset.mp4', size_mb: 1850, type: 'video', stage: 'Scan' },
  { id: 'm3', name: 'GoPro_2024_diving_012.mp4', size_mb: 3100, type: 'video', stage: 'Cluster' },
  {
    id: 'm4',
    name: 'Costa-Rica_beach_timelapse.mp4',
    size_mb: 890,
    type: 'video',
    stage: 'Analyze',
  },
  { id: 'm5', name: 'GoPro_hiking_001.mp4', size_mb: 1520, type: 'video', stage: 'Scan' },
  { id: 'm6', name: 'DJI_0015_city_flyover.mp4', size_mb: 2200, type: 'video', stage: 'Scan' },
];

const MOCK_FILES: Record<string, FileEntry[]> = {
  '/': [
    { name: 'Clodette', type: 'folder' },
    { name: 'Media', type: 'folder' },
    { name: 'Public', type: 'folder' },
    { name: 'Backups', type: 'folder' },
  ],
  '/Clodette': [
    { name: 'email-archive', type: 'folder' },
    { name: 'backups', type: 'folder' },
  ],
  '/Clodette/email-archive': [
    { name: 'email-attachments.tar', type: 'file', size: '8.0 GB' },
    { name: 'email-documents.tar', type: 'file', size: '2.7 GB' },
  ],
  '/Media': [
    { name: 'gopro', type: 'folder' },
    { name: 'Costa-Rica', type: 'folder' },
    { name: 'DJI', type: 'folder' },
    { name: 'home-videos', type: 'folder' },
  ],
  '/Media/gopro': [
    { name: 'GoPro_2025_costarica_001.mp4', type: 'file', size: '2.3 GB' },
    { name: 'GoPro_2024_diving_012.mp4', type: 'file', size: '3.1 GB' },
    { name: 'GoPro_hiking_001.mp4', type: 'file', size: '1.5 GB' },
  ],
  '/Media/home-videos': [{ name: 'MANIFEST.md', type: 'file', size: '4.2 KB' }],
};

// ============ Utilities ============
const getTempClass = (temp: number): string => {
  if (temp >= 50) return 'hot';
  if (temp >= 42) return 'warm';
  return 'normal';
};

const getStorageFillClass = (pct: number): string => {
  if (pct >= 90) return styles.critical;
  if (pct >= 70) return styles.warning;
  return '';
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatSize = (mb: number): string => {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
};

const fileIcon = (type: string, name: string): string => {
  if (type === 'folder') return '\uD83D\uDCC1';
  if (name.endsWith('.mp4') || name.endsWith('.mov')) return '\uD83C\uDFAC';
  if (name.endsWith('.tar') || name.endsWith('.zip')) return '\uD83D\uDCE6';
  if (name.endsWith('.md') || name.endsWith('.txt')) return '\uD83D\uDCC4';
  return '\uD83D\uDCC4';
};

const mediaTypeIcon = (type: string): string => {
  if (type === 'video') return '\uD83C\uDFAC';
  if (type === 'image') return '\uD83D\uDDBC';
  if (type === 'audio') return '\uD83C\uDFB5';
  return '\uD83D\uDCC4';
};

// ============ Sub-components ============

const HealthTab: React.FC<{ health: NasHealth }> = ({ health }) => {
  const usagePct = (health.used_tb / health.capacity_tb) * 100;
  const freeTb = health.capacity_tb - health.used_tb;

  return (
    <div>
      <div className={styles.healthHeader}>
        <div className={`${styles.nasStatusBadge} ${styles[health.status]}`}>
          <span className={`${styles.statusDot} ${styles[health.status]}`} />
          {health.status.toUpperCase()}
        </div>
        <div className={styles.nasInfo}>
          <div className={styles.nasModel}>{health.model}</div>
          <div className={styles.nasUptime}>Uptime: {health.uptime}</div>
        </div>
      </div>

      <div className={styles.storageSection}>
        <div className={styles.storageBarContainer}>
          <div className={styles.storageBarLabel}>
            <span className={styles.storageBarUsed}>{health.used_tb.toFixed(1)} TB used</span>
            <span className={styles.storageBarTotal}>
              {freeTb.toFixed(1)} TB free of {health.capacity_tb} TB
            </span>
          </div>
          <div className={styles.storageBar}>
            <div
              className={`${styles.storageBarFill} ${getStorageFillClass(usagePct)}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className={styles.storagePercent}>{usagePct.toFixed(1)}% used</div>
        </div>
      </div>

      <div className={styles.tempSection}>
        <div className={styles.tempGauge}>
          <div className={`${styles.tempValue} ${styles[getTempClass(health.temperature)]}`}>
            {health.temperature}&deg;C
          </div>
          <div className={styles.tempLabel}>System Temperature</div>
        </div>
      </div>

      <h3 className={styles.sectionTitle}>Disks</h3>
      <div className={styles.diskGrid}>
        {health.disks.map((disk) => (
          <div key={disk.id} className={styles.diskCard}>
            <div className={styles.diskHeader}>
              <span className={styles.diskName}>{disk.name}</span>
              <span className={`${styles.diskHealth} ${styles[disk.health]}`}>{disk.health}</span>
            </div>
            <div className={styles.diskInfo}>
              <span>{disk.model}</span>
              <span className={`${styles.diskTemp} ${styles[getTempClass(disk.temperature)]}`}>
                {disk.temperature}&deg;C
              </span>
            </div>
            <div className={styles.diskInfo} style={{ marginTop: 4 }}>
              <span>{disk.size_tb} TB</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BackupsTab: React.FC<{ backups: BackupEntry[]; onRunBackup: () => void }> = ({
  backups,
  onRunBackup,
}) => {
  const lastBackup = backups[0];

  return (
    <div>
      {lastBackup && (
        <div className={styles.backupCard}>
          <div className={styles.backupHeader}>
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
              Last Backup
            </h3>
            <div className={`${styles.backupStatus} ${styles[lastBackup.status]}`}>
              <span className={styles.backupStatusDot} />
              {lastBackup.status.toUpperCase()}
            </div>
          </div>
          <div className={styles.backupStats}>
            <div className={styles.backupStat}>
              <div className={styles.backupStatLabel}>Date</div>
              <div className={styles.backupStatValue}>{formatDate(lastBackup.date)}</div>
            </div>
            <div className={styles.backupStat}>
              <div className={styles.backupStatLabel}>Size</div>
              <div className={styles.backupStatValue}>{lastBackup.size_gb} GB</div>
            </div>
            <div className={styles.backupStat}>
              <div className={styles.backupStatLabel}>Duration</div>
              <div className={styles.backupStatValue}>{lastBackup.duration_min} min</div>
            </div>
          </div>
        </div>
      )}

      <button className={styles.runBackupBtn} onClick={onRunBackup}>
        Run Backup Now
      </button>

      <h3 className={styles.sectionTitle}>Backup History</h3>
      <table className={styles.backupTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Size</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.id}>
              <td>{formatDate(b.date)}</td>
              <td>{b.type}</td>
              <td>{b.size_gb} GB</td>
              <td>{b.duration_min} min</td>
              <td>
                <span className={`${styles.backupStatus} ${styles[b.status]}`}>
                  <span className={styles.backupStatusDot} />
                  {b.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MediaPipelineTab: React.FC<{ stages: PipelineStage[]; media: MediaItem[] }> = ({
  stages,
  media,
}) => (
  <div>
    <h3 className={styles.sectionTitle}>Pipeline Stages</h3>
    <div className={styles.pipelineFlow}>
      {stages.map((stage, i) => (
        <React.Fragment key={stage.name}>
          <div className={styles.pipelineStage}>
            <div
              className={`${styles.pipelineStageBox} ${
                stage.active
                  ? styles.active
                  : stage.completed > 0 && stage.errors === 0
                    ? styles.complete
                    : ''
              } ${stage.errors > 0 ? styles.error : ''}`}
            >
              <div className={styles.pipelineStageName}>{stage.name}</div>
              <div className={styles.pipelineStageStats}>
                <div className={styles.pipelineStat}>
                  <span className={styles.pipelineStatLabel}>Queued</span>
                  <span
                    className={`${styles.pipelineStatValue} ${stage.queued > 0 ? styles.queued : ''}`}
                  >
                    {stage.queued}
                  </span>
                </div>
                <div className={styles.pipelineStat}>
                  <span className={styles.pipelineStatLabel}>Done</span>
                  <span
                    className={`${styles.pipelineStatValue} ${stage.completed > 0 ? styles.completed : ''}`}
                  >
                    {stage.completed}
                  </span>
                </div>
                {stage.errors > 0 && (
                  <div className={styles.pipelineStat}>
                    <span className={styles.pipelineStatLabel}>Errors</span>
                    <span className={`${styles.pipelineStatValue} ${styles.errors}`}>
                      {stage.errors}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {i < stages.length - 1 && <div className={styles.pipelineArrow}>&rarr;</div>}
        </React.Fragment>
      ))}
    </div>

    <h3 className={styles.sectionTitle}>Recent Media Items</h3>
    <div className={styles.mediaGrid}>
      {media.map((item) => (
        <div key={item.id} className={styles.mediaItem}>
          <div className={styles.mediaThumbnail}>{mediaTypeIcon(item.type)}</div>
          <div className={styles.mediaInfo}>
            <div className={styles.mediaName}>{item.name}</div>
            <div className={styles.mediaSize}>
              {formatSize(item.size_mb)} &middot; {item.stage}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StorageBrowserTab: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/');
  const files = MOCK_FILES[currentPath] || [];

  const pathSegments = currentPath === '/' ? [''] : currentPath.split('/');

  const navigateTo = (entry: FileEntry) => {
    if (entry.type === 'folder') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      setCurrentPath(newPath);
    }
  };

  const navigateToSegment = (index: number) => {
    if (index === 0) {
      setCurrentPath('/');
    } else {
      setCurrentPath(pathSegments.slice(0, index + 1).join('/'));
    }
  };

  return (
    <div>
      <div className={styles.fileBrowser}>
        <div className={styles.fileBrowserPath}>
          {pathSegments.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className={styles.filePathSep}>/</span>}
              <span
                className={`${styles.filePathSegment} ${i === pathSegments.length - 1 ? styles.current : ''}`}
                onClick={() => navigateToSegment(i)}
              >
                {i === 0 ? 'NAS' : seg}
              </span>
            </React.Fragment>
          ))}
        </div>
        <div className={styles.fileList}>
          {currentPath !== '/' && (
            <div
              className={styles.fileItem}
              onClick={() => {
                const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                setCurrentPath(parent);
              }}
            >
              <span className={styles.fileIcon}>..</span>
              <span className={styles.fileName}>Parent Directory</span>
            </div>
          )}
          {files.map((f, i) => (
            <div key={i} className={styles.fileItem} onClick={() => navigateTo(f)}>
              <span className={styles.fileIcon}>{fileIcon(f.type, f.name)}</span>
              <span className={styles.fileName}>{f.name}</span>
              {f.size && <span className={styles.fileSize}>{f.size}</span>}
            </div>
          ))}
          {files.length === 0 && <div className={styles.emptyState}>Empty directory</div>}
        </div>
      </div>
    </div>
  );
};

// ============ Main Component ============
const NasStoragePage: React.FC = () => {
  const [health, setHealth] = useState<NasHealth>(MOCK_HEALTH);
  const [backups, setBackups] = useState<BackupEntry[]>(MOCK_BACKUPS);
  const [pipelineStages] = useState<PipelineStage[]>(MOCK_PIPELINE_STAGES);
  const [media] = useState<MediaItem[]>(MOCK_MEDIA);
  const [activeTab, setActiveTab] = useState<TabType>('health');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Try to fetch real NAS health
  const fetchNasHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/local-proxy', {
        headers: { 'X-Target-URL': 'http://localhost:9100/nas-health' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.status) {
          setHealth(data);
          setError(null);
          return;
        }
      }
    } catch {
      // NAS health endpoint not available
    }
    setError('NAS health API unavailable - showing mock data');
  }, []);

  const handleRunBackup = useCallback(() => {
    const newBackup: BackupEntry = {
      id: `b${Date.now()}`,
      date: new Date().toISOString(),
      size_gb: 0,
      duration_min: 0,
      status: 'running',
      type: 'Manual Backup',
    };
    setBackups((prev) => [newBackup, ...prev]);
    reportAction(APP_ID, 'RUN_BACKUP', {});
  }, []);

  // Agent action handler
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_NAS_HEALTH':
          return JSON.stringify(health);
        case 'GET_BACKUP_STATUS':
          return JSON.stringify(backups);
        case 'RUN_BACKUP':
          handleRunBackup();
          return 'success: backup started';
        case 'GET_MEDIA_PIPELINE':
          return JSON.stringify({ stages: pipelineStages, recentMedia: media });
        case 'MOUNT_NAS':
          reportAction(APP_ID, 'MOUNT_NAS', {});
          return 'success: mount requested (run bash ~/clawd/sdm-control/scripts/nas-mount.sh)';
        case 'SYNC_STATE':
          await fetchNasHealth();
          return JSON.stringify({ status: health.status });
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [health, backups, pipelineStages, media, handleRunBackup, fetchNasHealth],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // Initialization
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'NasStorage',
          windowStyle: { width: 750, height: 620 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'NasStorage',
          windowStyle: { width: 750, height: 620 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch {
          // Non-critical
        }

        await fetchNasHealth();

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[NasStorage] Init error:', err);
        setIsLoading(false);
        setError(String(err));
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.nasStorage}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Connecting to NAS...</div>
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'health', label: 'Health' },
    { key: 'backups', label: 'Backups' },
    { key: 'media', label: 'Media Pipeline' },
    { key: 'browser', label: 'Storage Browser' },
  ];

  return (
    <div className={styles.nasStorage}>
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.navTabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.navTab} ${activeTab === tab.key ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'health' && <HealthTab health={health} />}
        {activeTab === 'backups' && <BackupsTab backups={backups} onRunBackup={handleRunBackup} />}
        {activeTab === 'media' && <MediaPipelineTab stages={pipelineStages} media={media} />}
        {activeTab === 'browser' && <StorageBrowserTab />}
      </div>
    </div>
  );
};

export default NasStoragePage;
