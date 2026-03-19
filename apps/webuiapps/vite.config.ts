import { UserConfigExport, ConfigEnv, loadEnv } from 'vite';
import type { PluginOption, Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import autoprefixer from 'autoprefixer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { generateLogFileName, createLogMiddleware } from './src/lib/logPlugin';
import { WebSocketServer, WebSocket } from 'ws';

const LLM_CONFIG_FILE = resolve(os.homedir(), '.openroom', 'config.json');
const SESSIONS_DIR = resolve(os.homedir(), '.openroom', 'sessions');
const CHARACTERS_FILE = resolve(os.homedir(), '.openroom', 'characters.json');
const MODS_FILE = resolve(os.homedir(), '.openroom', 'mods.json');
const CLODETTE_DB = resolve(os.homedir(), 'clawd', 'data', 'clodette.db');

// ============ WebSocket Bridge Plugin ============
// Allows external agents (Claude Code, OpenClaw) to send commands into OpenRoom

const BRIDGE_PORT = 3001;
const bridgeClients = new Set<WebSocket>();
// Pending actions from external agents, polled by the browser client
const pendingActions: Array<{ id: string; type: string; payload: unknown }> = [];
// Results from the browser, keyed by action id
const actionResults = new Map<string, { resolve: (v: string) => void; timeout: NodeJS.Timeout }>();

function wsBridgePlugin(): Plugin {
  return {
    name: 'ws-bridge',
    configureServer(server) {
      // WebSocket server for external agents
      const wss = new WebSocketServer({ port: BRIDGE_PORT });
      console.log(`[WS-BRIDGE] WebSocket bridge listening on ws://localhost:${BRIDGE_PORT}`);

      wss.on('connection', (ws) => {
        bridgeClients.add(ws);
        console.log(`[WS-BRIDGE] Agent connected (${bridgeClients.size} total)`);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            const id = msg.id || `bridge-${Date.now()}`;
            console.log(`[WS-BRIDGE] Received: ${msg.type} id=${id}`);

            // Queue the action for the browser to pick up
            pendingActions.push({ id, type: msg.type, payload: msg });

            // Wait for result from browser (timeout 15s)
            const promise = new Promise<string>((resolve) => {
              const timeout = setTimeout(() => {
                actionResults.delete(id);
                resolve(JSON.stringify({ id, success: false, error: 'timeout' }));
              }, 15000);
              actionResults.set(id, { resolve, timeout });
            });

            promise.then((result) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(result);
              }
            });
          } catch (err) {
            ws.send(JSON.stringify({ error: 'invalid JSON' }));
          }
        });

        ws.on('close', () => {
          bridgeClients.delete(ws);
          console.log(`[WS-BRIDGE] Agent disconnected (${bridgeClients.size} total)`);
        });
      });

      // HTTP endpoints for the browser to poll/push
      // GET /api/bridge/poll — browser fetches pending actions
      server.middlewares.use('/api/bridge/poll', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const actions = pendingActions.splice(0, pendingActions.length);
        res.end(JSON.stringify(actions));
      });

      // POST /api/bridge/result — browser sends back action results
      server.middlewares.use('/api/bridge/result', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const { id, result } = body;
            const pending = actionResults.get(id);
            if (pending) {
              clearTimeout(pending.timeout);
              actionResults.delete(id);
              pending.resolve(JSON.stringify({ id, success: true, data: result }));
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid body' }));
          }
        });
      });

      // GET /api/bridge/status — health check
      server.middlewares.use('/api/bridge/status', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            bridge: 'active',
            port: BRIDGE_PORT,
            connectedAgents: bridgeClients.size,
            pendingActions: pendingActions.length,
          }),
        );
      });

      // POST /api/bridge/event — write an event to clodette.db agent_events table
      server.middlewares.use('/api/bridge/event', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const { agent, event_type, target, app, payload } = body;
            if (!agent || !event_type) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing required fields: agent, event_type' }));
              return;
            }
            const now = new Date().toISOString();
            const payloadStr = payload ? JSON.stringify(payload).replace(/'/g, "''") : '';
            const sql = `INSERT INTO agent_events (agent, event_type, target, app, payload, created_at) VALUES ('${agent.replace(/'/g, "''")}', '${event_type.replace(/'/g, "''")}', '${(target || '').replace(/'/g, "''")}', '${(app || '').replace(/'/g, "''")}', '${payloadStr}', '${now}');`;
            execSync(`sqlite3 '${CLODETTE_DB}' "${sql}"`, { timeout: 5000 });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, created_at: now }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });

      // GET /api/bridge/events — read recent events from agent_events table
      server.middlewares.use('/api/bridge/events', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const agent = url.searchParams.get('agent') || '';
          const limit = parseInt(url.searchParams.get('limit') || '50', 10);
          const since = url.searchParams.get('since') || '';

          let where = 'WHERE 1=1';
          if (agent) where += ` AND agent='${agent.replace(/'/g, "''")}'`;
          if (since) where += ` AND created_at>'${since.replace(/'/g, "''")}'`;
          const sql = `SELECT * FROM agent_events ${where} ORDER BY created_at DESC LIMIT ${limit};`;
          const raw = execSync(`sqlite3 -json '${CLODETTE_DB}' "${sql}"`, { timeout: 5000 })
            .toString()
            .trim();
          const events = raw ? JSON.parse(raw) : [];
          res.writeHead(200);
          res.end(JSON.stringify(events));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

/** LLM config persistence plugin — reads/writes config to ~/.openroom/config.json */
function llmConfigPlugin(): Plugin {
  return {
    name: 'llm-config',
    configureServer(server) {
      server.middlewares.use('/api/llm-config', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(LLM_CONFIG_FILE)) {
              const content = fs.readFileSync(LLM_CONFIG_FILE, 'utf-8');
              res.writeHead(200);
              res.end(content);
            } else {
              res.writeHead(200);
              res.end('{}');
            }
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString();
              // Validate JSON before writing
              JSON.parse(body);
              fs.mkdirSync(resolve(os.homedir(), '.openroom'), { recursive: true });
              fs.writeFileSync(LLM_CONFIG_FILE, body, 'utf-8');
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

/**
 * Session data plugin — reads/writes files under ~/.openroom/sessions/
 * API: /api/session-data?path={charId}/{modId}/chat/history.json
 * Supports GET, POST, DELETE.
 */
function sessionDataPlugin(): Plugin {
  return {
    name: 'session-data',
    configureServer(server) {
      server.middlewares.use('/api/session-data', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        const url = new URL(req.url || '', 'http://localhost');
        const relPath = url.searchParams.get('path') || '';
        const action = url.searchParams.get('action') || '';

        if (!relPath) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        // Sanitize: only allow alphanumeric, underscore, hyphen, dot, forward slash
        const safePath = relPath.replace(/[^a-zA-Z0-9_\-./]/g, '_').replace(/\.\./g, '');
        const filePath = join(SESSIONS_DIR, safePath);

        // Directory listing: ?action=list&path=...
        if (action === 'list' && req.method === 'GET') {
          try {
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isDirectory()) {
              res.writeHead(200);
              res.end(JSON.stringify({ files: [], not_exists: !fs.existsSync(filePath) }));
              return;
            }
            const entries = fs.readdirSync(filePath, { withFileTypes: true });
            const files = entries.map((e) => ({
              path: safePath === '' || safePath === '/' ? e.name : `${safePath}/${e.name}`,
              type: e.isDirectory() ? 1 : 0,
              size: e.isDirectory() ? 0 : fs.statSync(join(filePath, e.name)).size,
            }));
            res.writeHead(200);
            res.end(JSON.stringify({ files, not_exists: false }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              const ext = filePath.split('.').pop()?.toLowerCase() || '';
              const binaryMimes: Record<string, string> = {
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                svg: 'image/svg+xml',
                mp4: 'video/mp4',
                webm: 'video/webm',
              };
              const mime = binaryMimes[ext];
              if (mime) {
                res.setHeader('Content-Type', mime);
                res.writeHead(200);
                res.end(fs.readFileSync(filePath));
              } else {
                res.writeHead(200);
                res.end(fs.readFileSync(filePath, 'utf-8'));
              }
            } else {
              res.writeHead(200);
              res.end('{}');
            }
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const buf = Buffer.concat(chunks);
              const dir = filePath.substring(0, filePath.lastIndexOf('/'));
              fs.mkdirSync(dir, { recursive: true });
              const ct = (req.headers['content-type'] || '').toLowerCase();
              if (
                ct.startsWith('image/') ||
                ct.startsWith('video/') ||
                ct === 'application/octet-stream'
              ) {
                fs.writeFileSync(filePath, buf);
              } else {
                fs.writeFileSync(filePath, buf.toString(), 'utf-8');
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        if (req.method === 'DELETE') {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });

      // Session reset: DELETE /api/session-data?action=reset&path={charId}/{modId}
      // Recursively removes the entire session directory
      server.middlewares.use('/api/session-reset', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'DELETE') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const url = new URL(req.url || '', 'http://localhost');
        const relPath = url.searchParams.get('path') || '';
        if (!relPath) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        const safePath = relPath.replace(/[^a-zA-Z0-9_\-./]/g, '_').replace(/\.\./g, '');
        const targetDir = join(SESSIONS_DIR, safePath);

        try {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

/** Debug log plugin — writes browser logs to logs/debug-*.log */
function logServerPlugin(): Plugin {
  return {
    name: 'log-server',
    configureServer(server) {
      const logDir = join(__dirname, 'logs');
      const logFile = join(logDir, generateLogFileName());
      const middleware = createLogMiddleware(logFile, fs);

      server.middlewares.use('/api/log', middleware);

      server.httpServer?.once('listening', () => {
        console.log(`\n  [DebugLog] Writing to: ${logFile}\n`);
      });
    },
  };
}

/** LLM API proxy plugin — resolves browser CORS restrictions */
function llmProxyPlugin(): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm-proxy', async (req, res) => {
        const targetUrl = req.headers['x-llm-target-url'] as string;
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing X-LLM-Target-URL header' }));
          return;
        }
        console.log('[LLM-PROXY] Target:', targetUrl, 'Method:', req.method);
        console.log(
          '[LLM-PROXY] Headers:',
          JSON.stringify(
            Object.fromEntries(
              Object.entries(req.headers).filter(([k]) => !k.startsWith('sec-') && k !== 'cookie'),
            ),
          ),
        );
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const headers: Record<string, string> = {
              'content-type': 'application/json',
            };
            // Only forward essential auth headers, skip CF/tunnel headers
            const allowKeys = new Set(['authorization', 'x-api-key', 'anthropic-version']);
            for (const [key, val] of Object.entries(req.headers)) {
              if (typeof val !== 'string') continue;
              if (key.startsWith('x-custom-')) {
                headers[key.replace('x-custom-', '')] = val;
              } else if (allowKeys.has(key)) {
                headers[key] = val;
              }
            }

            console.log('[LLM-PROXY] Forwarding to:', targetUrl);
            const fetchRes = await fetch(targetUrl, {
              method: req.method || 'POST',
              headers,
              body,
            });
            console.log('[LLM-PROXY] Response status:', fetchRes.status);

            res.writeHead(fetchRes.status, {
              'Content-Type': fetchRes.headers.get('Content-Type') || 'application/json',
              'Transfer-Encoding': 'chunked',
            });

            if (fetchRes.body) {
              const reader = (fetchRes.body as ReadableStream<Uint8Array>).getReader();
              const pump = async () => {
                let done = false;
                while (!done) {
                  const result = await reader.read();
                  done = result.done;
                  if (!done) res.write(result.value);
                }
                res.end();
              };
              pump().catch(() => res.end());
            } else {
              const text = await fetchRes.text();
              res.end(text);
            }
          } catch (err: unknown) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });
    },
  };
}

/** Generic local service proxy — forwards requests to localhost services, bypassing CORS */
function localServiceProxyPlugin(): Plugin {
  return {
    name: 'local-service-proxy',
    configureServer(server) {
      server.middlewares.use('/api/local-proxy', async (req, res) => {
        const targetUrl = req.headers['x-target-url'] as string;
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
          return;
        }

        // Security: only allow proxying to localhost
        if (
          !targetUrl.startsWith('http://localhost:') &&
          !targetUrl.startsWith('http://127.0.0.1:')
        ) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden: only localhost targets allowed' }));
          return;
        }

        console.log(`[LOCAL-PROXY] ${req.method} -> ${targetUrl}`);

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks);
            const headers: Record<string, string> = {};
            // Forward content-type and accept headers
            if (req.headers['content-type'])
              headers['content-type'] = req.headers['content-type'] as string;
            if (req.headers['accept']) headers['accept'] = req.headers['accept'] as string;
            if (req.headers['authorization'])
              headers['authorization'] = req.headers['authorization'] as string;
            // Forward any x-custom- prefixed headers (strip prefix)
            for (const [key, val] of Object.entries(req.headers)) {
              if (typeof val !== 'string') continue;
              if (key.startsWith('x-custom-')) {
                headers[key.replace('x-custom-', '')] = val;
              }
            }

            const fetchOpts: RequestInit = {
              method: req.method || 'GET',
              headers,
            };
            // Only include body for methods that support it
            if (req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0) {
              fetchOpts.body = body;
            }

            const fetchRes = await fetch(targetUrl, fetchOpts);

            // Forward response headers
            const resHeaders: Record<string, string> = {
              'Content-Type': fetchRes.headers.get('Content-Type') || 'application/octet-stream',
            };

            res.writeHead(fetchRes.status, resHeaders);

            if (fetchRes.body) {
              const reader = (fetchRes.body as ReadableStream<Uint8Array>).getReader();
              let done = false;
              while (!done) {
                const result = await reader.read();
                done = result.done;
                if (!done) res.write(result.value);
              }
              res.end();
            } else {
              const text = await fetchRes.text();
              res.end(text);
            }
          } catch (err: unknown) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });
    },
  };
}

/** Generic JSON file persistence plugin factory */
function jsonFilePlugin(name: string, apiPath: string, filePath: string): Plugin {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(apiPath, (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              res.writeHead(200);
              res.end(fs.readFileSync(filePath, 'utf-8'));
            } else {
              res.writeHead(200);
              res.end('{}');
            }
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString();
              JSON.parse(body);
              fs.mkdirSync(resolve(os.homedir(), '.openroom'), { recursive: true });
              fs.writeFileSync(filePath, body, 'utf-8');
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

const config = ({ mode }: ConfigEnv): UserConfigExport => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';
  const isAnalyze = env.ANALYZE === 'analyze';
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN;
  const bizProjectName = env.BIZ_PROJECT_NAME || '';

  // Calculate asset base path
  // - Production: CDN address
  // - Test: sub-path /webuiapps/
  // - Development: /
  const getBase = () => {
    if (isProd && env.CDN_PREFIX) {
      return env.CDN_PREFIX + '/' + bizProjectName;
    }
    if ((isTest || isProd) && bizProjectName) {
      return '/' + bizProjectName + '/';
    }
    return '/';
  };
  const skipLegacy = env.VITE_SKIP_LEGACY === 'true';
  const plugins: PluginOption[] = [
    wsBridgePlugin(),
    localServiceProxyPlugin(),
    llmConfigPlugin(),
    sessionDataPlugin(),
    logServerPlugin(),
    llmProxyPlugin(),
    jsonFilePlugin('characters', '/api/characters', CHARACTERS_FILE),
    jsonFilePlugin('mods', '/api/mods', MODS_FILE),
    react(),
    ...(skipLegacy
      ? []
      : [
          legacy({
            targets: ['defaults', 'not ie <= 11', 'chrome 80'],
            additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
            renderLegacyChunks: true,
            modernPolyfills: true,
          }),
        ]),
  ];

  /** Only import when running in analyze mode */
  if (isAnalyze) {
    plugins.push(
      visualizer({
        gzipSize: true,
        open: true,
        filename: `${env.APP_NAME}-chunk.html`,
      }),
    );
  }

  if (isProd && sentryAuthToken) {
    plugins.push(
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: env.SENTRY_ORG || '',
        project: env.SENTRY_PROJECT || '',
        url: env.SENTRY_URL || undefined,
        sourcemaps: {
          filesToDeleteAfterUpload: ['dist/**/*.js.map'],
        },
      }),
    );
  }

  return {
    plugins,
    css: {
      postcss: {
        plugins: [autoprefixer({})],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@gui/vibe-container': resolve(__dirname, './src/lib/vibeContainerMock.ts'),
      },
    },
    base: getBase(),
    server: {
      host: true,
      port: 3000,
      allowedHosts: ['openroom.markt30a.com'],
    },
    define: {
      __APP__: JSON.stringify(env.APP_ENVIRONMENT),
      __ROUTER_BASE__: JSON.stringify(bizProjectName ? '/' + bizProjectName : ''),
      __ENV__: JSON.stringify(env.NODE_ENV),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/styles/[name]-[hash][extname]'; // Output to /dist/assets/styles directory
            }
            if (/\.(png|jpe?g|gif|svg)$/.test(assetInfo.name || '')) {
              return 'assets/images/[name]-[hash][extname]'; // Output to /dist/assets/images directory
            }

            if (/\.(ttf)$/.test(assetInfo.name || '')) {
              return 'assets/fonts/[name]-[hash][extname]'; // Output to /dist/assets/fonts directory
            }

            return '[name]-[hash][extname]'; // Default output for other assets
          },
        },
      },
      minify: true,
      chunkSizeWarningLimit: 1500,
      cssTarget: 'chrome61',
      sourcemap: isProd, // Source map generation must be turned on
      manifest: true,
    },
  };
};

export default config;
