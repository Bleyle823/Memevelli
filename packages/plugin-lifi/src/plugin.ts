// ─────────────────────────────────────────────────────────
//  plugin-lifi — Main Plugin definition
//  Wires together all actions, providers, service, routes
// ─────────────────────────────────────────────────────────

import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';

// Service
import { LiFiService } from './service.js';

// Actions
import { getQuoteAction } from './actions/getQuote.action.js';
import { executeBuyAction } from './actions/executeBuy.action.js';
import { executeSellAction } from './actions/executeSell.action.js';
import { getStatusAction } from './actions/getStatus.action.js';
import { getChainsAction } from './actions/getChains.action.js';
import { getTokenInfoAction } from './actions/getTokenInfo.action.js';
import { checkBalanceAction } from './actions/checkBalance.action.js';

// Providers
import { portfolioProvider } from './providers/portfolio.provider.js';
import { sentimentProvider } from './providers/sentiment.provider.js';
import { marketProvider } from './providers/market.provider.js';

// Routes
import { createStateRoute } from './routes/state.route.js';
import { createEventsRoute } from './routes/events.route.js';

// ── Config schema
const configSchema = z.object({
    LIFI_API_KEY: z.string().optional(),
    WALLET_PRIVATE_KEY: z.string().optional(),
    WALLET_ADDRESS: z.string().optional(),
    APIFY_TOKEN: z.string().optional(),
    NT_DEMO_MODE: z.string().optional(),
});


export const lifiPlugin: Plugin = {
    name: '@elizaos/plugin-lifi',
    description:
        'LI.FI cross-chain swap & bridge plugin for NarrativeTrader. ' +
        'Executes meme coin trades across Base, ETH, Arbitrum, BSC and more. ' +
        'Provides sentiment scoring, position tracking, and SSE event streaming for the Arena UI.',

    config: {
        LIFI_API_KEY: process.env.LIFI_API_KEY,
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
        WALLET_ADDRESS: process.env.WALLET_ADDRESS,
        APIFY_TOKEN: process.env.APIFY_TOKEN,
        NT_DEMO_MODE: process.env.NT_DEMO_MODE,
    },

    async init(config: Record<string, string>, runtime: IAgentRuntime) {
        try {
            const validated = await configSchema.parseAsync(config);
            logger.info('[plugin-lifi] Configuration validated ✓');

            const walletKey = runtime.getSetting('WALLET_PRIVATE_KEY');
            const walletAddr = runtime.getSetting('WALLET_ADDRESS');
            const apifyToken = runtime.getSetting('APIFY_TOKEN');
            const demoMode = runtime.getSetting('NT_DEMO_MODE');

            if (!walletKey && !walletAddr) {
                logger.warn('[plugin-lifi] No wallet configured — running in read-only mode (no trades)');
            }
            if (!apifyToken) {
                logger.info('[plugin-lifi] No APIFY_TOKEN — sentiment will use mock data');
            }
            if (demoMode === 'true') {
                logger.info('[plugin-lifi] DEMO MODE enabled — pre-scripted events will fire');
            }
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`[plugin-lifi] Invalid config: ${error.issues.map(i => i.message).join(', ')}`);
            }
            throw error;
        }
    },

    services: [LiFiService],

    actions: [
        getQuoteAction,
        executeBuyAction,
        executeSellAction,
        getStatusAction,
        getChainsAction,
        getTokenInfoAction,
        checkBalanceAction,
    ],

    providers: [
        portfolioProvider,
        sentimentProvider,
        marketProvider,
    ],

    // ElizaOS v2 routes API — registered on the runtime's HTTP server
    get routes() {
        const serviceMap = LiFiService.getServiceMap();
        return [
            createStateRoute(serviceMap),
            createEventsRoute(serviceMap),
        ];
    },
};

export default lifiPlugin;
