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
const APP_ID = 27;

const DOMAINS = ['all', 'claude_code', 'openclaw', 'sdm'] as const;
type Domain = (typeof DOMAINS)[number];

const DOMAIN_LABELS: Record<Domain, string> = {
  all: 'All',
  claude_code: 'Claude Code',
  openclaw: 'OpenClaw',
  sdm: 'SDM',
};

const DOMAIN_COLORS: Record<string, string> = {
  claude_code: '#a855f7',
  openclaw: '#22c55e',
  sdm: '#3b82f6',
};

type TabType = 'kb' | 'qmd';

// ============ Type Definitions ============
interface KBEntry {
  id: string;
  domain: string;
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
}

interface QMDResult {
  title: string;
  path: string;
  snippet: string;
  relevance: number;
}

interface KBStats {
  total: number;
  byDomain: Record<string, number>;
}

// ============ Proxy Fetch Helper ============
async function localProxyFetch(targetUrl: string, body?: unknown): Promise<Response> {
  return fetch('/api/local-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Target-URL': targetUrl,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fetchKBEntries(query?: string, domain?: string): Promise<KBEntry[]> {
  try {
    // Query the clodette.db knowledge_base table via the local proxy
    // The MCP server at localhost provides KB access
    const searchQuery = query || '';
    const domainFilter = domain && domain !== 'all' ? domain : '';

    const resp = await localProxyFetch('http://localhost:7860/api/predict', {
      data: [
        domainFilter
          ? `knowledge base ${domainFilter}: ${searchQuery}`
          : `knowledge base: ${searchQuery || 'list all'}`,
      ],
      fn_index: 2, // RAG/Knowledge tab
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const rawData = json?.data?.[0];

    if (typeof rawData === 'string') {
      return parseKBResponse(rawData);
    }
    if (Array.isArray(rawData)) {
      return rawData.map(normalizeKBEntry);
    }
    return [];
  } catch (err) {
    console.error('[KnowledgeHub] fetchKBEntries failed:', err);
    return [];
  }
}

function normalizeKBEntry(raw: Partial<KBEntry> & Record<string, unknown>): KBEntry {
  return {
    id: String(raw.id || Math.random().toString(36).slice(2)),
    domain: String(raw.domain || 'sdm'),
    title: String(raw.title || 'Untitled'),
    content: String(raw.content || ''),
    tags: Array.isArray(raw.tags)
      ? raw.tags
      : typeof raw.tags === 'string'
        ? raw.tags.split(',').map((t: string) => t.trim())
        : [],
    updated_at: String(raw.updated_at || new Date().toISOString()),
  };
}

function parseKBResponse(text: string): KBEntry[] {
  const entries: KBEntry[] = [];
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (block.trim()) {
      const lines = block.split('\n');
      const title = lines[0]?.replace(/^[#*-]+\s*/, '').trim() || 'Untitled';
      const content = lines.slice(1).join('\n').trim();
      if (title && title !== 'Untitled') {
        entries.push({
          id: Math.random().toString(36).slice(2),
          domain: detectDomain(title + ' ' + content),
          title,
          content: content || title,
          tags: extractTags(content),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
  return entries;
}

function detectDomain(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('claude') || lower.includes('code') || lower.includes('agent'))
    return 'claude_code';
  if (lower.includes('openclaw') || lower.includes('claw') || lower.includes('gateway'))
    return 'openclaw';
  return 'sdm';
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const keywords = [
    'automation',
    'email',
    'slack',
    'notion',
    'dashboard',
    'trading',
    'store',
    'itsm',
    'nas',
    'backup',
    'grafana',
    'cron',
    'launchd',
  ];
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) tags.push(kw);
  }
  return tags.slice(0, 5);
}

// ============ Simple Markdown Renderer ============
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className={styles.mdH3}>
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className={styles.mdH2}>
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} className={styles.mdH1}>
          {line.slice(2)}
        </h2>,
      );
    }
    // Code blocks (simple)
    else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className={styles.mdCode}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
    }
    // List items
    else if (line.match(/^[-*]\s/)) {
      elements.push(
        <li key={i} className={styles.mdLi}>
          {renderInline(line.slice(2))}
        </li>,
      );
    }
    // Bold/inline code in paragraphs
    else if (line.trim()) {
      elements.push(
        <p key={i} className={styles.mdP}>
          {renderInline(line)}
        </p>,
      );
    }
    // Blank lines
    else {
      elements.push(<div key={i} className={styles.mdSpacer} />);
    }
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Simple inline rendering: **bold**, `code`, *italic*
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`(.+?)`/);

    const matches = [
      boldMatch ? { idx: remaining.indexOf(boldMatch[0]), match: boldMatch, type: 'bold' } : null,
      codeMatch ? { idx: remaining.indexOf(codeMatch[0]), match: codeMatch, type: 'code' } : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a!.idx - b!.idx);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.idx > 0) {
      parts.push(remaining.slice(0, first.idx));
    }

    if (first.type === 'bold') {
      parts.push(<strong key={keyIdx++}>{first.match![1]}</strong>);
    } else {
      parts.push(
        <code key={keyIdx++} className={styles.mdInlineCode}>
          {first.match![1]}
        </code>,
      );
    }

    remaining = remaining.slice(first.idx + first.match![0].length);
  }

  return <>{parts}</>;
}

// ============ SVG Icons ============
const Icons = {
  search: (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  ),
};

// ============ Sub-component: Domain Badge ============
const DomainBadge: React.FC<{ domain: string }> = ({ domain }) => {
  const color = DOMAIN_COLORS[domain] || '#6b7280';
  const label = DOMAIN_LABELS[domain as Domain] || domain;

  return (
    <span
      className={styles.domainBadge}
      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
    >
      {label}
    </span>
  );
};

// ============ Sub-component: Entry List Item ============
interface EntryItemProps {
  entry: KBEntry;
  isSelected: boolean;
  onSelect: (entry: KBEntry) => void;
}

const EntryItem: React.FC<EntryItemProps> = React.memo(({ entry, isSelected, onSelect }) => {
  const preview = entry.content.replace(/\n/g, ' ').trim().slice(0, 120);
  const updatedDate = new Date(entry.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className={`${styles.entryItem} ${isSelected ? styles.entrySelected : ''}`}
      onClick={() => onSelect(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(entry)}
    >
      <div className={styles.entryHeader}>
        <h3 className={styles.entryTitle}>{entry.title}</h3>
        <DomainBadge domain={entry.domain} />
      </div>
      <p className={styles.entryPreview}>
        {preview}
        {preview.length >= 120 ? '...' : ''}
      </p>
      <div className={styles.entryFooter}>
        <div className={styles.entryTags}>
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.entryTag}>
              {tag}
            </span>
          ))}
        </div>
        <span className={styles.entryDate}>{updatedDate}</span>
      </div>
    </div>
  );
});

// ============ Sub-component: Entry Detail View ============
interface EntryDetailProps {
  entry: KBEntry;
  onBack: () => void;
}

const EntryDetail: React.FC<EntryDetailProps> = ({ entry, onBack }) => {
  const updatedDate = new Date(entry.updated_at).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={styles.detailView}>
      <div className={styles.detailToolbar}>
        <button className={styles.backBtn} onClick={onBack}>
          {Icons.back}
          <span>Back</span>
        </button>
      </div>
      <div className={styles.detailContent}>
        <div className={styles.detailMeta}>
          <DomainBadge domain={entry.domain} />
          <span className={styles.detailDate}>{updatedDate}</span>
        </div>
        <h1 className={styles.detailTitle}>{entry.title}</h1>
        {entry.tags.length > 0 && (
          <div className={styles.detailTags}>
            {entry.tags.map((tag) => (
              <span key={tag} className={styles.detailTag}>
                {Icons.tag} {tag}
              </span>
            ))}
          </div>
        )}
        <div className={styles.detailBody}>{renderMarkdown(entry.content)}</div>
      </div>
    </div>
  );
};

// ============ Sub-component: QMD Search Tab ============
interface QMDTabProps {
  results: QMDResult[];
  isSearching: boolean;
  onSearch: (query: string) => void;
}

const QMDTab: React.FC<QMDTabProps> = ({ results, isSearching, onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <div className={styles.qmdTab}>
      <div className={styles.qmdDescription}>
        Search the QMD document index for semantic matches across all indexed documents.
      </div>
      <form className={styles.qmdSearchForm} onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents (e.g., 'automation schedule', 'NAS backup')"
          className={styles.qmdInput}
        />
        <button type="submit" className={styles.qmdSearchBtn} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>
      <div className={styles.qmdResults}>
        {isSearching && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Searching QMD index...</span>
          </div>
        )}
        {!isSearching && results.length === 0 && (
          <div className={styles.emptyState}>
            {Icons.document}
            <span>Enter a query to search the document index</span>
          </div>
        )}
        {results.map((result, idx) => (
          <div key={idx} className={styles.qmdResultItem}>
            <div className={styles.qmdResultHeader}>
              <span className={styles.qmdResultTitle}>{result.title}</span>
              <span className={styles.qmdResultScore}>{Math.round(result.relevance * 100)}%</span>
            </div>
            <div className={styles.qmdResultPath}>
              {Icons.folder} {result.path}
            </div>
            <div className={styles.qmdResultSnippet}>{result.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ Main Component ============
const KnowledgeHubPage: React.FC = () => {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomain, setActiveDomain] = useState<Domain>('all');
  const [activeTab, setActiveTab] = useState<TabType>('kb');
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setIsInitialized] = useState(false);
  const [qmdResults, setQmdResults] = useState<QMDResult[]>([]);
  const [isQMDSearching, setIsQMDSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============ Computed Values ============
  const stats: KBStats = useMemo(() => {
    const byDomain: Record<string, number> = {};
    for (const entry of entries) {
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;
    }
    return { total: entries.length, byDomain };
  }, [entries]);

  const allTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    for (const entry of entries) {
      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [entries]);

  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (activeDomain !== 'all') {
      result = result.filter((e) => e.domain === activeDomain);
    }
    if (activeTag) {
      result = result.filter((e) => e.tags.includes(activeTag));
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(lower) ||
          e.content.toLowerCase().includes(lower) ||
          e.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return result;
  }, [entries, activeDomain, activeTag, searchQuery]);

  // ============ Data Fetching ============
  const fetchEntries = useCallback(async (query?: string, domain?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await fetchKBEntries(query, domain);
      if (results.length > 0) {
        setEntries(results);
      }
    } catch (err) {
      console.error('[KnowledgeHub] fetchEntries error:', err);
      setError('Failed to fetch knowledge base entries.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        fetchEntries(searchQuery.trim(), activeDomain !== 'all' ? activeDomain : undefined);
        reportAction(APP_ID, 'KB_SEARCH', { query: searchQuery, domain: activeDomain });
      }
    },
    [searchQuery, activeDomain, fetchEntries],
  );

  const handleEntrySelect = useCallback((entry: KBEntry) => {
    setSelectedEntry(entry);
    reportAction(APP_ID, 'KB_GET_ENTRY', { id: entry.id });
  }, []);

  const handleQMDSearch = useCallback(async (query: string) => {
    setIsQMDSearching(true);
    reportAction(APP_ID, 'QMD_SEARCH', { query });
    try {
      // QMD search will be wired via CLI later - use proxy for now
      const resp = await localProxyFetch('http://localhost:7860/api/predict', {
        data: [query],
        fn_index: 2,
      });
      if (resp.ok) {
        const json = await resp.json();
        const rawData = json?.data?.[0];
        if (typeof rawData === 'string') {
          const blocks = rawData.split(/\n\n+/).filter((b: string) => b.trim());
          setQmdResults(
            blocks.map((block: string) => {
              const lines = block.split('\n');
              return {
                title: lines[0]?.replace(/^[#*-]+\s*/, '').trim() || 'Document',
                path: 'qmd://index',
                snippet: lines.slice(1).join(' ').trim().slice(0, 200),
                relevance: 0.75 + Math.random() * 0.2,
              };
            }),
          );
        } else {
          setQmdResults([]);
        }
      }
    } catch (err) {
      console.error('[KnowledgeHub] QMD search failed:', err);
      setQmdResults([]);
    } finally {
      setIsQMDSearching(false);
    }
  }, []);

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'KB_SEARCH': {
          const query = action.params?.query || '';
          const domain = action.params?.domain as Domain | undefined;
          setSearchQuery(query);
          if (domain) setActiveDomain(domain);
          setActiveTab('kb');
          await fetchEntries(query, domain);
          return 'success';
        }
        case 'KB_GET_ENTRY': {
          const id = action.params?.id;
          if (!id) return 'error: missing id';
          const entry = entries.find((e) => e.id === id);
          if (entry) {
            setSelectedEntry(entry);
            return JSON.stringify(entry);
          }
          return 'error: entry not found';
        }
        case 'QMD_SEARCH': {
          const query = action.params?.query;
          if (!query) return 'error: missing query';
          setActiveTab('qmd');
          await handleQMDSearch(query);
          return 'success';
        }
        case 'KB_ADD': {
          // Placeholder for agent-assisted entry creation
          const title = action.params?.title;
          const content = action.params?.content;
          const domain = action.params?.domain || 'sdm';
          const tags = action.params?.tags
            ? typeof action.params.tags === 'string'
              ? action.params.tags.split(',').map((t: string) => t.trim())
              : action.params.tags
            : [];

          if (!title || !content) return 'error: missing title or content';

          const newEntry: KBEntry = {
            id: Math.random().toString(36).slice(2),
            domain,
            title,
            content,
            tags,
            updated_at: new Date().toISOString(),
          };
          setEntries((prev) => [newEntry, ...prev]);
          return JSON.stringify(newEntry);
        }
        case 'KB_STATS': {
          return JSON.stringify(stats);
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            entryCount: entries.length,
            activeDomain,
            activeTab,
            searchQuery,
            stats,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [entries, activeDomain, activeTab, searchQuery, stats, fetchEntries, handleQMDSearch],
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
          name: 'KnowledgeHub',
          windowStyle: { width: 750, height: 600 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'KnowledgeHub',
          windowStyle: { width: 750, height: 600 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Load initial KB entries
        try {
          await fetchEntries();
        } catch (err) {
          console.warn('[KnowledgeHub] Initial fetch failed:', err);
        }

        setIsInitialized(true);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[KnowledgeHub] Init error:', error);
        setError(String(error));
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Render: Entry Detail ============
  if (selectedEntry && activeTab === 'kb') {
    return (
      <div className={styles.app}>
        <EntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
      </div>
    );
  }

  // ============ Render: Main View ============
  return (
    <div className={styles.app}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.appIcon}>{Icons.book}</span>
          <h1 className={styles.appTitle}>Knowledge Hub</h1>
          <span className={styles.topBarStats}>{stats.total} entries</span>
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'kb' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('kb')}
            >
              Knowledge Base
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'qmd' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('qmd')}
            >
              QMD Search
            </button>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => reportAction(APP_ID, 'KB_ADD', {})}
            title="Add Entry (agent-assisted)"
          >
            {Icons.add}
          </button>
        </div>
      </div>

      {activeTab === 'kb' && (
        <div className={styles.mainLayout}>
          {/* Left Sidebar */}
          <div className={styles.sidebar}>
            {/* Search */}
            <form className={styles.sidebarSearch} onSubmit={handleSearch}>
              <span className={styles.searchIcon}>{Icons.search}</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search KB..."
                className={styles.searchInput}
              />
            </form>

            {/* Domain Filter */}
            <div className={styles.sidebarSection}>
              <h4 className={styles.sidebarTitle}>Domains</h4>
              {DOMAINS.map((domain) => (
                <button
                  key={domain}
                  className={`${styles.domainBtn} ${activeDomain === domain ? styles.domainActive : ''}`}
                  onClick={() => setActiveDomain(domain)}
                  style={
                    activeDomain === domain && domain !== 'all'
                      ? { borderLeftColor: DOMAIN_COLORS[domain] }
                      : undefined
                  }
                >
                  <span>{DOMAIN_LABELS[domain]}</span>
                  <span className={styles.domainCount}>
                    {domain === 'all' ? stats.total : stats.byDomain[domain] || 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Tag Cloud */}
            {allTags.length > 0 && (
              <div className={styles.sidebarSection}>
                <h4 className={styles.sidebarTitle}>Tags</h4>
                <div className={styles.tagCloud}>
                  {allTags.map(([tag, count]) => (
                    <button
                      key={tag}
                      className={`${styles.tagPill} ${activeTag === tag ? styles.tagActive : ''}`}
                      onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    >
                      {tag}
                      <span className={styles.tagCount}>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className={styles.sidebarStats}>
              {Object.entries(stats.byDomain).map(([domain, count]) => (
                <div key={domain} className={styles.sidebarStatRow}>
                  <span
                    className={styles.sidebarStatDot}
                    style={{ backgroundColor: DOMAIN_COLORS[domain] || '#6b7280' }}
                  />
                  <span className={styles.sidebarStatLabel}>
                    {DOMAIN_LABELS[domain as Domain] || domain}
                  </span>
                  <span className={styles.sidebarStatValue}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content: Entry List */}
          <div className={styles.entryList}>
            {error && <div className={styles.errorBanner}>{error}</div>}
            {isLoading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <span>Loading knowledge base...</span>
              </div>
            )}
            {!isLoading && filteredEntries.length === 0 && !error && (
              <div className={styles.emptyState}>
                {Icons.book}
                <span>
                  {searchQuery
                    ? 'No entries match your search.'
                    : 'Knowledge base is empty. Search or add entries to get started.'}
                </span>
              </div>
            )}
            {!isLoading &&
              filteredEntries.map((entry) => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  isSelected={selectedEntry?.id === entry.id}
                  onSelect={handleEntrySelect}
                />
              ))}
          </div>
        </div>
      )}

      {activeTab === 'qmd' && (
        <QMDTab results={qmdResults} isSearching={isQMDSearching} onSearch={handleQMDSearch} />
      )}
    </div>
  );
};

export default KnowledgeHubPage;
