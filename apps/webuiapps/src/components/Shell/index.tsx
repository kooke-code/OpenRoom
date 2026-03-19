import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  MessageCircle,
  Radio,
  Video,
  VideoOff,
  X,
  Activity,
  TrendingUp,
  Mail,
  AlertTriangle,
  Building2,
  Search,
  BookOpen,
  Briefcase,
  Rocket,
  HardDrive,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import ChatPanel from '../ChatPanel';
import BridgeConnector from '../BridgeConnector';
import AppWindow from '../AppWindow';
import { getWindows, subscribe, openWindow } from '@/lib/windowManager';
import { getDesktopApps } from '@/lib/appRegistry';
import { reportUserOsAction, onOSEvent } from '@/lib/vibeContainerMock';
import { setReportUserActions } from '@/lib';
import i18next from 'i18next';
import { seedMetaFiles } from '@/lib/seedMeta';
import styles from './index.module.scss';

function useWindows() {
  return useSyncExternalStore(subscribe, getWindows);
}

/** Lucide icon name to component mapping */
const ICON_MAP: Record<string, LucideIcon> = {
  Radio,
  MessageCircle,
  Activity,
  ShieldAlert,
  TrendingUp,
  Mail,
  AlertTriangle,
  Building2,
  Search,
  BookOpen,
  Briefcase,
  Rocket,
  HardDrive,
};

const DESKTOP_APPS = getDesktopApps().map((app) => ({
  ...app,
  IconComp: ICON_MAP[app.icon] || MessageCircle,
}));

const VIDEO_WALLPAPER =
  'https://cdn.openroom.ai/public-cdn-s3-us-west-2/talkie-op-img/1609284623_1772622757413_1.mp4';

const STATIC_WALLPAPER =
  'https://cdn.openroom.ai/public-cdn-s3-us-west-2/talkie-op-img/image/437110625_1772619481913_Aoi_default_Commander_Room.jpg';

function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|mov|ogg)$/.test(pathname);
  } catch {
    return false;
  }
}

const Shell: React.FC = () => {
  const [chatOpen, setChatOpen] = useState(true);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [liveWallpaper, setLiveWallpaper] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [wallpaper, setWallpaper] = useState(VIDEO_WALLPAPER);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const pipRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const windows = useWindows();

  const bgWallpaper = isVideoUrl(wallpaper) ? STATIC_WALLPAPER : wallpaper;
  const showVideo = liveWallpaper && isVideoUrl(wallpaper);

  const PIP_W = 200;
  const PIP_H = 280;

  useEffect(() => {
    if (!pipPos && barRef.current) {
      const bar = barRef.current.getBoundingClientRect();
      const barCenterX = bar.left + bar.width / 2;
      setPipPos({
        x: barCenterX - PIP_W / 2,
        y: bar.top - PIP_H - 16,
      });
    }
  }, [pipPos]);

  const handlePipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button') || !pipPos) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pipPos.x, origY: pipPos.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPipPos({
          x: Math.max(0, Math.min(window.innerWidth - PIP_W, dragRef.current.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - PIP_H, dragRef.current.origY + dy)),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pipPos],
  );

  const handleToggleReport = useCallback(() => {
    setReportEnabled((prev) => {
      const next = !prev;
      setReportUserActions(next);
      return next;
    });
  }, []);

  const handleToggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'en' ? 'zh' : 'en';
      i18next.changeLanguage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    seedMetaFiles();
  }, []);

  // Listen for OS events (e.g. wallpaper changes from agent)
  useEffect(() => {
    return onOSEvent((event) => {
      if (event.type === 'SET_WALLPAPER' && typeof event.wallpaper_url === 'string') {
        setWallpaper(event.wallpaper_url);
      }
    });
  }, []);

  return (
    <div
      className={styles.shell}
      data-testid="shell"
      style={{
        backgroundImage: `url(${bgWallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {showVideo && pipPos && (
        <div
          ref={pipRef}
          className={styles.videoPip}
          style={{ left: pipPos.x, top: pipPos.y, bottom: 'auto' }}
          onMouseDown={handlePipMouseDown}
          data-testid="video-pip"
        >
          <video src={wallpaper} autoPlay loop muted playsInline />
          <button className={styles.pipClose} onClick={() => setLiveWallpaper(false)} title="Close">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Desktop with app icons */}
      <div className={styles.desktop} data-testid="desktop">
        <div className={styles.iconGrid}>
          {DESKTOP_APPS.map((app) => (
            <button
              key={app.appId}
              className={styles.appIcon}
              data-testid={`app-icon-${app.appId}`}
              onDoubleClick={() => {
                openWindow(app.appId);
                reportUserOsAction('OPEN_APP', { app_id: String(app.appId) });
              }}
              title={`Double-click to open ${app.displayName}`}
            >
              <div
                className={styles.iconCircle}
                style={{ background: `${app.color}22`, borderColor: `${app.color}44` }}
              >
                <app.IconComp size={24} color={app.color} />
              </div>
              <span className={styles.iconLabel}>{app.displayName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* App windows */}
      {windows.map((win) => (
        <AppWindow key={win.appId} win={win} />
      ))}

      {/* Chat Panel — always mounted to preserve chat history */}
      <ChatPanel onClose={() => setChatOpen(false)} visible={chatOpen} />

      {/* Bridge — connects external agents (Claude Code, OpenClaw) */}
      <BridgeConnector />

      <div ref={barRef} className={`${styles.bottomBar} ${chatOpen ? styles.chatOpen : ''}`}>
        <button
          className={`${styles.barBtn} ${liveWallpaper ? styles.liveOn : styles.liveOff}`}
          onClick={() => setLiveWallpaper((prev) => !prev)}
          title={liveWallpaper ? 'Live wallpaper: ON' : 'Live wallpaper: OFF'}
          data-testid="wallpaper-toggle"
        >
          {liveWallpaper ? <Video size={16} /> : <VideoOff size={16} />}
        </button>

        <button
          className={`${styles.barBtn} ${styles.langBtn}`}
          onClick={handleToggleLang}
          title={lang === 'en' ? 'Switch to Chinese' : 'Switch to English'}
          data-testid="lang-toggle"
        >
          {lang === 'en' ? 'EN' : 'ZH'}
        </button>

        <button
          className={`${styles.barBtn} ${reportEnabled ? styles.reportOn : styles.reportOff}`}
          onClick={handleToggleReport}
          title={reportEnabled ? 'User action reporting: ON' : 'User action reporting: OFF'}
          data-testid="report-toggle"
        >
          <Radio size={16} />
        </button>

        <button
          className={`${styles.barBtn} ${styles.chatBtn}`}
          onClick={() => setChatOpen(!chatOpen)}
          title="Toggle Chat"
          data-testid="chat-toggle"
        >
          <MessageCircle size={18} />
        </button>
      </div>
    </div>
  );
};

export default Shell;
