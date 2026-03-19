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
const APP_ID = 28;
const PAPERCLIP_API = 'http://localhost:3002';

// ============ Types ============
type TabType = 'overview' | 'content' | 'approvals';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  status: 'active' | 'idle' | 'offline' | 'error';
  tasksCompleted: number;
  budgetUsed: number;
}

interface Task {
  id: string;
  description: string;
  assignedAgent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: string;
}

interface ScoutResult {
  id: string;
  platform: 'github' | 'linkedin' | 'youtube';
  title: string;
  url: string;
  engagement: string;
  discoveredAt: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  platform: string;
}

interface PublishStatus {
  platform: string;
  drafted: number;
  scheduled: number;
  published: number;
}

interface ApprovalItem {
  id: string;
  title: string;
  type: 'hire_agent' | 'strategy_change' | 'budget_increase';
  requestedBy: string;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
  color: string;
  mission: string;
  activeAgents: number;
  monthlyBudget: number;
  tasksCompleted: number;
  agents: Agent[];
  tasks: Task[];
  scoutResults: ScoutResult[];
  calendar: CalendarEvent[];
  publishStatus: PublishStatus[];
  approvals: ApprovalItem[];
}

// ============ Mock Data ============
const MOCK_COMPANIES: Company[] = [
  {
    id: 'dagknight',
    name: 'Dagknight Consulting',
    color: '#58a6ff',
    mission:
      'AI-powered consulting and automation solutions for enterprise clients. Building intelligent systems that transform operational efficiency.',
    activeAgents: 3,
    monthlyBudget: 2500,
    tasksCompleted: 147,
    agents: [
      {
        id: 'a1',
        name: 'OpenClaw',
        role: 'General Assistant',
        provider: 'GLM-5 via Ollama',
        status: 'active',
        tasksCompleted: 89,
        budgetUsed: 45,
      },
      {
        id: 'a2',
        name: 'Clodette Opus',
        role: 'Complex Analysis',
        provider: 'Claude Code Opus',
        status: 'active',
        tasksCompleted: 42,
        budgetUsed: 180,
      },
      {
        id: 'a3',
        name: 'Swarm Workers',
        role: 'Research Pipeline',
        provider: 'Gemini 2.5 Flash',
        status: 'idle',
        tasksCompleted: 16,
        budgetUsed: 8,
      },
    ],
    tasks: [
      {
        id: 't1',
        description: 'Review ITSM contract SHU-230701-SLA v2.4 renewal terms',
        assignedAgent: 'Clodette Opus',
        priority: 'high',
        createdAt: '2026-03-19T08:00:00Z',
      },
      {
        id: 't2',
        description: 'Generate weekly performance report for Slack #reports',
        assignedAgent: 'OpenClaw',
        priority: 'medium',
        createdAt: '2026-03-19T07:30:00Z',
      },
      {
        id: 't3',
        description: 'Scan GitHub trending repos for AI agent frameworks',
        assignedAgent: 'Swarm Workers',
        priority: 'low',
        createdAt: '2026-03-18T14:00:00Z',
      },
      {
        id: 't4',
        description: 'Update Notion knowledge base with latest vendor docs',
        assignedAgent: 'OpenClaw',
        priority: 'medium',
        createdAt: '2026-03-18T10:00:00Z',
      },
    ],
    scoutResults: [
      {
        id: 's1',
        platform: 'github',
        title: 'openai/swarm - Lightweight multi-agent orchestration',
        url: '#',
        engagement: '12.4k stars',
        discoveredAt: '2026-03-19T06:00:00Z',
      },
      {
        id: 's2',
        platform: 'linkedin',
        title: 'AI Agent Orchestration: The Next Enterprise Frontier',
        url: '#',
        engagement: '2.1k reactions',
        discoveredAt: '2026-03-19T05:30:00Z',
      },
      {
        id: 's3',
        platform: 'youtube',
        title: 'Building Production AI Agents - Full Workshop',
        url: '#',
        engagement: '45k views',
        discoveredAt: '2026-03-18T20:00:00Z',
      },
      {
        id: 's4',
        platform: 'github',
        title: 'anthropics/claude-code - Claude Code SDK',
        url: '#',
        engagement: '8.7k stars',
        discoveredAt: '2026-03-18T18:00:00Z',
      },
    ],
    calendar: [
      { id: 'c1', title: 'Blog: AI Ops', date: '2026-03-19', platform: 'linkedin' },
      { id: 'c2', title: 'Thread: Agent tips', date: '2026-03-20', platform: 'x' },
      { id: 'c3', title: 'Video: Setup guide', date: '2026-03-21', platform: 'youtube' },
      { id: 'c4', title: 'Short: Quick demo', date: '2026-03-22', platform: 'tiktok' },
    ],
    publishStatus: [
      { platform: 'X / Twitter', drafted: 3, scheduled: 2, published: 12 },
      { platform: 'YouTube', drafted: 1, scheduled: 0, published: 4 },
      { platform: 'TikTok', drafted: 2, scheduled: 1, published: 6 },
    ],
    approvals: [
      {
        id: 'ap1',
        title: 'Hire dedicated video editing agent ($150/mo)',
        type: 'hire_agent',
        requestedBy: 'Content Pipeline',
        createdAt: '2026-03-19T07:00:00Z',
      },
      {
        id: 'ap2',
        title: 'Increase swarm research budget by $50/mo',
        type: 'budget_increase',
        requestedBy: 'Swarm Workers',
        createdAt: '2026-03-18T16:00:00Z',
      },
    ],
  },
  {
    id: 'markt30a',
    name: 'Markt30a Media',
    color: '#f0883e',
    mission:
      'Creative content production and viral media strategy. Leveraging AI to produce engaging content at scale across social platforms.',
    activeAgents: 2,
    monthlyBudget: 800,
    tasksCompleted: 64,
    agents: [
      {
        id: 'a4',
        name: 'Content Scout',
        role: 'Trend Scanner',
        provider: 'Gemini 2.5 Flash',
        status: 'active',
        tasksCompleted: 38,
        budgetUsed: 12,
      },
      {
        id: 'a5',
        name: 'Editor Bot',
        role: 'Content Editor',
        provider: 'OpenClaw / GLM-5',
        status: 'idle',
        tasksCompleted: 26,
        budgetUsed: 20,
      },
    ],
    tasks: [
      {
        id: 't5',
        description: 'Edit and schedule viral compilation for TikTok',
        assignedAgent: 'Editor Bot',
        priority: 'high',
        createdAt: '2026-03-19T09:00:00Z',
      },
      {
        id: 't6',
        description: 'Scan trending audio clips for reuse potential',
        assignedAgent: 'Content Scout',
        priority: 'medium',
        createdAt: '2026-03-19T06:00:00Z',
      },
    ],
    scoutResults: [
      {
        id: 's5',
        platform: 'youtube',
        title: 'Trending: AI-generated music compilations gaining traction',
        url: '#',
        engagement: '120k views avg',
        discoveredAt: '2026-03-19T07:00:00Z',
      },
      {
        id: 's6',
        platform: 'linkedin',
        title: 'Short-form video content ROI analysis 2026',
        url: '#',
        engagement: '890 reactions',
        discoveredAt: '2026-03-18T22:00:00Z',
      },
    ],
    calendar: [
      { id: 'c5', title: 'TikTok: Compilation', date: '2026-03-19', platform: 'tiktok' },
      { id: 'c6', title: 'YT Short: BTS', date: '2026-03-21', platform: 'youtube' },
    ],
    publishStatus: [
      { platform: 'X / Twitter', drafted: 1, scheduled: 1, published: 8 },
      { platform: 'YouTube', drafted: 2, scheduled: 1, published: 3 },
      { platform: 'TikTok', drafted: 4, scheduled: 2, published: 15 },
    ],
    approvals: [
      {
        id: 'ap3',
        title: 'Shift strategy to long-form YouTube content',
        type: 'strategy_change',
        requestedBy: 'Content Scout',
        createdAt: '2026-03-19T08:00:00Z',
      },
    ],
  },
];

// ============ Utility ============
const formatCurrency = (val: number): string => `$${val.toLocaleString()}`;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const approvalTypeLabel = (type: ApprovalItem['type']): string => {
  const map: Record<string, string> = {
    hire_agent: 'Hire Agent',
    strategy_change: 'Strategy Change',
    budget_increase: 'Budget Increase',
  };
  return map[type] || type;
};

const platformIcon = (platform: string): string => {
  const map: Record<string, string> = { github: 'GH', linkedin: 'in', youtube: 'YT' };
  return map[platform] || '?';
};

// ============ Sub-components ============

const OverviewTab: React.FC<{ company: Company }> = ({ company }) => (
  <div>
    <div className={styles.overview}>
      <div className={`${styles.overviewCard} ${styles.overviewMission}`}>
        <div className={styles.overviewLabel}>Mission</div>
        <div className={styles.overviewValue}>{company.mission}</div>
      </div>
      <div className={styles.overviewCard}>
        <div className={styles.overviewLabel}>Active Agents</div>
        <div className={styles.overviewValue}>{company.activeAgents}</div>
      </div>
      <div className={styles.overviewCard}>
        <div className={styles.overviewLabel}>Monthly Budget</div>
        <div className={styles.overviewValue}>{formatCurrency(company.monthlyBudget)}</div>
      </div>
      <div className={styles.overviewCard}>
        <div className={styles.overviewLabel}>Tasks Completed</div>
        <div className={styles.overviewValue}>{company.tasksCompleted}</div>
      </div>
      <div className={styles.overviewCard}>
        <div className={styles.overviewLabel}>Budget Used</div>
        <div className={styles.overviewValue}>
          {formatCurrency(company.agents.reduce((s, a) => s + a.budgetUsed, 0))}
        </div>
      </div>
    </div>

    <h3 className={styles.sectionTitle}>
      Agents
      <span className={styles.sectionBadge}>{company.agents.length}</span>
    </h3>
    <div className={styles.agentGrid}>
      {company.agents.map((agent) => (
        <div key={agent.id} className={styles.agentCard}>
          <div className={styles.agentHeader}>
            <div className={`${styles.agentStatusDot} ${styles[agent.status]}`} />
            <span className={styles.agentName}>{agent.name}</span>
          </div>
          <div className={styles.agentRole}>{agent.role}</div>
          <div className={styles.agentProvider}>{agent.provider}</div>
          <div className={styles.agentStats}>
            <span>
              Tasks: <span className={styles.agentStatValue}>{agent.tasksCompleted}</span>
            </span>
            <span>
              Budget:{' '}
              <span className={styles.agentStatValue}>{formatCurrency(agent.budgetUsed)}</span>
            </span>
          </div>
        </div>
      ))}
    </div>

    <h3 className={styles.sectionTitle}>
      Task Queue
      <span className={styles.sectionBadge}>{company.tasks.length}</span>
    </h3>
    <div className={styles.taskList}>
      {company.tasks.map((task) => (
        <div key={task.id} className={styles.taskItem}>
          <div className={`${styles.taskPriority} ${styles[task.priority]}`} />
          <div className={styles.taskContent}>
            <div className={styles.taskDescription}>{task.description}</div>
            <div className={styles.taskMeta}>
              <span className={styles.taskAssigned}>{task.assignedAgent}</span>
              <span>{formatDate(task.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
      {company.tasks.length === 0 && <div className={styles.emptyState}>No pending tasks</div>}
    </div>
  </div>
);

const ContentTab: React.FC<{ company: Company }> = ({ company }) => {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className={styles.pipelineSection}>
      <h3 className={styles.sectionTitle}>Scout Results</h3>
      <div className={styles.scoutFeed}>
        {company.scoutResults.map((item) => (
          <div key={item.id} className={styles.scoutItem}>
            <div className={`${styles.scoutPlatformIcon} ${styles[item.platform]}`}>
              {platformIcon(item.platform)}
            </div>
            <div className={styles.scoutContent}>
              <div className={styles.scoutTitle}>{item.title}</div>
              <div className={styles.scoutMeta}>
                {item.engagement} &middot; {formatDate(item.discoveredAt)}
              </div>
            </div>
          </div>
        ))}
        {company.scoutResults.length === 0 && (
          <div className={styles.emptyState}>No scout results yet</div>
        )}
      </div>

      <h3 className={styles.sectionTitle}>Content Calendar</h3>
      <div className={styles.calendar}>
        {weekDays.map((day) => (
          <div key={day} className={styles.calendarDayHeader}>
            {day}
          </div>
        ))}
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          const dayOfWeek = d.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const date = new Date(d);
          date.setDate(d.getDate() + mondayOffset + i);
          const dateStr = date.toISOString().split('T')[0];
          const events = company.calendar.filter((e) => e.date === dateStr);
          return (
            <div key={i} className={styles.calendarDay}>
              <div className={styles.calendarDayNum}>{date.getDate()}</div>
              {events.map((e) => (
                <div key={e.id} className={styles.calendarEvent}>
                  {e.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <h3 className={styles.sectionTitle}>Publishing Status</h3>
      <div className={styles.publishGrid}>
        <div className={`${styles.publishCell} ${styles.header}`}>Platform</div>
        <div className={`${styles.publishCell} ${styles.header}`}>Drafted</div>
        <div className={`${styles.publishCell} ${styles.header}`}>Scheduled</div>
        <div className={`${styles.publishCell} ${styles.header}`}>Published</div>
        {company.publishStatus.map((ps) => (
          <React.Fragment key={ps.platform}>
            <div className={`${styles.publishCell} ${styles.label}`}>{ps.platform}</div>
            <div className={styles.publishCell}>
              <span
                className={`${styles.statusChip} ${ps.drafted > 0 ? styles.drafted : styles.none}`}
              >
                {ps.drafted || '-'}
              </span>
            </div>
            <div className={styles.publishCell}>
              <span
                className={`${styles.statusChip} ${ps.scheduled > 0 ? styles.scheduled : styles.none}`}
              >
                {ps.scheduled || '-'}
              </span>
            </div>
            <div className={styles.publishCell}>
              <span
                className={`${styles.statusChip} ${ps.published > 0 ? styles.published : styles.none}`}
              >
                {ps.published || '-'}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const ApprovalsTab: React.FC<{ company: Company; onApprove: (id: string) => void }> = ({
  company,
  onApprove,
}) => (
  <div>
    <h3 className={styles.sectionTitle}>
      Pending Approvals
      <span className={styles.sectionBadge}>{company.approvals.length}</span>
    </h3>
    <div className={styles.approvalList}>
      {company.approvals.map((item) => (
        <div key={item.id} className={styles.approvalItem}>
          <div className={styles.approvalContent}>
            <div className={styles.approvalTitle}>{item.title}</div>
            <div className={styles.approvalType}>
              {approvalTypeLabel(item.type)} &middot; Requested by {item.requestedBy} &middot;{' '}
              {formatDate(item.createdAt)}
            </div>
          </div>
          <div className={styles.approvalActions}>
            <button
              className={`${styles.approveBtn} ${styles.approve}`}
              onClick={() => onApprove(item.id)}
            >
              Approve
            </button>
            <button className={`${styles.approveBtn} ${styles.reject}`}>Reject</button>
          </div>
        </div>
      ))}
      {company.approvals.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>&#10003;</div>
          No pending approvals
        </div>
      )}
    </div>
  </div>
);

// ============ Main Component ============
const CompanyDashboardPage: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(MOCK_COMPANIES[0].id);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];

  // Try to fetch from Paperclip API
  const fetchPaperclipData = useCallback(async () => {
    try {
      const res = await fetch('/api/local-proxy', {
        headers: { 'X-Target-URL': `${PAPERCLIP_API}/api/companies` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCompanies(data);
          setError(null);
          return;
        }
      }
    } catch {
      // Paperclip API not available, use mock data
    }
    setError('Paperclip API unavailable - showing mock data');
  }, []);

  const handleApprove = useCallback((itemId: string) => {
    setCompanies((prev) =>
      prev.map((c) => ({
        ...c,
        approvals: c.approvals.filter((a) => a.id !== itemId),
      })),
    );
    reportAction(APP_ID, 'APPROVE_ITEM', { item_id: itemId });
  }, []);

  // Agent action handler
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'GET_COMPANY_STATUS': {
          const company = companies.find(
            (c) => c.id === (action.params?.companyId || selectedCompanyId),
          );
          if (!company) return 'error: company not found';
          return JSON.stringify({
            name: company.name,
            activeAgents: company.activeAgents,
            monthlyBudget: company.monthlyBudget,
            tasksCompleted: company.tasksCompleted,
          });
        }
        case 'GET_AGENTS': {
          const company = companies.find(
            (c) => c.id === (action.params?.companyId || selectedCompanyId),
          );
          if (!company) return 'error: company not found';
          return JSON.stringify(company.agents);
        }
        case 'GET_TASK_QUEUE': {
          const company = companies.find(
            (c) => c.id === (action.params?.companyId || selectedCompanyId),
          );
          if (!company) return 'error: company not found';
          return JSON.stringify(company.tasks);
        }
        case 'APPROVE_ITEM': {
          const itemId = action.params?.item_id;
          if (!itemId) return 'error: missing item_id';
          handleApprove(itemId);
          return 'success';
        }
        case 'GET_CONTENT_PIPELINE': {
          const company = companies.find(
            (c) => c.id === (action.params?.companyId || selectedCompanyId),
          );
          if (!company) return 'error: company not found';
          return JSON.stringify({
            scoutResults: company.scoutResults,
            calendar: company.calendar,
            publishStatus: company.publishStatus,
          });
        }
        case 'SYNC_STATE':
          await fetchPaperclipData();
          return 'success';
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [companies, selectedCompanyId, handleApprove, fetchPaperclipData],
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
          name: 'CompanyDashboard',
          windowStyle: { width: 800, height: 650 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'CompanyDashboard',
          windowStyle: { width: 800, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch {
          // Non-critical
        }

        await fetchPaperclipData();

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[CompanyDashboard] Init error:', err);
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

  if (isLoading) {
    return (
      <div className={styles.companyDashboard}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.companyDashboard}>
      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Company switcher */}
      <div className={styles.companySwitcher}>
        {companies.map((c) => (
          <button
            key={c.id}
            className={`${styles.companyTab} ${selectedCompanyId === c.id ? styles.active : ''}`}
            style={{ '--company-color': c.color } as React.CSSProperties}
            onClick={() => setSelectedCompanyId(c.id)}
          >
            <span
              className={styles.companyDot}
              style={{ '--company-color': c.color } as React.CSSProperties}
            />
            {c.name}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className={styles.navTabs}>
        {(['overview', 'content', 'approvals'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.navTab} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'approvals' && selectedCompany.approvals.length > 0
              ? `Approvals (${selectedCompany.approvals.length})`
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'overview' && <OverviewTab company={selectedCompany} />}
        {activeTab === 'content' && <ContentTab company={selectedCompany} />}
        {activeTab === 'approvals' && (
          <ApprovalsTab company={selectedCompany} onApprove={handleApprove} />
        )}
      </div>
    </div>
  );
};

export default CompanyDashboardPage;
