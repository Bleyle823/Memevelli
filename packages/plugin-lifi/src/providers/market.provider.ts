// ─────────────────────────────────────────────────────────
//  Provider: MARKET_PROVIDER
//  Fetches live token prices via LI.FI REST API /token
// ─────────────────────────────────────────────────────────

import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { MEME_COINS, WATCHED_TICKERS, LIFI_BASE_URL } from '../constants.js';

// Cache prices for 30 seconds to avoid rate-limiting
const priceCache = new Map<string, { price: number; ts: number }>();
const PRICE_TTL = 30_000;

export async function getTokenPrice(ticker: string): Promise<number> {
    const now = Date.now();
    const cached = priceCache.get(ticker);
    if (cached && now - cached.ts < PRICE_TTL) return cached.price;

    const coin = MEME_COINS[ticker];
    if (!coin) return 0;

    try {
        const headers: Record<string, string> = {};
        if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;

        const res = await fetch(
            `${LIFI_BASE_URL}/token?chain=${coin.chainId}&token=${coin.address}`,
            { headers }
        );
        if (!res.ok) return 0;
        const data = await res.json() as any;
        const price = parseFloat(data.priceUSD ?? '0');
        priceCache.set(ticker, { price, ts: now });
        return price;
    } catch (e) {
        logger.debug(`[MARKET_PROVIDER] Price fetch failed for ${ticker}`);
        return 0;
    }
}

export const marketProvider: Provider = {
    name: 'MARKET_PROVIDER',
    description: 'Provides current token prices for all watched meme coins via LI.FI APIs.',

    get: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
    ): Promise<ProviderResult> => {
        const prices: Record<string, number> = {};

        await Promise.all(
            WATCHED_TICKERS.map(async ticker => {
                prices[ticker] = await getTokenPrice(ticker);
            })
        );

        const text = [
            '=== CURRENT MARKET PRICES ===',
            ...WATCHED_TICKERS.map(t =>
                `  $${t}: $${prices[t]?.toFixed(8) ?? 'unavailable'} (${MEME_COINS[t]?.chainKey})`
            ),
            '=============================',
        ].join('\n');

        return { text, values: prices, data: { prices } };
    },
};
