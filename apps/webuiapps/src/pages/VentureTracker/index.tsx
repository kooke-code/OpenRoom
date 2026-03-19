import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
const APP_ID = 29;

// ============ Types ============
type TabType = 'pipeline' | 'pnl' | 'opportunities' | 'property';
type VentureStatus = 'discovery' | 'building' | 'live' | 'shelved';

interface Venture {
  id: string;
  name: string;
  description: string;
  status: VentureStatus;
  monthlyRevenue: number;
  monthlyCost: number;
  opportunityScore: number;
  startDate: string;
  revenueBreakdown: { source: string; amount: number }[];
  costBreakdown: { item: string; amount: number }[];
  trend: 'up' | 'down' | 'flat';
}

interface Opportunity {
  id: string;
  title: string;
  description: string;
  score: number;
  category: string;
  source: string;
  discoveredAt: string;
}

interface JobLead {
  id: string;
  title: string;
  company: string;
  salary: string;
  matchScore: number;
  location: string;
  type: 'remote' | 'hybrid' | 'onsite';
}

interface PropertyLead {
  id: string;
  address: string;
  city: string;
  price: number;
  estimatedRent: number;
  monthlyCashFlow: number;
  roi: number;
  sqm: number;
  bedrooms: number;
}

// ============ Mock Data ============
const MOCK_VENTURES: Venture[] = [
  {
    id: 'v1',
    name: 'Dagknight Consulting',
    description: 'AI consulting and automation services',
    status: 'live',
    monthlyRevenue: 3200,
    monthlyCost: 850,
    opportunityScore: 82,
    startDate: '2025-06-01',
    trend: 'up',
    revenueBreakdown: [
      { source: 'Retainer clients', amount: 2200 },
      { source: 'Ad-hoc projects', amount: 1000 },
    ],
    costBreakdown: [
      { item: 'API costs', amount: 350 },
      { item: 'Infrastructure', amount: 200 },
      { item: 'Tools', amount: 300 },
    ],
  },
  {
    id: 'v2',
    name: 'Markt30a Media',
    description: 'Viral content production at scale',
    status: 'building',
    monthlyRevenue: 180,
    monthlyCost: 120,
    opportunityScore: 65,
    startDate: '2026-01-15',
    trend: 'up',
    revenueBreakdown: [
      { source: 'Ad revenue', amount: 120 },
      { source: 'Sponsorships', amount: 60 },
    ],
    costBreakdown: [
      { item: 'Tools', amount: 80 },
      { item: 'Swarm compute', amount: 40 },
    ],
  },
  {
    id: 'v3',
    name: 'RFCrypto Trading',
    description: 'Random Forest crypto trading system',
    status: 'live',
    monthlyRevenue: 0,
    monthlyCost: 45,
    opportunityScore: 58,
    startDate: '2026-03-16',
    trend: 'flat',
    revenueBreakdown: [{ source: 'Paper trading (no live P&L yet)', amount: 0 }],
    costBreakdown: [
      { item: 'Bybit fees (paper)', amount: 0 },
      { item: 'Compute', amount: 45 },
    ],
  },
  {
    id: 'v4',
    name: 'OpenClaw Platform',
    description: 'Open-source AI agent gateway',
    status: 'live',
    monthlyRevenue: 0,
    monthlyCost: 25,
    opportunityScore: 72,
    startDate: '2025-09-01',
    trend: 'up',
    revenueBreakdown: [{ source: 'Open source (indirect value)', amount: 0 }],
    costBreakdown: [
      { item: 'Ollama Cloud', amount: 15 },
      { item: 'Domain', amount: 10 },
    ],
  },
  {
    id: 'v5',
    name: 'Clodette Dashboard Exporter',
    description: 'Grafana/Prometheus health monitoring',
    status: 'live',
    monthlyRevenue: 0,
    monthlyCost: 0,
    opportunityScore: 45,
    startDate: '2026-02-01',
    trend: 'flat',
    revenueBreakdown: [],
    costBreakdown: [],
  },
  {
    id: 'v6',
    name: 'Rental Factory',
    description: 'Automated rental property analysis pipeline',
    status: 'discovery',
    monthlyRevenue: 0,
    monthlyCost: 0,
    opportunityScore: 78,
    startDate: '2026-03-18',
    trend: 'flat',
    revenueBreakdown: [],
    costBreakdown: [],
  },
  {
    id: 'v7',
    name: 'NAS Media Pipeline',
    description: 'Automated home video processing from NAS',
    status: 'discovery',
    monthlyRevenue: 0,
    monthlyCost: 0,
    opportunityScore: 40,
    startDate: '2026-03-10',
    trend: 'flat',
    revenueBreakdown: [],
    costBreakdown: [],
  },
  {
    id: 'v8',
    name: 'Viral Content Scanner',
    description: 'AI trend detection for content repurposing',
    status: 'shelved',
    monthlyRevenue: 0,
    monthlyCost: 0,
    opportunityScore: 55,
    startDate: '2026-02-20',
    trend: 'down',
    revenueBreakdown: [],
    costBreakdown: [],
  },
];

const MOCK_OPPORTUNITIES: Opportunity[] = [
  {
    id: 'o1',
    title: 'AI Agent Marketplace',
    description: 'Build a marketplace where companies hire AI agent teams on demand.',
    score: 88,
    category: 'SaaS',
    source: 'Swarm Research',
    discoveredAt: '2026-03-19',
  },
  {
    id: 'o2',
    title: 'Freqtrade Strategy Pack',
    description: 'Package RFCrypto strategies as paid Freqtrade add-on.',
    score: 74,
    category: 'Product',
    source: 'Internal',
    discoveredAt: '2026-03-18',
  },
  {
    id: 'o3',
    title: 'IT Ops Consulting',
    description: 'Offer ITSM transformation consulting based on SDP experience.',
    score: 71,
    category: 'Service',
    source: 'LinkedIn',
    discoveredAt: '2026-03-17',
  },
  {
    id: 'o4',
    title: 'NAS-as-a-Service',
    description: 'Managed NAS backup service for SMBs in the region.',
    score: 52,
    category: 'Service',
    source: 'Swarm Research',
    discoveredAt: '2026-03-16',
  },
];

const MOCK_JOBS: JobLead[] = [
  {
    id: 'j1',
    title: 'Senior Platform Engineer (AI/ML)',
    company: 'Datadog',
    salary: '85-110k',
    matchScore: 92,
    location: 'Remote EU',
    type: 'remote',
  },
  {
    id: 'j2',
    title: 'DevOps Lead - AI Infrastructure',
    company: 'Mistral AI',
    salary: '90-120k',
    matchScore: 88,
    location: 'Paris',
    type: 'hybrid',
  },
  {
    id: 'j3',
    title: 'IT Service Delivery Manager',
    company: 'Proximus',
    salary: '70-85k',
    matchScore: 78,
    location: 'Brussels',
    type: 'hybrid',
  },
  {
    id: 'j4',
    title: 'Staff Engineer - Agent Systems',
    company: 'Anthropic',
    salary: '$200-280k',
    matchScore: 95,
    location: 'Remote',
    type: 'remote',
  },
];

const MOCK_PROPERTIES: PropertyLead[] = [
  {
    id: 'p1',
    address: 'Stationsstraat 42',
    city: 'Leuven',
    price: 285000,
    estimatedRent: 1250,
    monthlyCashFlow: 420,
    roi: 5.3,
    sqm: 78,
    bedrooms: 2,
  },
  {
    id: 'p2',
    address: 'Kerkstraat 15',
    city: 'Mechelen',
    price: 225000,
    estimatedRent: 1050,
    monthlyCashFlow: 310,
    roi: 5.6,
    sqm: 65,
    bedrooms: 1,
  },
  {
    id: 'p3',
    address: 'Grote Markt 8/3',
    city: 'Antwerp',
    price: 340000,
    estimatedRent: 1450,
    monthlyCashFlow: 280,
    roi: 4.2,
    sqm: 92,
    bedrooms: 2,
  },
];

// ============ Utilities ============
const formatCurrency = (val: number): string =>
  val >= 0 ? `$${val.toLocaleString()}` : `-$${Math.abs(val).toLocaleString()}`;

const formatEur = (val: number): string => `EUR ${val.toLocaleString()}`;

const getScoreColor = (score: number): string => {
  if (score >= 80) return '#3fb950';
  if (score >= 60) return '#d29922';
  if (score >= 40) return '#f0883e';
  return '#f85149';
};

const STATUS_ORDER: VentureStatus[] = ['discovery', 'building', 'live', 'shelved'];
const STATUS_LABELS: Record<VentureStatus, string> = {
  discovery: 'Discovery',
  building: 'Building',
  live: 'Live',
  shelved: 'Shelved',
};

// ============ Sub-components ============

const VentureCard: React.FC<{ venture: Venture; expanded: boolean; onToggle: () => void }> = ({
  venture,
  expanded,
  onToggle,
}) => {
  const net = venture.monthlyRevenue - venture.monthlyCost;
  return (
    <div className={`${styles.ventureCard} ${expanded ? styles.expanded : ''}`} onClick={onToggle}>
      <div className={styles.ventureName}>{venture.name}</div>
      <div className={styles.venturePnl}>
        <div className={styles.ventureStat}>
          <div className={styles.ventureStatLabel}>Revenue</div>
          <div className={styles.ventureStatValue}>{formatCurrency(venture.monthlyRevenue)}</div>
        </div>
        <div className={styles.ventureStat}>
          <div className={styles.ventureStatLabel}>Cost</div>
          <div className={styles.ventureStatValue}>{formatCurrency(venture.monthlyCost)}</div>
        </div>
        <div className={styles.ventureStat}>
          <div className={styles.ventureStatLabel}>Net</div>
          <div
            className={`${styles.ventureStatValue} ${net >= 0 ? styles.positive : styles.negative}`}
          >
            {formatCurrency(net)}
          </div>
        </div>
      </div>
      <div className={styles.scoreBar}>
        <div
          className={styles.scoreBarFill}
          style={{
            width: `${venture.opportunityScore}%`,
            background: getScoreColor(venture.opportunityScore),
          }}
        />
      </div>
      <div className={styles.scoreLabel}>Score: {venture.opportunityScore}/100</div>

      {expanded && (
        <div className={styles.ventureDetails}>
          <div className={styles.ventureDetailRow}>
            <span>Description</span>
            <span className={styles.ventureDetailValue}>{venture.description}</span>
          </div>
          <div className={styles.ventureDetailRow}>
            <span>Started</span>
            <span className={styles.ventureDetailValue}>{venture.startDate}</span>
          </div>
          {venture.revenueBreakdown.length > 0 &&
            venture.revenueBreakdown.map((r, i) => (
              <div key={i} className={styles.ventureDetailRow}>
                <span>{r.source}</span>
                <span className={styles.ventureDetailValue}>{formatCurrency(r.amount)}</span>
              </div>
            ))}
          {venture.costBreakdown.length > 0 &&
            venture.costBreakdown.map((c, i) => (
              <div key={i} className={styles.ventureDetailRow}>
                <span>{c.item}</span>
                <span className={styles.ventureDetailValue}>-{formatCurrency(c.amount)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const PipelineTab: React.FC<{ ventures: Venture[] }> = ({ ventures }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<VentureStatus, Venture[]> = {
      discovery: [],
      building: [],
      live: [],
      shelved: [],
    };
    ventures.forEach((v) => map[v.status].push(v));
    return map;
  }, [ventures]);

  return (
    <div className={styles.kanban}>
      {STATUS_ORDER.map((status) => (
        <div key={status} className={styles.kanbanColumn}>
          <div className={`${styles.kanbanHeader} ${styles[status]}`}>
            {STATUS_LABELS[status]}
            <span className={styles.kanbanCount}>{grouped[status].length}</span>
          </div>
          <div className={styles.kanbanCards}>
            {grouped[status].map((v) => (
              <VentureCard
                key={v.id}
                venture={v}
                expanded={expandedId === v.id}
                onToggle={() => setExpandedId(expandedId === v.id ? null : v.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const PnlTab: React.FC<{ ventures: Venture[] }> = ({ ventures }) => {
  const totalRevenue = ventures.reduce((s, v) => s + v.monthlyRevenue, 0);
  const totalCost = ventures.reduce((s, v) => s + v.monthlyCost, 0);
  const totalNet = totalRevenue - totalCost;

  return (
    <div>
      <table className={styles.pnlTable}>
        <thead>
          <tr>
            <th>Venture</th>
            <th>Status</th>
            <th>Revenue</th>
            <th>Costs</th>
            <th>Net P&L</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {ventures.map((v) => {
            const net = v.monthlyRevenue - v.monthlyCost;
            return (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{STATUS_LABELS[v.status]}</td>
                <td>{formatCurrency(v.monthlyRevenue)}</td>
                <td>{formatCurrency(v.monthlyCost)}</td>
                <td style={{ color: net >= 0 ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  {formatCurrency(net)}
                </td>
                <td>
                  {v.trend === 'up' && <span className={styles.trendUp}>&#9650; Up</span>}
                  {v.trend === 'down' && <span className={styles.trendDown}>&#9660; Down</span>}
                  {v.trend === 'flat' && <span style={{ color: '#8b949e' }}>&#8212; Flat</span>}
                </td>
              </tr>
            );
          })}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td></td>
            <td>
              <strong>{formatCurrency(totalRevenue)}</strong>
            </td>
            <td>
              <strong>{formatCurrency(totalCost)}</strong>
            </td>
            <td style={{ color: totalNet >= 0 ? '#3fb950' : '#f85149', fontWeight: 700 }}>
              <strong>{formatCurrency(totalNet)}</strong>
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const OpportunitiesTab: React.FC<{
  opportunities: Opportunity[];
  jobs: JobLead[];
}> = ({ opportunities, jobs }) => (
  <div>
    <h3 className={styles.sectionTitle}>Opportunity Scan</h3>
    <div className={styles.opportunityGrid}>
      {opportunities.map((opp) => (
        <div
          key={opp.id}
          className={styles.opportunityCard}
          style={{ borderTopColor: getScoreColor(opp.score) }}
        >
          <div className={styles.opportunityScore}>
            <span
              className={styles.opportunityScoreNum}
              style={{ color: getScoreColor(opp.score) }}
            >
              {opp.score}
            </span>
            <span className={styles.opportunityTag}>{opp.category}</span>
          </div>
          <div className={styles.opportunityTitle}>{opp.title}</div>
          <div className={styles.opportunityDesc}>{opp.description}</div>
        </div>
      ))}
    </div>

    <h3 className={styles.sectionTitle}>Job Scanner</h3>
    <div className={styles.jobList}>
      {jobs.map((job) => (
        <div key={job.id} className={styles.jobItem}>
          <div style={{ flex: 1 }}>
            <div className={styles.jobTitle}>{job.title}</div>
            <div className={styles.jobCompany}>
              {job.company} &middot; {job.location} &middot; {job.type}
            </div>
          </div>
          <div className={styles.jobSalary}>{job.salary}</div>
          <span
            className={styles.jobMatch}
            style={{
              background: `rgba(${job.matchScore >= 80 ? '63,185,80' : job.matchScore >= 60 ? '210,153,34' : '248,81,73'}, 0.15)`,
              color: getScoreColor(job.matchScore),
            }}
          >
            {job.matchScore}% match
          </span>
        </div>
      ))}
    </div>
  </div>
);

const PropertyTab: React.FC<{ properties: PropertyLead[] }> = ({ properties }) => {
  const [calcPrice, setCalcPrice] = useState('250000');
  const [calcRent, setCalcRent] = useState('1100');
  const [calcCosts, setCalcCosts] = useState('150');

  const cashFlow = Number(calcRent) - Number(calcCosts) - (Number(calcPrice) * 0.035) / 12;
  const annualReturn = (((Number(calcRent) - Number(calcCosts)) * 12) / Number(calcPrice)) * 100;

  return (
    <div>
      <h3 className={styles.sectionTitle}>Property Leads</h3>
      <div className={styles.propertyGrid}>
        {properties.map((p) => (
          <div key={p.id} className={styles.propertyCard}>
            <div className={styles.propertyAddress}>
              {p.address}, {p.city}
            </div>
            <div className={styles.propertyStats}>
              <div className={styles.propertyStat}>
                <span className={styles.propertyStatLabel}>Price</span>
                <span className={styles.propertyStatValue}>{formatEur(p.price)}</span>
              </div>
              <div className={styles.propertyStat}>
                <span className={styles.propertyStatLabel}>Est. Rent</span>
                <span className={styles.propertyStatValue}>{formatEur(p.estimatedRent)}/mo</span>
              </div>
              <div className={styles.propertyStat}>
                <span className={styles.propertyStatLabel}>Cash Flow</span>
                <span
                  className={`${styles.propertyStatValue} ${p.monthlyCashFlow >= 0 ? styles.positive : styles.negative}`}
                >
                  {formatEur(p.monthlyCashFlow)}/mo
                </span>
              </div>
              <div className={styles.propertyStat}>
                <span className={styles.propertyStatLabel}>
                  {p.sqm}m2 / {p.bedrooms}BR
                </span>
                <span className={styles.propertyStatValue}></span>
              </div>
              <div className={styles.propertyRoi}>
                <span className={styles.roiLabel}>ROI</span>
                <span className={styles.roiValue}>{p.roi.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.calculator}>
        <div className={styles.calcTitle}>Cash Flow Calculator</div>
        <div className={styles.calcGrid}>
          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Purchase Price (EUR)</label>
            <input
              className={styles.calcInput}
              type="number"
              value={calcPrice}
              onChange={(e) => setCalcPrice(e.target.value)}
            />
          </div>
          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Monthly Rent (EUR)</label>
            <input
              className={styles.calcInput}
              type="number"
              value={calcRent}
              onChange={(e) => setCalcRent(e.target.value)}
            />
          </div>
          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Monthly Costs (EUR)</label>
            <input
              className={styles.calcInput}
              type="number"
              value={calcCosts}
              onChange={(e) => setCalcCosts(e.target.value)}
            />
          </div>
          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Mortgage Rate</label>
            <input className={styles.calcInput} type="text" value="3.5%" readOnly />
          </div>
          <div className={styles.calcResult}>
            <span className={styles.calcResultLabel}>Monthly Cash Flow</span>
            <span className={styles.calcResultValue}>{formatEur(Math.round(cashFlow))}</span>
          </div>
          <div className={styles.calcResult}>
            <span className={styles.calcResultLabel}>Annual Return</span>
            <span className={styles.calcResultValue}>{annualReturn.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Main Component ============
const VentureTrackerPage: React.FC = () => {
  const [ventures, setVentures] = useState<Venture[]>(MOCK_VENTURES);
  const [opportunities] = useState<Opportunity[]>(MOCK_OPPORTUNITIES);
  const [jobs] = useState<JobLead[]>(MOCK_JOBS);
  const [properties] = useState<PropertyLead[]>(MOCK_PROPERTIES);
  const [activeTab, setActiveTab] = useState<TabType>('pipeline');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agent action handler
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_PIPELINE':
          return JSON.stringify(
            STATUS_ORDER.reduce(
              (acc, s) => {
                acc[s] = ventures.filter((v) => v.status === s);
                return acc;
              },
              {} as Record<string, Venture[]>,
            ),
          );
        case 'GET_VENTURE_PNL': {
          const vid = action.params?.venture_id;
          const v = ventures.find((x) => x.id === vid);
          if (!v) return 'error: venture not found';
          return JSON.stringify({
            name: v.name,
            revenue: v.monthlyRevenue,
            cost: v.monthlyCost,
            net: v.monthlyRevenue - v.monthlyCost,
            revenueBreakdown: v.revenueBreakdown,
            costBreakdown: v.costBreakdown,
          });
        }
        case 'GET_OPPORTUNITIES':
          return JSON.stringify(opportunities);
        case 'GET_JOB_FEED':
          return JSON.stringify(jobs);
        case 'GET_PROPERTY_LEADS':
          return JSON.stringify(properties);
        case 'CREATE_VENTURE': {
          const name = action.params?.name;
          const desc = action.params?.description || '';
          if (!name) return 'error: missing name';
          const newV: Venture = {
            id: `v${Date.now()}`,
            name,
            description: desc,
            status: 'discovery',
            monthlyRevenue: 0,
            monthlyCost: 0,
            opportunityScore: 50,
            startDate: new Date().toISOString().split('T')[0],
            trend: 'flat',
            revenueBreakdown: [],
            costBreakdown: [],
          };
          setVentures((prev) => [...prev, newV]);
          reportAction(APP_ID, 'CREATE_VENTURE', { name });
          return JSON.stringify(newV);
        }
        case 'SYNC_STATE':
          return JSON.stringify({ ventureCount: ventures.length });
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [ventures, opportunities, jobs, properties],
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
          name: 'VentureTracker',
          windowStyle: { width: 900, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'VentureTracker',
          windowStyle: { width: 900, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch {
          // Non-critical
        }

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[VentureTracker] Init error:', err);
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
      <div className={styles.ventureTracker}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Loading ventures...</div>
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'pnl', label: 'P&L' },
    { key: 'opportunities', label: 'Opportunities' },
    { key: 'property', label: 'Property' },
  ];

  return (
    <div className={styles.ventureTracker}>
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
        {activeTab === 'pipeline' && <PipelineTab ventures={ventures} />}
        {activeTab === 'pnl' && <PnlTab ventures={ventures} />}
        {activeTab === 'opportunities' && (
          <OpportunitiesTab opportunities={opportunities} jobs={jobs} />
        )}
        {activeTab === 'property' && <PropertyTab properties={properties} />}
      </div>
    </div>
  );
};

export default VentureTrackerPage;
