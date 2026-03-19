import React, { useEffect, useState, useCallback, useRef } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  type CharacterAppAction,
} from '@/lib';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 25;

const MARKETS = [
  'All',
  'Belgium',
  'France',
  'Netherlands',
  'Germany',
  'UK',
  'Sweden',
  'Denmark',
] as const;
type Market = (typeof MARKETS)[number];

const COUNTRY_FLAGS: Record<string, string> = {
  Belgium: '\u{1F1E7}\u{1F1EA}',
  France: '\u{1F1EB}\u{1F1F7}',
  Netherlands: '\u{1F1F3}\u{1F1F1}',
  Germany: '\u{1F1E9}\u{1F1EA}',
  UK: '\u{1F1EC}\u{1F1E7}',
  Sweden: '\u{1F1F8}\u{1F1EA}',
  Denmark: '\u{1F1E9}\u{1F1F0}',
};

const COUNTRY_BORDER_COLORS: Record<string, string> = {
  Belgium: '#ffd700',
  France: '#3b82f6',
  Netherlands: '#f97316',
  Germany: '#525252',
  UK: '#ef4444',
  Sweden: '#2563eb',
  Denmark: '#dc2626',
};

type TabType = 'stores' | 'rag' | 'itsm';

// ============ Type Definitions ============
interface Store {
  store_number: string;
  store_name: string;
  city: string;
  country: string;
  address?: string;
  phone?: string;
  dm_name?: string;
  dm_email?: string;
  district?: string;
  district_manager?: string;
  region?: string;
  opening_hours?: string;
  market?: string;
}

interface RAGResult {
  title: string;
  snippet: string;
  source: string;
  relevance: number;
}

interface StoreStats {
  total: number;
  byMarket: Record<string, number>;
}

// ============ Proxy Fetch Helper ============
async function localProxyFetch(targetUrl: string, options?: RequestInit): Promise<Response> {
  return fetch('/api/local-proxy', {
    method: options?.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Target-URL': targetUrl,
      ...(options?.headers as Record<string, string>),
    },
    body: options?.body,
  });
}

async function queryStores(query: string, market?: string): Promise<Store[]> {
  try {
    const payload = {
      data: [market && market !== 'All' ? `${query} ${market}` : query],
      fn_index: 0,
    };
    const resp = await localProxyFetch('http://localhost:7860/api/predict', {
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    // Gradio returns data array; parse the response
    const rawData = json?.data?.[0];
    if (typeof rawData === 'string') {
      // Try parsing as JSON array
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // If it's HTML table or text, parse into store objects
        return parseStoreResponse(rawData, query);
      }
    }
    if (Array.isArray(rawData)) return rawData;
    return [];
  } catch (err) {
    console.error('[StoreIntelligence] queryStores failed:', err);
    return [];
  }
}

function parseStoreResponse(text: string, _query: string): Store[] {
  // Attempt to extract store data from text/HTML response
  const stores: Store[] = [];
  // Simple line-based parsing for common formats
  const lines = text.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/(\d{4,5})\s*[-|]\s*(.+?)[-|]\s*(.+?)[-|]\s*(.+)/);
    if (match) {
      stores.push({
        store_number: match[1],
        store_name: match[2].trim(),
        city: match[3].trim(),
        country: match[4].trim(),
      });
    }
  }
  return stores;
}

async function queryRAG(query: string): Promise<RAGResult[]> {
  try {
    const payload = {
      data: [query],
      fn_index: 2, // RAG tab is typically index 2
    };
    const resp = await localProxyFetch('http://localhost:7860/api/predict', {
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const rawData = json?.data?.[0];
    if (typeof rawData === 'string') {
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Parse text results
        return parseRAGResponse(rawData);
      }
    }
    if (Array.isArray(rawData)) return rawData;
    return [];
  } catch (err) {
    console.error('[StoreIntelligence] queryRAG failed:', err);
    return [];
  }
}

function parseRAGResponse(text: string): RAGResult[] {
  const results: RAGResult[] = [];
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (block.trim()) {
      const lines = block.split('\n');
      results.push({
        title: lines[0]?.replace(/^#+\s*/, '').trim() || 'Untitled',
        snippet: lines.slice(1).join(' ').trim().slice(0, 200) || block.trim().slice(0, 200),
        source: 'IT Command Center',
        relevance: 0.8,
      });
    }
  }
  return results;
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
  store: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  ),
};

// ============ Sub-component: Store Card ============
interface StoreCardProps {
  store: Store;
  onSelect: (store: Store) => void;
}

const StoreCard: React.FC<StoreCardProps> = React.memo(({ store, onSelect }) => {
  const borderColor = COUNTRY_BORDER_COLORS[store.country] || '#6b7280';
  const flag = COUNTRY_FLAGS[store.country] || '';

  return (
    <div
      className={styles.storeCard}
      style={{ borderLeftColor: borderColor }}
      onClick={() => onSelect(store)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(store)}
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardFlag}>{flag}</span>
        <span className={styles.cardName}>{store.store_name}</span>
        <span className={styles.cardNumber}>#{store.store_number}</span>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardCity}>{store.city}</span>
        {store.district && <span className={styles.cardDistrict}>{store.district}</span>}
      </div>
      {store.dm_name && <div className={styles.cardDM}>DM: {store.dm_name}</div>}
      <div className={styles.cardArrow}>{Icons.chevronRight}</div>
    </div>
  );
});

// ============ Sub-component: Store Detail Panel ============
interface StoreDetailProps {
  store: Store;
  onClose: () => void;
}

const StoreDetail: React.FC<StoreDetailProps> = ({ store, onClose }) => {
  const borderColor = COUNTRY_BORDER_COLORS[store.country] || '#6b7280';
  const flag = COUNTRY_FLAGS[store.country] || '';

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div
        className={styles.detailPanel}
        style={{ borderTopColor: borderColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.detailHeader}>
          <div className={styles.detailTitle}>
            <span className={styles.detailFlag}>{flag}</span>
            <h2>{store.store_name}</h2>
            <span className={styles.detailNumber}>#{store.store_number}</span>
          </div>
          <button className={styles.detailClose} onClick={onClose}>
            {Icons.close}
          </button>
        </div>

        <div className={styles.detailGrid}>
          <DetailRow label="City" value={store.city} />
          <DetailRow label="Country" value={store.country} />
          {store.address && <DetailRow label="Address" value={store.address} />}
          {store.phone && <DetailRow label="Phone" value={store.phone} />}
          {store.district && <DetailRow label="District" value={store.district} />}
          {store.district_manager && (
            <DetailRow label="District Manager" value={store.district_manager} />
          )}
          {store.dm_name && <DetailRow label="DM Name" value={store.dm_name} />}
          {store.dm_email && <DetailRow label="DM Email" value={store.dm_email} />}
          {store.region && <DetailRow label="Region" value={store.region} />}
          {store.market && <DetailRow label="Market" value={store.market} />}
          {store.opening_hours && <DetailRow label="Opening Hours" value={store.opening_hours} />}
        </div>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.detailRow}>
    <span className={styles.detailLabel}>{label}</span>
    <span className={styles.detailValue}>{value}</span>
  </div>
);

// ============ Sub-component: RAG Search ============
interface RAGTabProps {
  results: RAGResult[];
  isSearching: boolean;
  onSearch: (query: string) => void;
}

const RAGTab: React.FC<RAGTabProps> = ({ results, isSearching, onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <div className={styles.ragTab}>
      <div className={styles.ragDescription}>
        Search across 17,790 documents including emails, SOD reports, and knowledge base entries.
      </div>
      <form className={styles.ragSearchForm} onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents (e.g., 'fire alarm procedure Belgium')"
          className={styles.ragInput}
        />
        <button type="submit" className={styles.ragSearchBtn} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>
      <div className={styles.ragResults}>
        {isSearching && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Searching documents...</span>
          </div>
        )}
        {!isSearching && results.length === 0 && (
          <div className={styles.emptyState}>
            {Icons.document}
            <span>Enter a query to search the document index</span>
          </div>
        )}
        {results.map((result, idx) => (
          <div key={idx} className={styles.ragResultItem}>
            <div className={styles.ragResultHeader}>
              <span className={styles.ragResultTitle}>{result.title}</span>
              <span className={styles.ragResultScore}>{Math.round(result.relevance * 100)}%</span>
            </div>
            <div className={styles.ragResultSnippet}>{result.snippet}</div>
            <div className={styles.ragResultSource}>{result.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ Sub-component: ITSM Tab ============
const ITSMTab: React.FC = () => (
  <div className={styles.itsmTab}>
    <div className={styles.itsmPlaceholder}>
      {Icons.settings}
      <h3>ServiceDesk Plus Configuration</h3>
      <p>
        ITSM configuration viewer will display SDP Cloud crawl data (220 files, 204 screenshots)
        from the recent configuration audit.
      </p>
      <div className={styles.itsmStats}>
        <div className={styles.itsmStat}>
          <span className={styles.itsmStatValue}>220</span>
          <span className={styles.itsmStatLabel}>Config Files</span>
        </div>
        <div className={styles.itsmStat}>
          <span className={styles.itsmStatValue}>204</span>
          <span className={styles.itsmStatLabel}>Screenshots</span>
        </div>
        <div className={styles.itsmStat}>
          <span className={styles.itsmStatValue}>SHU-230701</span>
          <span className={styles.itsmStatLabel}>Contract Ref</span>
        </div>
      </div>
      <p className={styles.itsmNote}>
        Connect to ~/shared/itsm-crawl/ for full configuration data.
      </p>
    </div>
  </div>
);

// ============ Main Component ============
const StoreIntelligencePage: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMarket, setActiveMarket] = useState<Market>('All');
  const [activeTab, setActiveTab] = useState<TabType>('stores');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setIsInitialized] = useState(false);
  const [ragResults, setRagResults] = useState<RAGResult[]>([]);
  const [isRAGSearching, setIsRAGSearching] = useState(false);
  const [stats, setStats] = useState<StoreStats>({ total: 338, byMarket: {} });
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ============ Data Fetching ============
  const fetchStores = useCallback(async (query: string, market: Market) => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await queryStores(query || '*', market !== 'All' ? market : undefined);
      setStores(results);

      // Update stats from results
      if (results.length > 0) {
        const byMarket: Record<string, number> = {};
        for (const store of results) {
          const country = store.country || 'Unknown';
          byMarket[country] = (byMarket[country] || 0) + 1;
        }
        setStats({ total: results.length, byMarket });
      }
    } catch (err) {
      console.error('[StoreIntelligence] fetchStores error:', err);
      setError('Failed to fetch store data. Is the IT Command Center running on localhost:7860?');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      fetchStores(searchQuery, activeMarket);
      reportAction(APP_ID, 'SEARCH_STORES', { query: searchQuery, market: activeMarket });
    },
    [searchQuery, activeMarket, fetchStores],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (value.length >= 3) {
        searchTimeoutRef.current = setTimeout(() => {
          fetchStores(value, activeMarket);
        }, 500);
      }
    },
    [activeMarket, fetchStores],
  );

  const handleMarketChange = useCallback(
    (market: Market) => {
      setActiveMarket(market);
      if (searchQuery || stores.length > 0) {
        fetchStores(searchQuery || '*', market);
      }
    },
    [searchQuery, stores.length, fetchStores],
  );

  const handleStoreSelect = useCallback((store: Store) => {
    setSelectedStore(store);
    reportAction(APP_ID, 'GET_STORE_DETAILS', { store_number: store.store_number });
  }, []);

  const handleRAGSearch = useCallback(async (query: string) => {
    setIsRAGSearching(true);
    const results = await queryRAG(query);
    setRagResults(results);
    setIsRAGSearching(false);
    reportAction(APP_ID, 'RAG_QUERY', { query });
  }, []);

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'SEARCH_STORES': {
          const query = action.params?.query || '';
          const market = (action.params?.market as Market) || 'All';
          setSearchQuery(query);
          setActiveMarket(market);
          setActiveTab('stores');
          await fetchStores(query, market);
          return 'success';
        }
        case 'GET_STORE_DETAILS': {
          const storeNumber = action.params?.store_number;
          if (!storeNumber) return 'error: missing store_number';
          const store = stores.find((s) => s.store_number === storeNumber);
          if (store) {
            setSelectedStore(store);
            return JSON.stringify(store);
          }
          // Try fetching
          const results = await queryStores(storeNumber);
          if (results.length > 0) {
            setSelectedStore(results[0]);
            return JSON.stringify(results[0]);
          }
          return 'error: store not found';
        }
        case 'RAG_QUERY': {
          const query = action.params?.query;
          if (!query) return 'error: missing query';
          setActiveTab('rag');
          await handleRAGSearch(query);
          return 'success';
        }
        case 'UPDATE_STORE_DATA': {
          return 'placeholder: XLSX upload flow not yet implemented';
        }
        case 'GET_DM_FOR_STORE': {
          const sn = action.params?.store_number;
          if (!sn) return 'error: missing store_number';
          const s = stores.find((st) => st.store_number === sn);
          if (s?.dm_name) return JSON.stringify({ dm_name: s.dm_name, dm_email: s.dm_email });
          return 'error: DM info not available';
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            storeCount: stores.length,
            activeMarket,
            activeTab,
            searchQuery,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [stores, activeMarket, activeTab, searchQuery, fetchStores, handleRAGSearch],
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
          name: 'StoreIntelligence',
          windowStyle: { width: 800, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'StoreIntelligence',
          windowStyle: { width: 800, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Load initial store data
        try {
          await fetchStores('*', 'All');
        } catch (err) {
          console.warn('[StoreIntelligence] Initial fetch failed:', err);
        }

        setIsInitialized(true);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[StoreIntelligence] Init error:', error);
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

  // ============ Filtered Stores ============
  const filteredStores =
    activeMarket === 'All' ? stores : stores.filter((s) => s.country === activeMarket);

  // ============ Render ============
  return (
    <div className={styles.app}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.appIcon}>{Icons.store}</span>
          <h1 className={styles.appTitle}>Store Intelligence</h1>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'stores' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('stores')}
          >
            Stores
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'rag' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('rag')}
          >
            RAG Search
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'itsm' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('itsm')}
          >
            ITSM
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'stores' && (
        <>
          {/* Search & Filter Bar */}
          <div className={styles.searchBar}>
            <form className={styles.searchForm} onSubmit={handleSearch}>
              <span className={styles.searchIcon}>{Icons.search}</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="Search stores by name, city, number, or DM..."
                className={styles.searchInput}
              />
            </form>
            <select
              className={styles.marketFilter}
              value={activeMarket}
              onChange={(e) => handleMarketChange(e.target.value as Market)}
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m === 'All' ? 'All Markets' : `${COUNTRY_FLAGS[m] || ''} ${m}`}
                </option>
              ))}
            </select>
            <button
              className={styles.uploadBtn}
              onClick={() => reportAction(APP_ID, 'UPDATE_STORE_DATA', {})}
              title="Update Store Data"
            >
              {Icons.upload}
            </button>
          </div>

          {/* Error State */}
          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Store Grid */}
          <div className={styles.storeGrid}>
            {isLoading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <span>Loading stores...</span>
              </div>
            )}
            {!isLoading && filteredStores.length === 0 && !error && (
              <div className={styles.emptyState}>
                {Icons.store}
                <span>No stores found. Try a different search or market filter.</span>
              </div>
            )}
            {!isLoading &&
              filteredStores.map((store) => (
                <StoreCard key={store.store_number} store={store} onSelect={handleStoreSelect} />
              ))}
          </div>

          {/* Stats Bar */}
          <div className={styles.statsBar}>
            <span className={styles.statItem}>
              Total: <strong>{stats.total}</strong> stores
            </span>
            {Object.entries(stats.byMarket).map(([market, count]) => (
              <span key={market} className={styles.statItem}>
                {COUNTRY_FLAGS[market] || ''} {market}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </>
      )}

      {activeTab === 'rag' && (
        <RAGTab results={ragResults} isSearching={isRAGSearching} onSearch={handleRAGSearch} />
      )}

      {activeTab === 'itsm' && <ITSMTab />}

      {/* Store Detail Panel */}
      {selectedStore && (
        <StoreDetail store={selectedStore} onClose={() => setSelectedStore(null)} />
      )}
    </div>
  );
};

export default StoreIntelligencePage;
