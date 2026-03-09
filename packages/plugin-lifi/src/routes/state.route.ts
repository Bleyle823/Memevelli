// ─────────────────────────────────────────────────────────
//  Route: GET /api/nt/state
//  Returns full arena state: agents, portfolios, events, sentiment
// ─────────────────────────────────────────────────────────

import type { RouteRequest, RouteResponse } from '@elizaos/core';
import { LiFiService } from '../service.js';
import { getSentiment } from '../providers/sentiment.provider.js';
import { scoreNarrative } from '../providers/sentiment.provider.js';
import { WATCHED_TICKERS } from '../constants.js';

// Agent display metadata (static, configured at plugin init)
export const AGENT_META: Record<string, { name: string; color: string; personality: string; x: number; y: number }> = {
    alpha: { name: 'Alpha', color: '#ff6b35', personality: 'Aggressive Degen', x: 5, y: 8 },
    beta: { name: 'Beta', color: '#4ecdc4', personality: 'Conservative Analyst', x: 13, y: 8 },
    gamma: { name: 'Gamma', color: '#ffe66d', personality: 'Contrarian', x: 21, y: 8 },
};

export function createStateRoute(services: Map<string, LiFiService>) {
    return {
        name: 'nt-state',
        path: '/api/nt/state',
        type: 'GET' as const,
        handler: async (_req: RouteRequest, res: RouteResponse) => {
            // Gather first available service for runtime
            const firstService = services.values().next().value;
            if (!firstService) {
                res.status(503).json({ error: 'No agents active' });
                return;
            }

            // Get sentiment scores using the first agent's runtime settings
            const sentiment = await Promise.all(
                WATCHED_TICKERS.map(async t => {
                    const data = await getSentiment((firstService as any).runtime, t);
                    return scoreNarrative(data);
                })
            );

            // Build agent states from their LiFiService instances
            const agents: Record<string, any> = {};
            for (const [agentId, service] of services.entries()) {
                const portfolio = service.getPortfolio(agentId);
                const meta = AGENT_META[agentId] ?? { name: agentId, color: '#888', personality: 'Unknown', x: 10, y: 10 };
                agents[agentId] = {
                    ...meta,
                    id: agentId,
                    score: portfolio.totalPnlUSD,
                    realizedPnl: portfolio.realizedPnlUSD,
                    unrealizedPnl: portfolio.unrealizedPnlUSD,
                    positions: portfolio.positions.map(p => ({
                        ticker: p.ticker,
                        chain: p.chain,
                        sizeUSD: p.sizeUSD,
                        entryPrice: p.entryPrice,
                        currentPrice: p.currentPrice,
                        pnlPct: ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(1),
                    })),
                };
            }

            // Gather events from first available service
            const events = firstService.getAllEvents(50);

            res.json({ agents, sentiment, events, ts: new Date().toISOString() });
        },
    };
}
