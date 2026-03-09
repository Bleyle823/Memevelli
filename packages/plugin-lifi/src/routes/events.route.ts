// ─────────────────────────────────────────────────────────
//  Route: GET /api/nt/events
//  SSE endpoint — clients subscribe for real-time trade events
// ─────────────────────────────────────────────────────────

import type { RouteRequest, RouteResponse } from '@elizaos/core';
import { LiFiService } from '../service.js';

export function createEventsRoute(services: Map<string, LiFiService>) {
    return {
        name: 'nt-events',
        path: '/api/nt/events',
        type: 'GET' as const,
        handler: async (req: RouteRequest, res: RouteResponse) => {
            // Set SSE headers
            const rawRes = (res as any).raw ?? res;
            rawRes.setHeader('Content-Type', 'text/event-stream');
            rawRes.setHeader('Cache-Control', 'no-cache');
            rawRes.setHeader('Connection', 'keep-alive');
            rawRes.setHeader('Access-Control-Allow-Origin', '*');
            rawRes.flushHeaders?.();

            // Send initial ping
            rawRes.write('data: {"type":"CONNECTED"}\n\n');

            // Register with each service so all agent events flow to this client
            for (const service of services.values()) {
                service.addSSEClient(rawRes);
            }

            // Heartbeat every 25s to keep connection alive
            const heartbeat = setInterval(() => {
                try { rawRes.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
            }, 25_000);

            const cleanup = () => {
                clearInterval(heartbeat);
                for (const service of services.values()) {
                    service['sseClients'].delete(rawRes);
                }
            };

            rawRes.on?.('close', cleanup);
            rawRes.on?.('error', cleanup);
        },
    };
}
