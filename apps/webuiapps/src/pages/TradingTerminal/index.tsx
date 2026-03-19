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
const APP_ID = 22;
const REFRESH_INTERVAL = 60_000;

const PROXY_BASE = '/api/local-proxy';

const ENDPOINTS = {
  rfcrypto: {
    status: 'http://localhost:8083/api/v1/status',
    profit: 'http://localhost:8083/api/v1/profit',
    balance: 'http://localhost:8083/api/v1/balance',
  },
  nfi: {
    status: 'http://localhost:8080/api/v1/status',
    profit: 'http://localhost:8080/api/v1/profit',
    balance: 'http://localhost:8080/api/v1/balance',
  },
  congress: {
    trades: 'http://localhost:8085/api/trades',
  },
} as const;

// ============ Type Definitions ============
type TabId = 'overview' | 'rfcrypto' | 'nfi' | 'congress';

interface OpenTrade {
  trade_id: number;
  pair: string;
  profit_pct: number;
  profit_abs: number;
  stake_amount: number;
  open_rate: number;
  current_rate: number;
  open_date: string;
  open_date_hum: string;
  close_profit_pct?: number;
  is_open: boolean;
}

interface BotProfit {
  profit_all_coin: number;
  profit_all_percent: number;
  profit_all_fiat: number;
  profit_closed_coin: number;
  profit_closed_percent: number;
  trade_count: number;
  closed_trade_count: number;
  winning_trades: number;
  losing_trades: number;
  avg_duration: string;
  best_pair: string;
  best_rate: number;
  first_trade_date: string;
  latest_trade_date: string;
}

interface BotBalance {
  currency: string;
  free: number;
  balance: number;
  used: number;
  est_stake: number;
  stake: string;
  total: number;
  value: number;
}

interface CongressTrade {
  politician: string;
  ticker: string;
  action: string;
  amount: string;
  date: string;
  description?: string;
}

interface BotData {
  trades: OpenTrade[];
  profit: BotProfit | null;
  balance: BotBalance[] | null;
  error: string | null;
  loading: boolean;
}

interface KasSignal {
  level: string;
  score: string;
  recommendation: string;
}

// ============ Fetch Helper ============
async function proxyFetch<T>(targetUrl: string): Promise<T> {
  const resp = await fetch(PROXY_BASE, {
    headers: { 'X-Target-URL': targetUrl },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.json();
}

// ============ Utility Functions ============
const formatPct = (pct: number): string => {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

const formatCurrency = (val: number, decimals = 2): string => {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatDuration = (openDate: string): string => {
  const start = new Date(openDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
};

const pctClass = (pct: number): string => (pct >= 0 ? styles.profit : styles.loss);

// ============ Sub-components ============

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rfcrypto', label: 'RFCrypto' },
  { id: 'nfi', label: 'NFI' },
  { id: 'congress', label: 'Congress' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => (
  <div className={styles.tabBar}>
    {TABS.map((tab) => (
      <button
        key={tab.id}
        className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
        onClick={() => onTabChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

// --- Bot Summary Card ---
interface BotSummaryCardProps {
  name: string;
  data: BotData;
}

const BotSummaryCard: React.FC<BotSummaryCardProps> = ({ name, data }) => {
  if (data.loading) {
    return (
      <div className={styles.summaryCard}>
        <div className={styles.cardHeader}>{name}</div>
        <div className={styles.cardLoading}>Loading...</div>
      </div>
    );
  }
  if (data.error) {
    return (
      <div className={styles.summaryCard}>
        <div className={styles.cardHeader}>{name}</div>
        <div className={styles.cardError}>{data.error}</div>
      </div>
    );
  }

  const profit = data.profit;
  const totalProfit = profit?.profit_all_percent ?? 0;
  const closedTrades = profit?.closed_trade_count ?? 0;
  const winningTrades = profit?.winning_trades ?? 0;
  const winRate = closedTrades > 0 ? ((winningTrades / closedTrades) * 100).toFixed(1) : '--';
  const openCount = data.trades.filter((t) => t.is_open !== false).length;
  const totalBalance = data.balance
    ? data.balance.reduce((sum, b) => sum + (b.est_stake || 0), 0)
    : 0;

  return (
    <div className={styles.summaryCard}>
      <div className={styles.cardHeader}>{name}</div>
      <div className={styles.cardStats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total P&L</span>
          <span className={`${styles.statValue} ${pctClass(totalProfit)}`}>
            {formatPct(totalProfit)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Win Rate</span>
          <span className={styles.statValue}>{winRate}%</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Open Trades</span>
          <span className={styles.statValue}>{openCount}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Balance</span>
          <span className={styles.statValue}>{formatCurrency(totalBalance)} USDT</span>
        </div>
      </div>
    </div>
  );
};

// --- KAS Signal Section ---
const KasSignalSection: React.FC<{ signal: KasSignal }> = ({ signal }) => (
  <div className={styles.kasSection}>
    <div className={styles.sectionTitle}>KAS Cycle Signal</div>
    <div className={styles.kasContent}>
      <div className={styles.kasLevel}>
        <span className={styles.kasLevelLabel}>Signal</span>
        <span className={styles.kasLevelValue}>{signal.level}</span>
      </div>
      <div className={styles.kasScore}>
        <span className={styles.kasScoreLabel}>Score</span>
        <span className={styles.kasScoreValue}>{signal.score}</span>
      </div>
      <div className={styles.kasRecommendation}>{signal.recommendation}</div>
    </div>
  </div>
);

// --- Open Trades Table ---
interface TradesTableProps {
  trades: OpenTrade[];
  emptyMessage?: string;
}

const TradesTable: React.FC<TradesTableProps> = ({ trades, emptyMessage = 'No open trades' }) => {
  if (trades.length === 0) {
    return <div className={styles.emptyTable}>{emptyMessage}</div>;
  }
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Profit %</th>
            <th>Duration</th>
            <th>Stake</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.trade_id}>
              <td className={styles.pairCell}>{t.pair}</td>
              <td className={pctClass(t.profit_pct)}>{formatPct(t.profit_pct)}</td>
              <td>{formatDuration(t.open_date)}</td>
              <td>{formatCurrency(t.stake_amount)}</td>
              <td>{t.current_rate?.toFixed(6) ?? '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Congress Trades Table ---
interface CongressTableProps {
  trades: CongressTrade[];
  loading: boolean;
  error: string | null;
}

const CongressTable: React.FC<CongressTableProps> = ({ trades, loading, error }) => {
  if (loading) return <div className={styles.loadingState}>Loading congressional trades...</div>;
  if (error) return <div className={styles.errorState}>{error}</div>;
  if (trades.length === 0)
    return <div className={styles.emptyTable}>No recent congressional trades</div>;

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Politician</th>
            <th>Ticker</th>
            <th>Action</th>
            <th>Amount</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.politician}-${t.ticker}-${i}`}>
              <td>{t.politician}</td>
              <td className={styles.pairCell}>{t.ticker}</td>
              <td className={t.action?.toLowerCase() === 'buy' ? styles.profit : styles.loss}>
                {t.action}
              </td>
              <td>{t.amount}</td>
              <td>{t.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============ Main Component ============
const TradingTerminalPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isLoading, setIsLoading] = useState(true);

  const [rfcrypto, setRfcrypto] = useState<BotData>({
    trades: [],
    profit: null,
    balance: null,
    error: null,
    loading: true,
  });

  const [nfi, setNfi] = useState<BotData>({
    trades: [],
    profit: null,
    balance: null,
    error: null,
    loading: true,
  });

  const [congressTrades, setCongressTrades] = useState<CongressTrade[]>([]);
  const [congressLoading, setCongressLoading] = useState(true);
  const [congressError, setCongressError] = useState<string | null>(null);

  const [kasSignal] = useState<KasSignal>({
    level: 'CAUTION',
    score: '1.5 / 7',
    recommendation: 'Awaiting bridge event from clodette.db',
  });

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  // ============ Data Fetching ============
  const fetchBotData = useCallback(
    async (
      endpoints: { status: string; profit: string; balance: string },
      setter: React.Dispatch<React.SetStateAction<BotData>>,
    ) => {
      setter((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [trades, profit, balance] = await Promise.all([
          proxyFetch<OpenTrade[]>(endpoints.status),
          proxyFetch<BotProfit>(endpoints.profit),
          proxyFetch<BotBalance[]>(endpoints.balance),
        ]);
        setter({
          trades: Array.isArray(trades) ? trades : [],
          profit,
          balance: Array.isArray(balance) ? balance : null,
          error: null,
          loading: false,
        });
      } catch (err) {
        setter((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to fetch',
          loading: false,
        }));
      }
    },
    [],
  );

  const fetchCongressData = useCallback(async () => {
    setCongressLoading(true);
    setCongressError(null);
    try {
      const data = await proxyFetch<CongressTrade[]>(ENDPOINTS.congress.trades);
      setCongressTrades(Array.isArray(data) ? data : []);
    } catch (err) {
      setCongressError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setCongressLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchBotData(ENDPOINTS.rfcrypto, setRfcrypto),
      fetchBotData(ENDPOINTS.nfi, setNfi),
      fetchCongressData(),
    ]);
    setLastRefresh(new Date());
  }, [fetchBotData, fetchCongressData]);

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_POSITIONS': {
          const allTrades = [
            ...rfcrypto.trades.map((t) => ({ ...t, bot: 'RFCrypto' })),
            ...nfi.trades.map((t) => ({ ...t, bot: 'NFI' })),
          ];
          return JSON.stringify(allTrades);
        }
        case 'GET_PNL': {
          return JSON.stringify({
            rfcrypto: rfcrypto.profit,
            nfi: nfi.profit,
          });
        }
        case 'GET_KAS_SIGNAL': {
          return JSON.stringify(kasSignal);
        }
        case 'GET_CONGRESS_TRADES': {
          return JSON.stringify(congressTrades);
        }
        case 'REFRESH_DATA': {
          await refreshAll();
          reportAction(APP_ID, 'REFRESH_DATA', {});
          return 'success';
        }
        case 'SYNC_STATE': {
          return JSON.stringify({
            activeTab,
            lastRefresh: lastRefresh?.toISOString(),
            rfcryptoTradeCount: rfcrypto.trades.length,
            nfiTradeCount: nfi.trades.length,
          });
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [rfcrypto, nfi, kasSignal, congressTrades, refreshAll, activeTab, lastRefresh],
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
          name: 'TradingTerminal',
          windowStyle: { width: 900, height: 700 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'TradingTerminal',
          windowStyle: { width: 900, height: 700 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[TradingTerminal] fetchVibeInfo failed:', error);
        }

        await refreshAll();

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[TradingTerminal] Init error:', error);
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

  // ============ Combined recent trades for overview ============
  const recentTrades = [
    ...rfcrypto.trades.map((t) => ({ ...t, _bot: 'RFCrypto' })),
    ...nfi.trades.map((t) => ({ ...t, _bot: 'NFI' })),
  ].sort((a, b) => new Date(b.open_date).getTime() - new Date(a.open_date).getTime());

  // ============ Render ============
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Connecting to trading bots...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className={styles.content}>
        {activeTab === 'overview' && (
          <div className={styles.overviewTab}>
            <div className={styles.summaryRow}>
              <BotSummaryCard name="RFCrypto" data={rfcrypto} />
              <BotSummaryCard name="NFI" data={nfi} />
            </div>

            <KasSignalSection signal={kasSignal} />

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Recent Open Trades</span>
                {lastRefresh && (
                  <span className={styles.refreshTime}>
                    Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className={styles.tableWrapper}>
                {recentTrades.length === 0 ? (
                  <div className={styles.emptyTable}>No open trades</div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Bot</th>
                        <th>Pair</th>
                        <th>Profit %</th>
                        <th>Duration</th>
                        <th>Stake</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.slice(0, 20).map((t) => (
                        <tr key={`${t._bot}-${t.trade_id}`}>
                          <td className={styles.botBadge}>{t._bot}</td>
                          <td className={styles.pairCell}>{t.pair}</td>
                          <td className={pctClass(t.profit_pct)}>{formatPct(t.profit_pct)}</td>
                          <td>{formatDuration(t.open_date)}</td>
                          <td>{formatCurrency(t.stake_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rfcrypto' && (
          <div className={styles.botTab}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Open Trades</div>
              {rfcrypto.loading ? (
                <div className={styles.loadingState}>Loading...</div>
              ) : rfcrypto.error ? (
                <div className={styles.errorState}>{rfcrypto.error}</div>
              ) : (
                <TradesTable trades={rfcrypto.trades} />
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Daily P&L</div>
              <div className={styles.chartPlaceholder}>
                Chart area -- will render when charting library is integrated
              </div>
            </div>

            {rfcrypto.profit && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Bot Summary</div>
                <div className={styles.configGrid}>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Total Trades</span>
                    <span className={styles.configValue}>{rfcrypto.profit.trade_count}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Closed Trades</span>
                    <span className={styles.configValue}>{rfcrypto.profit.closed_trade_count}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Best Pair</span>
                    <span className={styles.configValue}>{rfcrypto.profit.best_pair}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Best Rate</span>
                    <span className={`${styles.configValue} ${styles.profit}`}>
                      {formatPct(rfcrypto.profit.best_rate)}
                    </span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Avg Duration</span>
                    <span className={styles.configValue}>{rfcrypto.profit.avg_duration}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Closed P&L</span>
                    <span
                      className={`${styles.configValue} ${pctClass(rfcrypto.profit.profit_closed_percent)}`}
                    >
                      {formatPct(rfcrypto.profit.profit_closed_percent)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'nfi' && (
          <div className={styles.botTab}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Open Trades</div>
              {nfi.loading ? (
                <div className={styles.loadingState}>Loading...</div>
              ) : nfi.error ? (
                <div className={styles.errorState}>{nfi.error}</div>
              ) : (
                <TradesTable trades={nfi.trades} />
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Daily P&L</div>
              <div className={styles.chartPlaceholder}>
                Chart area -- will render when charting library is integrated
              </div>
            </div>

            {nfi.profit && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Bot Summary</div>
                <div className={styles.configGrid}>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Total Trades</span>
                    <span className={styles.configValue}>{nfi.profit.trade_count}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Closed Trades</span>
                    <span className={styles.configValue}>{nfi.profit.closed_trade_count}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Best Pair</span>
                    <span className={styles.configValue}>{nfi.profit.best_pair}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Best Rate</span>
                    <span className={`${styles.configValue} ${styles.profit}`}>
                      {formatPct(nfi.profit.best_rate)}
                    </span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Avg Duration</span>
                    <span className={styles.configValue}>{nfi.profit.avg_duration}</span>
                  </div>
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Closed P&L</span>
                    <span
                      className={`${styles.configValue} ${pctClass(nfi.profit.profit_closed_percent)}`}
                    >
                      {formatPct(nfi.profit.profit_closed_percent)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'congress' && (
          <div className={styles.congressTab}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Recent Congressional Trades</div>
              <CongressTable
                trades={congressTrades}
                loading={congressLoading}
                error={congressError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingTerminalPage;
