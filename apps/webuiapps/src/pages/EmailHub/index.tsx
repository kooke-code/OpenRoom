import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  type CharacterAppAction,
} from '@/lib';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 23;
const APP_NAME = 'EmailHub';
const PROXY_BASE = '/api/local-proxy';
const ESCALATION_API = 'http://localhost:5561';
const TRIAGE_PATH = '/api/session-data?path=apps/emailHub/data/triage.json';

// ============ Type Definitions ============
type AccountType = 'work' | 'personal' | 'archive';
type ViewMode = 'folders' | 'triage';
type PriorityTier = 'action_required' | 'meeting_info' | 'info_only' | 'skip';

interface EmailAddress {
  name: string;
  address: string;
}

interface TriageEmail {
  id: string;
  from: EmailAddress;
  to?: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  preview: string;
  content?: string;
  timestamp: string;
  priority: PriorityTier;
  folder?: string;
  isRead?: boolean;
  source?: string;
}

interface TriageData {
  date: string;
  emails: TriageEmail[];
  summary?: {
    total: number;
    action_required: number;
    meeting_info: number;
    info_only: number;
    skip: number;
  };
}

interface ArchiveSearchResult {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  preview: string;
  folder: string;
}

// ============ Folder Config ============
const WORK_FOLDERS = [
  'Inbox',
  'Sent Items',
  'Drafts',
  'Deleted Items',
  'Calendar',
  'Contacts',
  'Journal',
  'Junk Email',
  'Notes',
  'Outbox',
  'RSS Feeds',
  'Tasks',
  'Conversation History',
  'Sync Issues',
  'BCC-zelf gestuurd',
  'Helpdesk Tickets',
  'SAP Notifications',
  'Shurgard Announcements',
  'Vendor Quotes',
];

const PERSONAL_FOLDERS = ['Inbox', 'Sent', 'Drafts', 'Spam', 'Trash'];

const PRIORITY_CONFIG: Record<PriorityTier, { label: string; className: string }> = {
  action_required: { label: 'Action Required', className: 'priorityAction' },
  meeting_info: { label: 'Meeting Info', className: 'priorityMeeting' },
  info_only: { label: 'Info Only', className: 'priorityInfo' },
  skip: { label: 'Skip', className: 'prioritySkip' },
};

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
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDetailTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getInitial = (name: string): string => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

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

// ============ SVG Icons ============
const Icons = {
  inbox: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5v-3h3.56c.69 1.19 1.97 2 3.45 2s2.75-.81 3.45-2H19v3zm0-5h-4.99c0 1.1-.9 2-2 2s-2-.9-2-2H5V5h14v9z" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  ),
  compose: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  ),
  triage: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
    </svg>
  ),
  personal: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  ),
  archive: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
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
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
};

// ============ Sub-components ============

interface EmailListItemProps {
  email: TriageEmail;
  isSelected: boolean;
  onSelect: (id: string) => void;
  showPriority?: boolean;
}

const EmailListItem: React.FC<EmailListItemProps> = ({
  email,
  isSelected,
  onSelect,
  showPriority,
}) => {
  return (
    <div
      className={`${styles.emailItem} ${isSelected ? styles.selected : ''} ${!email.isRead ? styles.unread : ''}`}
      onClick={() => onSelect(email.id)}
    >
      {!email.isRead && <div className={styles.unreadDot} />}
      <div className={styles.emailAvatar}>{getInitial(email.from.name || email.from.address)}</div>
      <div className={styles.emailContent}>
        <div className={styles.emailTopRow}>
          <span className={styles.emailSender}>{email.from.name || email.from.address}</span>
          <span className={styles.emailTime}>{formatRelativeTime(email.timestamp)}</span>
        </div>
        <div className={styles.emailSubjectRow}>
          <span className={styles.emailSubject}>{email.subject || '(no subject)'}</span>
        </div>
        <div className={styles.emailBottomRow}>
          <span className={styles.emailPreview}>{email.preview}</span>
          {showPriority && email.priority && (
            <span
              className={`${styles.priorityBadge} ${styles[PRIORITY_CONFIG[email.priority].className]}`}
            >
              {PRIORITY_CONFIG[email.priority].label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface EmailDetailViewProps {
  email: TriageEmail;
  onBack: () => void;
}

const EmailDetailView: React.FC<EmailDetailViewProps> = ({ email, onBack }) => {
  const toStr = email.to?.map((a) => a.name || a.address).join(', ') || '';
  const ccStr = email.cc?.length ? email.cc.map((a) => a.name || a.address).join(', ') : '';

  return (
    <div className={styles.detailView}>
      <div className={styles.detailToolbar}>
        <button className={styles.backBtn} onClick={onBack}>
          {Icons.back}
        </button>
        {email.priority && (
          <span
            className={`${styles.priorityBadge} ${styles[PRIORITY_CONFIG[email.priority].className]}`}
          >
            {PRIORITY_CONFIG[email.priority].label}
          </span>
        )}
      </div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailSubject}>{email.subject || '(no subject)'}</h2>
        <div className={styles.detailMeta}>
          <div className={styles.detailAvatar}>
            {getInitial(email.from.name || email.from.address)}
          </div>
          <div className={styles.detailSenderInfo}>
            <div className={styles.detailSenderRow}>
              <span className={styles.detailSenderName}>{email.from.name}</span>
              <span className={styles.detailSenderAddress}>&lt;{email.from.address}&gt;</span>
            </div>
            {toStr && <div className={styles.detailRecipients}>To: {toStr}</div>}
            {ccStr && <div className={styles.detailRecipients}>Cc: {ccStr}</div>}
          </div>
          <span className={styles.detailTime}>{formatDetailTime(email.timestamp)}</span>
        </div>
      </div>
      <div className={styles.detailBody}>{email.content || email.preview}</div>
    </div>
  );
};

// ============ Main Component ============
const EmailHubPage: React.FC = () => {
  const [account, setAccount] = useState<AccountType>('work');
  const [viewMode, setViewMode] = useState<ViewMode>('triage');
  const [selectedFolder, setSelectedFolder] = useState<string>('Inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');

  const [triageData, setTriageData] = useState<TriageData | null>(null);
  const [archiveResults, setArchiveResults] = useState<ArchiveSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============ Data Fetching ============
  const fetchTriage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(TRIAGE_PATH);
      if (res.ok) {
        const data = await res.json();
        setTriageData(data);
      } else {
        // Fallback: try proxy to escalation API for connectivity test
        const proxyRes = await proxyFetch(`${ESCALATION_API}/api/escalations/stats`);
        if (proxyRes.ok) {
          // API reachable but no triage data yet
          setTriageData({ date: new Date().toISOString().split('T')[0], emails: [] });
        } else {
          setError('Unable to load email triage data');
        }
      }
    } catch (err) {
      console.error('[EmailHub] Fetch triage error:', err);
      setError('Failed to connect to email service');
      setTriageData({ date: new Date().toISOString().split('T')[0], emails: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchArchive = useCallback(async (query: string) => {
    if (!query.trim()) {
      setArchiveResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await proxyFetch(`${ESCALATION_API}/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setArchiveResults(data.results || []);
      } else {
        setArchiveResults([]);
      }
    } catch (err) {
      console.error('[EmailHub] Archive search error:', err);
      setArchiveResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ============ Event Handlers ============
  const handleAccountSwitch = useCallback((acc: AccountType) => {
    setAccount(acc);
    setSelectedEmailId(null);
    setSearchQuery('');
    if (acc === 'work') {
      setSelectedFolder('Inbox');
    } else if (acc === 'personal') {
      setSelectedFolder('Inbox');
    }
  }, []);

  const handleFolderSelect = useCallback((folder: string) => {
    setSelectedFolder(folder);
    setSelectedEmailId(null);
    setViewMode('folders');
  }, []);

  const handleEmailSelect = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
    reportAction(APP_ID, 'GET_EMAIL', { email_id: emailId });
  }, []);

  const handleBack = useCallback(() => {
    setSelectedEmailId(null);
  }, []);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleArchiveSearch = useCallback(
    (query: string) => {
      setArchiveQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        searchArchive(query);
      }, 500);
    },
    [searchArchive],
  );

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_TODAY_TRIAGE': {
          await fetchTriage();
          return JSON.stringify(triageData);
        }
        case 'SEARCH_EMAILS': {
          const query = action.params?.query;
          const source = action.params?.source;
          if (!query) return 'error: missing query param';
          if (source === 'archive') {
            await searchArchive(query);
            return JSON.stringify(archiveResults);
          }
          // Filter current triage
          const filtered = triageData?.emails.filter(
            (e) =>
              e.subject.toLowerCase().includes(query.toLowerCase()) ||
              e.from.name.toLowerCase().includes(query.toLowerCase()) ||
              e.from.address.toLowerCase().includes(query.toLowerCase()),
          );
          return JSON.stringify(filtered || []);
        }
        case 'GET_EMAIL': {
          const emailId = action.params?.email_id;
          if (!emailId) return 'error: missing email_id';
          const email = triageData?.emails.find((e) => e.id === emailId);
          return email ? JSON.stringify(email) : 'error: email not found';
        }
        case 'CREATE_ACTION_ITEM': {
          reportAction(APP_ID, 'CREATE_ACTION_ITEM', action.params);
          return 'success: action item creation triggered';
        }
        case 'DRAFT_REPLY': {
          reportAction(APP_ID, 'DRAFT_REPLY', action.params);
          return 'success: reply draft initiated';
        }
        case 'REFRESH_TRIAGE': {
          await fetchTriage();
          return 'success: triage refreshed';
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            account,
            viewMode,
            selectedFolder,
            selectedEmailId,
            emailCount: triageData?.emails.length || 0,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [
      fetchTriage,
      searchArchive,
      triageData,
      archiveResults,
      account,
      viewMode,
      selectedFolder,
      selectedEmailId,
    ],
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
          windowStyle: { width: 800, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: APP_NAME,
          windowStyle: { width: 800, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);
        await fetchTriage();
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[EmailHub] Init error:', err);
        setIsLoading(false);
        setError('Failed to initialize EmailHub');
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Computed Values ============
  const folders =
    account === 'work' ? WORK_FOLDERS : account === 'personal' ? PERSONAL_FOLDERS : [];

  const filteredEmails = useMemo(() => {
    if (!triageData?.emails) return [];
    let emails = triageData.emails;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      emails = emails.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.from.address.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q),
      );
    }

    // In folder view, filter by folder
    if (viewMode === 'folders' && account !== 'archive') {
      emails = emails.filter((e) => (e.folder || 'Inbox') === selectedFolder);
    }

    return emails;
  }, [triageData, searchQuery, viewMode, selectedFolder, account]);

  const triageGroups = useMemo(() => {
    if (!triageData?.emails) return new Map<PriorityTier, TriageEmail[]>();
    let emails = triageData.emails;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      emails = emails.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q),
      );
    }
    const groups = new Map<PriorityTier, TriageEmail[]>();
    const order: PriorityTier[] = ['action_required', 'meeting_info', 'info_only', 'skip'];
    for (const tier of order) {
      const tierEmails = emails.filter((e) => e.priority === tier);
      if (tierEmails.length > 0) {
        groups.set(tier, tierEmails);
      }
    }
    return groups;
  }, [triageData, searchQuery]);

  const selectedEmail = selectedEmailId
    ? triageData?.emails.find((e) => e.id === selectedEmailId) || null
    : null;

  const actionCount =
    triageData?.emails.filter((e) => e.priority === 'action_required').length || 0;

  // ============ Render ============
  if (selectedEmail) {
    return (
      <div className={styles.app}>
        <EmailDetailView email={selectedEmail} onBack={handleBack} />
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.searchArea}>
          <span className={styles.searchIcon}>{Icons.search}</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder={
              account === 'archive' ? 'Search 59K archived emails...' : 'Search emails...'
            }
            value={account === 'archive' ? archiveQuery : searchQuery}
            onChange={(e) =>
              account === 'archive'
                ? handleArchiveSearch(e.target.value)
                : setSearchQuery(e.target.value)
            }
          />
        </div>
        <div className={styles.topBarActions}>
          {account !== 'archive' && (
            <>
              <button
                className={`${styles.viewToggle} ${viewMode === 'folders' ? styles.active : ''}`}
                onClick={() => setViewMode('folders')}
                title="Folder view"
              >
                {Icons.folder}
              </button>
              <button
                className={`${styles.viewToggle} ${viewMode === 'triage' ? styles.active : ''}`}
                onClick={() => setViewMode('triage')}
                title="Triage view"
              >
                {Icons.triage}
              </button>
            </>
          )}
          <button className={styles.refreshBtn} onClick={fetchTriage} title="Refresh">
            {Icons.refresh}
          </button>
          <button className={styles.composeBtn} title="Compose">
            {Icons.compose}
          </button>
        </div>
      </div>

      <div className={styles.mainLayout}>
        {/* Left Sidebar */}
        <div className={styles.sidebar}>
          {/* Account Switcher */}
          <div className={styles.accountSwitcher}>
            <button
              className={`${styles.accountBtn} ${account === 'work' ? styles.active : ''}`}
              onClick={() => handleAccountSwitch('work')}
              title="Work (Exchange)"
            >
              {Icons.work}
              <span>Work</span>
              {actionCount > 0 && <span className={styles.accountBadge}>{actionCount}</span>}
            </button>
            <button
              className={`${styles.accountBtn} ${account === 'personal' ? styles.active : ''}`}
              onClick={() => handleAccountSwitch('personal')}
              title="Personal (Gmail)"
            >
              {Icons.personal}
              <span>Personal</span>
            </button>
            <button
              className={`${styles.accountBtn} ${account === 'archive' ? styles.active : ''}`}
              onClick={() => handleAccountSwitch('archive')}
              title="Archive (59K emails)"
            >
              {Icons.archive}
              <span>Archive</span>
            </button>
          </div>

          {/* Folder List */}
          {account !== 'archive' && (
            <div className={styles.folderList}>
              {folders.map((folder) => (
                <button
                  key={folder}
                  className={`${styles.folderItem} ${selectedFolder === folder && viewMode === 'folders' ? styles.active : ''}`}
                  onClick={() => handleFolderSelect(folder)}
                >
                  <span className={styles.folderIcon}>{Icons.folder}</span>
                  <span className={styles.folderName}>{folder}</span>
                </button>
              ))}
            </div>
          )}

          {account === 'archive' && (
            <div className={styles.archiveInfo}>
              <div className={styles.archiveStatLabel}>PST Archive</div>
              <div className={styles.archiveStat}>59,211 emails</div>
              <div className={styles.archiveStatLabel}>Search to explore</div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <p>Loading emails...</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={fetchTriage}>
                Retry
              </button>
            </div>
          ) : account === 'archive' ? (
            /* Archive View */
            <div className={styles.archiveView}>
              {isSearching ? (
                <div className={styles.emptyState}>
                  <div className={styles.spinner} />
                  <p>Searching archive...</p>
                </div>
              ) : archiveResults.length > 0 ? (
                <div className={styles.archiveResults}>
                  {archiveResults.map((result) => (
                    <div key={result.id} className={styles.archiveItem}>
                      <div className={styles.archiveItemTop}>
                        <span className={styles.archiveFrom}>{result.from}</span>
                        <span className={styles.archiveDate}>{result.date}</span>
                      </div>
                      <div className={styles.archiveSubject}>{result.subject}</div>
                      <div className={styles.archivePreview}>{result.preview}</div>
                      <div className={styles.archiveFolder}>{result.folder}</div>
                    </div>
                  ))}
                </div>
              ) : archiveQuery ? (
                <div className={styles.emptyState}>
                  <p>No results found for "{archiveQuery}"</p>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>{Icons.archive}</div>
                  <p>Search the email archive</p>
                  <p className={styles.emptySubtext}>59,211 historical emails from PST export</p>
                </div>
              )}
            </div>
          ) : viewMode === 'triage' ? (
            /* Triage View */
            triageGroups.size === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{Icons.empty}</div>
                <p>No emails in today's triage</p>
                <p className={styles.emptySubtext}>
                  Triage data will appear after the next email digest run
                </p>
              </div>
            ) : (
              <div className={styles.triageView}>
                {Array.from(triageGroups.entries()).map(([tier, emails]) => (
                  <div key={tier} className={styles.triageGroup}>
                    <div className={styles.triageGroupHeader}>
                      <span
                        className={`${styles.priorityBadge} ${styles[PRIORITY_CONFIG[tier].className]}`}
                      >
                        {PRIORITY_CONFIG[tier].label}
                      </span>
                      <span className={styles.triageCount}>{emails.length}</span>
                    </div>
                    {emails.map((email) => (
                      <EmailListItem
                        key={email.id}
                        email={email}
                        isSelected={selectedEmailId === email.id}
                        onSelect={handleEmailSelect}
                        showPriority={false}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : /* Folder View */
          filteredEmails.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{Icons.empty}</div>
              <p>No emails in {selectedFolder}</p>
            </div>
          ) : (
            <div className={styles.emailList}>
              {filteredEmails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  isSelected={selectedEmailId === email.id}
                  onSelect={handleEmailSelect}
                  showPriority={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailHubPage;
