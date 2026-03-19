/**
 * BridgeConnector — Polls the WS bridge for external agent commands
 * and dispatches them into the OpenRoom event bus.
 *
 * This enables Claude Code and OpenClaw to control OpenRoom apps
 * from outside the browser.
 */
import { useEffect, useRef } from 'react';
import { dispatchAgentAction } from '@/lib/vibeContainerMock';
import { resolveAppAction, APP_REGISTRY } from '@/lib/appRegistry';

const POLL_INTERVAL = 500; // ms

interface BridgeAction {
  id: string;
  type: string;
  payload: {
    app_name?: string;
    action_type?: string;
    params?: Record<string, string>;
    content?: string;
    [key: string]: unknown;
  };
}

async function sendResult(id: string, result: unknown) {
  try {
    await fetch('/api/bridge/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, result }),
    });
  } catch (err) {
    console.error('[Bridge] Failed to send result:', err);
  }
}

async function handleAction(action: BridgeAction) {
  const { id, type, payload } = action;
  console.log('[Bridge] Handling action:', type, id);

  try {
    if (type === 'app_action') {
      const { app_name, action_type, params } = payload;
      if (!app_name || !action_type) {
        await sendResult(id, { error: 'missing app_name or action_type' });
        return;
      }

      const resolved = resolveAppAction(app_name, action_type);
      if (typeof resolved === 'string') {
        await sendResult(id, { error: resolved });
        return;
      }

      const result = await dispatchAgentAction({
        app_id: resolved.appId,
        action_type: resolved.actionType,
        params: params || {},
      });
      await sendResult(id, { action: action_type, result });
    } else if (type === 'list_apps') {
      const apps = APP_REGISTRY.filter((a) => a.appName !== 'os').map((a) => ({
        appId: a.appId,
        appName: a.appName,
        displayName: a.displayName,
      }));
      await sendResult(id, { apps });
    } else if (type === 'ping') {
      await sendResult(id, { pong: true, timestamp: Date.now() });
    } else {
      await sendResult(id, { error: `unknown action type: ${type}` });
    }
  } catch (err) {
    await sendResult(id, { error: err instanceof Error ? err.message : String(err) });
  }
}

export default function BridgeConnector() {
  const polling = useRef(false);

  useEffect(() => {
    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const res = await fetch('/api/bridge/poll');
        if (res.ok) {
          const actions: BridgeAction[] = await res.json();
          for (const action of actions) {
            await handleAction(action);
          }
        }
      } catch {
        // Server not ready yet, ignore
      } finally {
        polling.current = false;
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // This component renders nothing — it's a background service
  return null;
}
