// ─────────────────────────────────────────────────────────
//  Action: LIFI_EXECUTE_BUY
//  Full buy flow: quote → executeRoute → openPosition → broadcast
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getQuote, convertQuoteToRoute, executeRoute } from '@lifi/sdk';
import { LiFiService } from '../service.js';
import {
    CHAIN_IDS, USDC_ADDRESSES, MEME_COINS, LIFI_BASE_URL, DEFAULT_POSITION_SIZE_USD,
} from '../constants.js';
import type { Position, TradeEvent } from '../types.js';
import { randomUUID } from 'node:crypto';

export const executeBuyAction: Action = {
    name: 'LIFI_EXECUTE_BUY',
    similes: ['BUY_TOKEN', 'SWAP_INTO', 'ENTER_POSITION', 'NARRATIVE_BUY'],
    description:
        'Executes a cross-chain token buy via LI.FI SDK. Performs full quote → route → execute flow, ' +
        'then records the position. Use when narrative score triggers a BUY signal.',

    validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        return !!service?.walletAddress && !!service?.walletClient;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        options: Record<string, any> = {},
        callback?: HandlerCallback,
    ): Promise<ActionResult> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        if (!service) return { success: false, error: new Error('LiFiService not available') };

        const ticker = options.ticker ?? extractTicker(message.content.text ?? '');
        const amountUSD = options.amountUSD ?? DEFAULT_POSITION_SIZE_USD;
        const score = options.score ?? 0;
        const reason = options.reason ?? 'Narrative BUY signal';
        const agentId = runtime.agentId;
        const agentName = runtime.character?.name ?? agentId;

        if (!ticker || !MEME_COINS[ticker]) {
            return { success: false, error: new Error(`Unknown ticker: ${ticker}`) };
        }

        // Risk check
        const { ok, reason: riskReason } = service.canBuy(agentId, ticker, amountUSD);
        if (!ok) {
            const event: TradeEvent = {
                id: randomUUID(), agentId, agentName, type: 'SKIP',
                ticker, reason: riskReason, ts: new Date().toISOString(),
            };
            service.broadcast(event);
            if (callback) await callback({ text: `⏸ SKIP $${ticker}: ${riskReason}`, actions: ['LIFI_EXECUTE_BUY'] });
            return { success: false, data: { skipped: true, reason: riskReason } };
        }

        const coin = MEME_COINS[ticker];
        const fromToken = USDC_ADDRESSES[coin.chainId];
        const toToken = coin.address;
        const fromAmount = String(Math.floor(amountUSD * 1e6));

        try {
            logger.info(`[LIFI_EXECUTE_BUY] ${agentName} buying $${ticker} on ${coin.chainKey}`);

            if (callback) {
                await callback({
                    text: `🔄 Fetching LI.FI quote for $${amountUSD} USDC → $${ticker} on ${coin.chainKey}...`,
                    actions: ['LIFI_EXECUTE_BUY'],
                });
            }

            // 1. Get quote
            const quote = await getQuote({
                fromChain: coin.chainId,
                toChain: coin.chainId,
                fromToken,
                toToken,
                fromAmount,
                fromAddress: service.walletAddress!,
                slippage: 0.01,
                integrator: 'NarrativeTrader',
            });

            const estimatedToAmountUSD = parseFloat(quote.estimate.toAmountUSD ?? '0');
            const gasCostUSD = parseFloat(quote.estimate.gasCosts?.[0]?.amountUSD ?? '0');
            const route = convertQuoteToRoute(quote);

            // 2. Execute route
            let txHash = '';
            const result = await executeRoute(route, {
                updateRouteHook(updatedRoute) {
                    const step = updatedRoute.steps[0];
                    const processes = step?.execution?.process ?? [];
                    const latest = processes[processes.length - 1];
                    if (latest?.txHash && latest.txHash !== txHash) {
                        txHash = latest.txHash;
                        logger.info(`[LIFI_EXECUTE_BUY] TX submitted: ${txHash}`);
                    }
                },
                // Auto-accept exchange rate changes < 3%
                acceptExchangeRateUpdateHook: (_toToken, oldAmount, newAmount) => {
                    const pct = Math.abs((parseFloat(newAmount) - parseFloat(oldAmount)) / parseFloat(oldAmount));
                    return Promise.resolve(pct < 0.03);
                },
            });

            // Extract final tx hash
            const finalStep = result.steps[result.steps.length - 1];
            const finalProcess = finalStep?.execution?.process ?? [];
            const finalTx = finalProcess.find(p => p.txHash)?.txHash ?? txHash;

            // 3. Get actual price from LI.FI token endpoint
            const tokenPriceRes = await fetch(
                `${LIFI_BASE_URL}/token?chain=${coin.chainId}&token=${coin.address}`
            );
            const tokenData = tokenPriceRes.ok ? await tokenPriceRes.json() as any : null;
            const actualPriceUSD = tokenData?.priceUSD ? parseFloat(tokenData.priceUSD) : estimatedToAmountUSD / parseFloat(quote.estimate.toAmount || '1');

            // 4. Open position
            const position: Position = {
                agentId,
                ticker,
                chain: coin.chainKey,
                chainId: coin.chainId,
                tokenAddress: coin.address,
                entryPrice: actualPriceUSD,
                currentPrice: actualPriceUSD,
                sizeUSD: amountUSD,
                tokenAmount: quote.estimate.toAmount,
                entryScore: score,
                openedAt: new Date(),
                txHash: finalTx,
            };
            service.openPosition(position);

            // 5. Broadcast event
            const event: TradeEvent = {
                id: randomUUID(), agentId, agentName, type: 'BUY',
                ticker, chain: coin.chainKey,
                reason: `${reason} • via LI.FI on ${coin.chainKey}`,
                txHash: finalTx,
                ts: new Date().toISOString(),
            };
            service.broadcast(event);

            const text = [
                `✅ **BOUGHT $${ticker}** on ${coin.chainKey}`,
                `• Spent: $${amountUSD} USDC`,
                `• Received: ~$${estimatedToAmountUSD.toFixed(2)} of $${ticker}`,
                `• Gas: ~$${gasCostUSD.toFixed(3)}`,
                `• TX: ${finalTx}`,
                `• Reason: ${reason}`,
            ].join('\n');

            if (callback) await callback({ text, actions: ['LIFI_EXECUTE_BUY'], data: event });
            return { text, success: true, data: event };
        } catch (error) {
            logger.error({ error }, '[LIFI_EXECUTE_BUY] Trade failed');
            const errEvent: TradeEvent = {
                id: randomUUID(), agentId, agentName, type: 'ERROR',
                ticker, reason: `Buy failed: ${error instanceof Error ? error.message : String(error)}`,
                ts: new Date().toISOString(),
            };
            service.broadcast(errEvent);
            if (callback) {
                await callback({ text: `❌ Buy failed: ${errEvent.reason}`, actions: ['LIFI_EXECUTE_BUY'] });
            }
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'buy $BRETT narrative is hot', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '✅ BOUGHT $BRETT on BASE...', actions: ['LIFI_EXECUTE_BUY'] },
            },
        ],
    ],
};

function extractTicker(text: string): string | null {
    // 1. Match with $ prefix (best)
    const match = text.match(/\$([A-Z]{2,8})/i);
    if (match) return match[1].toUpperCase();

    // 2. Match known tickers from MEME_COINS (fallback)
    const upperText = text.toUpperCase();
    for (const t of Object.keys(MEME_COINS)) {
        if (new RegExp(`\\b${t}\\b`).test(upperText)) {
            return t;
        }
    }

    return null;
}
