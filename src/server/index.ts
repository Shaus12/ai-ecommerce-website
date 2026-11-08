/**
 * The company server: REST API, live websocket feed, and the dashboard.
 * One process, one database. This is what runs on the VPS.
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';

import { migrate, closeDb, query } from '../core/db.js';
import { bus, startBusListener, stopBusListener } from '../core/bus.js';
import { startScheduler, stopScheduler, setPaused, loadPausedDecision } from './scheduler.js';
import { apiRoutes } from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 1_048_576,
});

/**
 * Single shared password. The dashboard shows live business data and can
 * trigger spend approvals, so it must not sit open on a public IP.
 */
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';

app.addHook('onRequest', async (req, reply) => {
  if (!PASSWORD) return; // local development
  if (req.url === '/api/health' || !req.url.startsWith('/api')) return;

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== PASSWORD) {
    return reply.code(401).send({ error: 'unauthorised' });
  }
});

await app.register(websocket);
await app.register(apiRoutes);

/** Live activity feed — every agent event, pushed as it happens. */
app.get('/ws', { websocket: true }, (socket, req) => {
  if (PASSWORD) {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    if (url.searchParams.get('token') !== PASSWORD) {
      socket.close(1008, 'unauthorised');
      return;
    }
  }

  const forward = (event: unknown) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  };

  bus.on('event', forward);
  socket.on('close', () => bus.off('event', forward));
  socket.on('error', () => bus.off('event', forward));
  forward({ type: 'hello', at: new Date().toISOString() });
});

// Serve the built dashboard when it exists; otherwise the API still runs.
const webDist = path.resolve(here, '../../src/web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn('dashboard build not found at %s — run: npm --prefix src/web run build', webDist);
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  stopScheduler();
  await stopBusListener();
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

const port = Number(process.env.PORT ?? 8080);

/**
 * Without working credentials every scheduled shift would fail against the
 * API, so start paused and say why rather than burning runs on 401s.
 */
function credentialsLookUsable(): boolean {
  const key = process.env.ANTHROPIC_API_KEY ?? '';
  if (key && !key.includes('...')) return true;
  return Boolean(process.env.ANTHROPIC_AUTH_TOKEN);
}

try {
  await migrate();
  await startBusListener();

  const [row] = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM agents`);
  if (!row || row.count === 0) {
    app.log.warn('no agents on the roster — run: npm run seed');
  } else {
    app.log.info('%d agents on the roster', row.count);
  }

  await app.listen({ port, host: '0.0.0.0' });

  // The owner decides when shifts start costing money, not the boot sequence:
  // their last dashboard decision wins, and the env flag only covers first boot.
  const decision = await loadPausedDecision();
  const startPaused = decision ?? process.env.SCHEDULER_START_PAUSED === 'true';
  if (credentialsLookUsable() && !startPaused) {
    startScheduler();
    app.log.info('company running — %s', decision === false ? 'resumed from the owner\'s last decision' : 'no pause configured');
  } else {
    setPaused(true);
    startScheduler();
    app.log.warn(
      !credentialsLookUsable()
        ? 'ANTHROPIC_API_KEY is missing or still a placeholder — the company is ' +
            'paused. Put a real key in .env, then press "הפעל הכל" in the dashboard.'
        : decision === true
          ? 'company paused — the owner paused it from the dashboard.'
          : 'SCHEDULER_START_PAUSED=true — agents stay paused until you press "הפעל הכל" in the dashboard.',
    );
  }

  if (!PASSWORD) {
    app.log.warn('DASHBOARD_PASSWORD is empty — the dashboard is unauthenticated');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
