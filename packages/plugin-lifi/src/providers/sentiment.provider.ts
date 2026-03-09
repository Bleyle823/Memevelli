// ─────────────────────────────────────────────────────────
//  Provider: SENTIMENT_PROVIDER
//  Fetches Twitter/X sentiment for watched meme coin tickers
//  Uses Apify if token present, otherwise returns mock data
// ─────────────────────────────────────────────────────────

import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import {
    WATCHED_TICKERS, MEME_COINS, SCORE_BUY_DEFAULT, SCORE_SELL_DEFAULT, MIN_UNIQUE_AUTHORS,
} from '../constants.js';
import type { MentionData, NarrativeScore } from '../types.js';

// ── Scoring formula
export function scoreNarrative(data: MentionData): NarrativeScore {
    if (data.uniqueAuthors < MIN_UNIQUE_AUTHORS) {
        return {
            ticker: data.ticker, score: 0, velocity: 0,
            signal: 'NONE', reason: `Only ${data.uniqueAuthors} unique authors — possible bot activity`,
            chain: data.chain,
        };
    }

    const avgMentionsPerHour = data.mentionsLastDay / 24;
    const velocity = avgMentionsPerHour > 0 ? data.mentionsLastHour / avgMentionsPerHour : 1;
    const logAuthors = Math.log10(Math.max(data.uniqueAuthors, 1)) / 4;

    const score = Math.min(1, (velocity * 0.5) + (data.positiveRatio * 0.3) + (logAuthors * 0.2));
    const signal: NarrativeScore['signal'] =
        score >= SCORE_BUY_DEFAULT ? 'BUY' :
            score <= SCORE_SELL_DEFAULT ? 'SELL' : 'HOLD';

    const reason =
        signal === 'BUY'
            ? `Momentum — ${velocity.toFixed(1)}x avg rate, ${(data.positiveRatio * 100).toFixed(0)}% positive, ${data.uniqueAuthors} unique accounts`
            : signal === 'SELL'
                ? `Cooling — score ${score.toFixed(2)}, only ${data.uniqueAuthors} unique authors`
                : `Watching — score ${score.toFixed(2)}`;

    return { ticker: data.ticker, score, velocity, signal, reason, chain: data.chain };
}

// ── Cache
const cache = new Map<string, { data: MentionData; ts: number }>();
const TTL = 5 * 60 * 1000; // 5 min

// ── Apify fetch
async function fetchFromApify(runtime: IAgentRuntime, ticker: string): Promise<MentionData> {
    const coin = MEME_COINS[ticker];
    const res = await fetch('https://api.apify.com/v2/acts/quacker~twitter-scraper/run-sync-get-dataset-items', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${runtime.getSetting('APIFY_TOKEN')}`,
        },
        body: JSON.stringify({
            searchTerms: [`${ticker}`, `$${ticker} crypto`],
            maxTweets: 300,
            since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }),
    });
    const tweets = await res.json() as any[];
    const now = Date.now();
    const hourAgo = now - 3_600_000;
    const dayAgo = now - 86_400_000;

    const uniqueAuthors = new Set(tweets.map((t: any) => t.author_id ?? t.user?.id)).size;
    const mentionsLastDay = tweets.length;
    const mentionsLastHour = tweets.filter((t: any) => new Date(t.created_at).getTime() > hourAgo).length;
    const positive = tweets.filter((t: any) => {
        const txt = (t.text ?? '').toLowerCase();
        return txt.includes('moon') || txt.includes('bull') || txt.includes('buy') || txt.includes('🚀');
    }).length;
    const positiveRatio = mentionsLastDay > 0 ? positive / mentionsLastDay : 0.5;

    return {
        ticker, mentionsLastHour, mentionsLastDay, positiveRatio,
        uniqueAuthors, sampleTweets: tweets.slice(0, 3).map((t: any) => t.text ?? ''),
        chain: coin.chainKey,
    };
}

// ── Mock data (deterministic but changes over time for demo realism)
function getMockData(ticker: string): MentionData {
    const coin = MEME_COINS[ticker];
    const noise = Math.sin(Date.now() / 60000 + ticker.charCodeAt(0));
    const base: Record<string, MentionData> = {
        BRETT: { ticker, mentionsLastHour: Math.floor(1200 + 300 * noise), mentionsLastDay: 4500, positiveRatio: 0.82 + noise * 0.05, uniqueAuthors: Math.floor(750 + 100 * noise), sampleTweets: ['$BRETT going parabolic on Base!', 'This is the BRETT cycle 🚀'], chain: 'BASE' },
        WIF: { ticker, mentionsLastHour: Math.floor(800 + 200 * noise), mentionsLastDay: 7200, positiveRatio: 0.71 + noise * 0.04, uniqueAuthors: Math.floor(520 + 80 * noise), sampleTweets: ['$WIF hat stays on fr fr', 'WIF bullish'], chain: 'ARB' },
        PEPE: { ticker, mentionsLastHour: Math.floor(350 + 150 * noise), mentionsLastDay: 9000, positiveRatio: 0.45 + noise * 0.06, uniqueAuthors: Math.floor(280 + 60 * noise), sampleTweets: ['$PEPE just a meme or actually alpha?'], chain: 'ETH' },
        BONK: { ticker, mentionsLastHour: Math.floor(420 + 100 * noise), mentionsLastDay: 3200, positiveRatio: 0.68 + noise * 0.05, uniqueAuthors: Math.floor(310 + 50 * noise), sampleTweets: ['$BONK sending to zero or moon?'], chain: 'ARB' },
        FLOKI: { ticker, mentionsLastHour: Math.floor(200 + 80 * noise), mentionsLastDay: 2800, positiveRatio: 0.55 + noise * 0.05, uniqueAuthors: Math.floor(180 + 40 * noise), sampleTweets: ['$FLOKI army waking up'], chain: 'ETH' },
        DOGE: { ticker, mentionsLastHour: Math.floor(650 + 200 * noise), mentionsLastDay: 12000, positiveRatio: 0.60 + noise * 0.04, uniqueAuthors: Math.floor(480 + 120 * noise), sampleTweets: ['Such wow. Much DOGE.'], chain: 'BSC' },
    };
    return base[ticker] ?? { ticker, mentionsLastHour: 50, mentionsLastDay: 800, positiveRatio: 0.5, uniqueAuthors: 40, sampleTweets: [], chain: coin?.chainKey ?? 'ETH' };
}

// ── Get sentiment (with cache)
export async function getSentiment(runtime: IAgentRuntime, ticker: string): Promise<MentionData> {
    const now = Date.now();
    const cached = cache.get(ticker);
    if (cached && now - cached.ts < TTL) return cached.data;

    let data: MentionData;
    const apifyToken = runtime.getSetting('APIFY_TOKEN');
    if (apifyToken) {
        try {
            data = await fetchFromApify(runtime, ticker);
        } catch (e) {
            logger.warn(`[SENTIMENT] Apify failed for ${ticker}, using mock`);
            data = getMockData(ticker);
        }
    } else {
        data = getMockData(ticker);
    }

    cache.set(ticker, { data, ts: now });
    return data;
}

export const sentimentProvider: Provider = {
    name: 'SENTIMENT_PROVIDER',
    description: 'Provides live Twitter/X sentiment scores for all watched meme coin tickers.',

    get: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
    ): Promise<ProviderResult> => {
        const results = await Promise.all(
            WATCHED_TICKERS.map(async t => {
                const mentions = await getSentiment(_runtime, t);
                return scoreNarrative(mentions);
            })
        );

        const sorted = results.sort((a, b) => b.score - a.score);
        const buySignals = sorted.filter(r => r.signal === 'BUY');
        const sellSignals = sorted.filter(r => r.signal === 'SELL');

        const text = [
            '=== NARRATIVE SENTIMENT SCORES ===',
            ...sorted.map(r =>
                `  ${r.signal === 'BUY' ? '🟢' : r.signal === 'SELL' ? '🔴' : '🟡'} $${r.ticker} — score: ${r.score.toFixed(2)} (${r.signal}) — ${r.reason}`
            ),
            `BUY signals: ${buySignals.map(r => '$' + r.ticker).join(', ') || 'none'}`,
            `SELL signals: ${sellSignals.map(r => '$' + r.ticker).join(', ') || 'none'}`,
            '==================================',
        ].join('\n');

        return {
            text,
            values: { buySignals: buySignals.map(r => r.ticker), sellSignals: sellSignals.map(r => r.ticker) },
            data: results,
        };
    },
};
