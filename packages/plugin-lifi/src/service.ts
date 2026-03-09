// ─────────────────────────────────────────────────────────
//  LiFiService — singleton service managing SDK, wallet,
//  positions, SSE broadcast, and price polling
// ─────────────────────────────────────────────────────────

import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { createConfig, EVM, type Route } from '@lifi/sdk';
import {
    createWalletClient,
    createPublicClient,
    http,
    type WalletClient,
    type PublicClient,
    parseUnits,
    formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    CHAIN_IDS,
    USDC_ADDRESSES,
    MEME_COINS,
    WATCHED_TICKERS,
    LIFI_INTEGRATOR,
    LIFI_BASE_URL,
    MAX_POSITIONS,
    MAX_EXPOSURE_USD,
    STOP_LOSS_PCT,
    TAKE_PROFIT_PCT,
} from './constants.js';
import type { Position, TradeEvent, AgentPortfolio } from './types.js';

// Map viem chain ids to viem chain objects
import {
    mainnet, bsc, polygon, arbitrum, optimism, base, avalanche,
} from 'viem/chains';

const VIEM_CHAINS: Record<number, any> = {
    [CHAIN_IDS.ETH]: mainnet,
    [CHAIN_IDS.BSC]: bsc,
    [CHAIN_IDS.POL]: polygon,
    [CHAIN_IDS.ARB]: arbitrum,
    [CHAIN_IDS.OPT]: optimism,
    [CHAIN_IDS.BASE]: base,
    [CHAIN_IDS.AVA]: avalanche,
};

export class LiFiService extends Service {
    static serviceType = 'lifi';
    capabilityDescription = 'LI.FI cross-chain swap and bridge service for NarrativeTrader';

    // ── Position management
    private static serviceMap = new Map<string, LiFiService>();

    static getServiceMap(): Map<string, LiFiService> {
        return LiFiService.serviceMap;
    }

    // ── State
    private positions: Map<string, Map<string, Position>> = new Map(); // agentId → ticker → Position
    private realizedPnl: Map<string, number> = new Map();              // agentId → USD
    private events: TradeEvent[] = [];
    private sseClients: Set<any> = new Set();
    private pricePollerInterval?: ReturnType<typeof setInterval>;

    // ── Viem
    walletClient?: WalletClient;
    publicClients: Map<number, PublicClient> = new Map();
    private walletClients: Map<number, WalletClient> = new Map();
    walletAddress?: string;
    private apiKey?: string;

    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
    }

    // ── Lifecycle
    static async start(runtime: IAgentRuntime): Promise<LiFiService> {
        logger.info('[plugin-lifi] Starting LiFiService');
        const service = new LiFiService(runtime);
        await service._init();
        return service;
    }

    static async stop(runtime: IAgentRuntime): Promise<void> {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        if (service) await service.stop();
    }

    async stop(): Promise<void> {
        if (this.pricePollerInterval) clearInterval(this.pricePollerInterval);
        this.sseClients.forEach(c => { try { c.end(); } catch { } });
        this.sseClients.clear();
        LiFiService.serviceMap.delete(this.runtime.agentId);
        logger.info('[plugin-lifi] LiFiService stopped');
    }

    private async _init(): Promise<void> {
        this.apiKey = this.runtime.getSetting('LIFI_API_KEY') as string | undefined;
        const privKey = this.runtime.getSetting('WALLET_PRIVATE_KEY') as `0x${string}` | undefined;
        const walletAddr = this.runtime.getSetting('WALLET_ADDRESS') as string | undefined;
        const demoMode = this.runtime.getSetting('NT_DEMO_MODE') as string | undefined;
        const apifyToken = this.runtime.getSetting('APIFY_TOKEN') as string | undefined;

        // ── Init LI.FI SDK
        createConfig({
            integrator: LIFI_INTEGRATOR,
            ...(this.apiKey ? { apiKey: this.apiKey } : {}),
            providers: [
                EVM({
                    getWalletClient: async () => this.walletClient as any,
                    switchChain: async (chainId: number) => {
                        const client = this.getWalletClient(chainId);
                        this.walletClient = client;
                        return client as any;
                    },
                }),
            ],
        });

        // ── Init wallet
        if (privKey) {
            const account = privateKeyToAccount(privKey);
            this.walletAddress = account.address;
            // Use Arbitrum as default chain for wallet; chain is switched per-trade
            this.walletClient = createWalletClient({
                account,
                chain: arbitrum,
                transport: http(),
            });
        } else if (walletAddr) {
            this.walletAddress = walletAddr;
        }

        // ── Init public clients per chain
        for (const [key, chainId] of Object.entries(CHAIN_IDS)) {
            const chain = VIEM_CHAINS[chainId as number];
            if (chain) {
                this.publicClients.set(chainId as number, createPublicClient({
                    chain,
                    transport: http(),
                }));
            }
        }

        // ── Start price polling (every 60s)
        this.pricePollerInterval = setInterval(() => this._updatePrices(), 60_000);

        LiFiService.serviceMap.set(this.runtime.agentId, this);

        if (demoMode === 'true') {
            this._runDemoEvents();
        }

        logger.info(`[plugin-lifi] Initialized. Agent: ${this.runtime.agentId}, Wallet: ${this.walletAddress ?? 'none (read-only mode)'}`);
    }

    getWalletClient(chainId: number): WalletClient {
        const cached = this.walletClients.get(chainId);
        if (cached) return cached;

        const privKey = this.runtime.getSetting('WALLET_PRIVATE_KEY') as `0x${string}`;
        if (!privKey) throw new Error('WALLET_PRIVATE_KEY not set');

        const account = privateKeyToAccount(privKey);
        const chain = VIEM_CHAINS[chainId] || VIEM_CHAINS[CHAIN_IDS.ARB];

        const client = createWalletClient({
            account,
            chain,
            transport: http(),
        });
        this.walletClients.set(chainId, client);
        return client;
    }

    // ── Price polling
    private async _updatePrices(): Promise<void> {
        for (const ticker of WATCHED_TICKERS) {
            const coin = MEME_COINS[ticker];
            try {
                const res = await fetch(
                    `${LIFI_BASE_URL}/token?chain=${coin.chainId}&token=${coin.address}`,
                    this.apiKey
                        ? { headers: { 'x-lifi-api-key': this.apiKey } }
                        : {}
                );
                if (!res.ok) continue;
                const data = await res.json() as any;
                const price = parseFloat(data.priceUSD ?? '0');
                if (!price) continue;

                // Update all open positions for this ticker
                for (const [, agentPositions] of this.positions) {
                    const pos = agentPositions.get(ticker);
                    if (pos) {
                        pos.currentPrice = price;
                        agentPositions.set(ticker, pos);
                    }
                }
            } catch {
                // price fetch failures are non-fatal
            }
        }
    }

    // ── SSE management
    addSSEClient(res: any): void {
        this.sseClients.add(res);
        res.on?.('close', () => this.sseClients.delete(res));
    }

    broadcast(event: TradeEvent): void {
        this.events.unshift(event);
        if (this.events.length > 200) this.events.pop();

        const data = `data: ${JSON.stringify(event)}\n\n`;
        this.sseClients.forEach(client => {
            try { client.write(data); } catch { this.sseClients.delete(client); }
        });
    }

    // ── Position management
    getAgentPositions(agentId: string): Map<string, Position> {
        if (!this.positions.has(agentId)) this.positions.set(agentId, new Map());
        return this.positions.get(agentId)!;
    }

    openPosition(pos: Position): void {
        const agentPositions = this.getAgentPositions(pos.agentId);
        agentPositions.set(pos.ticker, pos);
        logger.info(`[plugin-lifi] Opened position: ${pos.agentId} bought $${pos.ticker}`);
    }

    closePosition(agentId: string, ticker: string, exitPriceUSD: number): number {
        const agentPositions = this.getAgentPositions(agentId);
        const pos = agentPositions.get(ticker);
        if (!pos) return 0;

        const pnl = pos.sizeUSD * ((exitPriceUSD - pos.entryPrice) / pos.entryPrice);
        const realized = this.realizedPnl.get(agentId) ?? 0;
        this.realizedPnl.set(agentId, realized + pnl);
        agentPositions.delete(ticker);
        logger.info(`[plugin-lifi] Closed position: ${agentId} sold $${ticker} PnL=$${pnl.toFixed(2)}`);
        return pnl;
    }

    getPortfolio(agentId: string): AgentPortfolio {
        const positions = Array.from(this.getAgentPositions(agentId).values());
        const totalExposureUSD = positions.reduce((s, p) => s + p.sizeUSD, 0);
        const unrealizedPnlUSD = positions.reduce((s, p) => {
            return s + p.sizeUSD * ((p.currentPrice - p.entryPrice) / p.entryPrice);
        }, 0);
        const realizedPnlUSD = this.realizedPnl.get(agentId) ?? 0;

        return {
            agentId,
            positions,
            totalExposureUSD,
            realizedPnlUSD,
            unrealizedPnlUSD,
            totalPnlUSD: realizedPnlUSD + unrealizedPnlUSD,
        };
    }

    canBuy(agentId: string, ticker: string, sizeUSD: number): { ok: boolean; reason: string } {
        const agentPositions = this.getAgentPositions(agentId);

        if (agentPositions.has(ticker))
            return { ok: false, reason: `Already holding $${ticker}` };

        if (agentPositions.size >= MAX_POSITIONS)
            return { ok: false, reason: `Max ${MAX_POSITIONS} positions reached` };

        const exposure = Array.from(agentPositions.values()).reduce((s, p) => s + p.sizeUSD, 0);
        if (exposure + sizeUSD > MAX_EXPOSURE_USD)
            return { ok: false, reason: `Exposure limit $${MAX_EXPOSURE_USD} would be exceeded` };

        return { ok: true, reason: '' };
    }

    shouldExit(agentId: string, ticker: string): { exit: boolean; reason: string } {
        const pos = this.getAgentPositions(agentId).get(ticker);
        if (!pos) return { exit: false, reason: '' };

        const pnlPct = (pos.currentPrice - pos.entryPrice) / pos.entryPrice;
        if (pnlPct <= -STOP_LOSS_PCT)
            return { exit: true, reason: `Stop-loss at ${(pnlPct * 100).toFixed(1)}%` };
        if (pnlPct >= TAKE_PROFIT_PCT)
            return { exit: true, reason: `Take-profit at +${(pnlPct * 100).toFixed(1)}%` };

        return { exit: false, reason: '' };
    }

    // ── State for API
    getAllEvents(limit = 50): TradeEvent[] {
        return this.events.slice(0, limit);
    }

    getAllPortfolios(agentIds: string[]): AgentPortfolio[] {
        return agentIds.map(id => this.getPortfolio(id));
    }

    // ── Demo mode: fire scripted events for hackathon demo
    private _runDemoEvents(): void {
        const agentId = this.runtime.agentId;
        const agentName = this.runtime.character?.name ?? agentId;

        const demoScenarios: Array<{ delay: number; type: string; ticker: string; reason: string; pnlUSD?: number }> = {
            alpha: [
                { delay: 6000, type: 'BUY', ticker: 'BRETT', reason: 'velocity 2.1x avg, 890 unique accounts, 82% bullish — entering on BASE' },
                { delay: 25000, type: 'BUY', ticker: 'WIF', reason: 'WIF momentum surging on Arbitrum, score 0.78' },
                { delay: 55000, type: 'SELL', ticker: 'BRETT', reason: 'Take-profit hit +40%! $13.20 realized', pnlUSD: 13.2 },
                { delay: 80000, type: 'SELL', ticker: 'WIF', reason: 'Score dropped to 0.38, narrative cooling', pnlUSD: -3.5 },
            ],
            beta: [
                { delay: 10000, type: 'SKIP', ticker: 'BRETT', reason: 'Score 0.74 below my 0.82 threshold — waiting for confirmation' },
                { delay: 35000, type: 'BUY', ticker: 'WIF', reason: 'Score 0.89 confirmed — measured entry on Arbitrum' },
                { delay: 70000, type: 'SELL', ticker: 'WIF', reason: 'Stop-loss at -12% — cut the loss', pnlUSD: -3.96 },
            ],
            gamma: [
                { delay: 8000, type: 'BUY', ticker: 'PEPE', reason: 'Contrarian: crowd is fearful on PEPE (score 0.45), buying the dip on ETH' },
                { delay: 30000, type: 'BUY', ticker: 'BRETT', reason: 'Crowd celebrating $BRETT — contrarian says buy the FOMO' },
                { delay: 62000, type: 'SELL', ticker: 'PEPE', reason: 'Crowd started buying PEPE — time to exit +28%', pnlUSD: 9.24 },
                { delay: 85000, type: 'SELL', ticker: 'BRETT', reason: 'Everyone bullish now — contrarian exit', pnlUSD: 5.6 },
            ],
        }[(this.runtime.character?.name ?? '').toLowerCase()] ?? [];

        const { randomUUID } = require('node:crypto');
        for (const s of demoScenarios) {
            setTimeout(() => {
                this.broadcast({
                    id: randomUUID(), agentId, agentName,
                    type: s.type as any, ticker: s.ticker,
                    reason: s.reason, pnlUSD: s.pnlUSD,
                    ts: new Date().toISOString(),
                });
            }, s.delay);
        }
    }
}
