// ─────────────────────────────────────────────────────────
//  Action: LIFI_EXECUTE_SELL
//  Full sell flow: quote → executeRoute → closePosition → broadcast
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getQuote, convertQuoteToRoute, executeRoute } from '@lifi/sdk';
import { LiFiService } from '../service.js';
import { USDC_ADDRESSES, MEME_COINS, LIFI_BASE_URL } from '../constants.js';
import type { TradeEvent } from '../types.js';
import { randomUUID } from 'node:crypto';

export const executeSellAction: Action = {
    name: 'LIFI_EXECUTE_SELL',
    similes: ['SELL_TOKEN', 'EXIT_POSITION', 'CLOSE_TRADE', 'NARRATIVE_SELL'],
    description:
        'Executes a cross-chain token sell via LI.FI SDK, closing an open position. ' +
        'Use when narrative score drops below threshold, stop-loss triggers, or take-profit is hit.',

    validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        return !!service?.walletClient;
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

        let ticker = options.ticker ?? extractTicker(message.content.text ?? '');
        const reason = options.reason ?? 'Narrative SELL signal';
        const agentId = runtime.agentId;
        const agentName = runtime.character?.name ?? agentId;

        // Fallback: If ticker missing, check if agent has exactly one open position
        if (!ticker) {
            const agentPositions = service.getAgentPositions(agentId);
            if (agentPositions.size === 1) {
                ticker = Array.from(agentPositions.keys())[0];
                logger.info(`[LIFI_EXECUTE_SELL] Ticker missing, inferred $${ticker} from only open position`);
            }
        }

        if (!ticker || !MEME_COINS[ticker]) {
            const msg = `Unknown ticker: ${ticker}. ${!ticker ? 'Please specify which position to sell (e.g. $BRETT).' : ''}`;
            if (callback) await callback({ text: `❌ ${msg}`, actions: ['LIFI_EXECUTE_SELL'] });
            return {
                success: false,
                text: msg,
                data: { error: `Unknown ticker: ${ticker}`, actionName: 'LIFI_EXECUTE_SELL' }
            };
        }

        const agentPositions = service.getAgentPositions(agentId);
        const position = agentPositions.get(ticker);
        if (!position) {
            const msg = `No open position for $${ticker}`;
            if (callback) await callback({ text: msg, actions: ['LIFI_EXECUTE_SELL'] });
            return {
                success: false,
                text: msg,
                data: { noPosition: true, ticker, actionName: 'LIFI_EXECUTE_SELL' }
            };
        }

        const coin = MEME_COINS[ticker];
        const fromToken = coin.address;
        const toToken = USDC_ADDRESSES[coin.chainId];
        const fromAmount = position.tokenAmount; // sell 100% of position

        try {
            logger.info(`[LIFI_EXECUTE_SELL] ${agentName} selling $${ticker} — ${reason}`);

            if (callback) {
                await callback({
                    text: `🔄 Fetching sell quote for $${ticker} → USDC on ${coin.chainKey}...`,
                    actions: ['LIFI_EXECUTE_SELL'],
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

            const usdcReceived = parseFloat(quote.estimate.toAmount) / 1e6;
            const route = convertQuoteToRoute(quote);

            // 2. Execute
            let txHash = '';
            await executeRoute(route, {
                updateRouteHook(updatedRoute) {
                    const step = updatedRoute.steps[0];
                    const processes = step?.execution?.process ?? [];
                    const latest = processes[processes.length - 1];
                    if (latest?.txHash && latest.txHash !== txHash) {
                        txHash = latest.txHash;
                    }
                },
                acceptExchangeRateUpdateHook: (_toToken, oldAmount, newAmount) => {
                    const pct = Math.abs((parseFloat(newAmount) - parseFloat(oldAmount)) / parseFloat(oldAmount));
                    return Promise.resolve(pct < 0.03);
                },
            });

            // 3. Get final price to compute PnL
            const tokenPriceRes = await fetch(
                `${LIFI_BASE_URL}/token?chain=${coin.chainId}&token=${coin.address}`
            );
            const tokenData = tokenPriceRes.ok ? await tokenPriceRes.json() as any : null;
            const exitPrice = tokenData?.priceUSD ? parseFloat(tokenData.priceUSD) : position.currentPrice;

            // 4. Close position
            const pnlUSD = service.closePosition(agentId, ticker, exitPrice);
            const pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice * 100).toFixed(1);

            // 5. Broadcast
            const event: TradeEvent = {
                id: randomUUID(), agentId, agentName, type: 'SELL',
                ticker, chain: coin.chainKey,
                reason: `${reason}`,
                txHash,
                pnlUSD,
                ts: new Date().toISOString(),
            };
            service.broadcast(event);

            const text = [
                `✅ **SOLD $${ticker}** on ${coin.chainKey}`,
                `• Received: ~$${usdcReceived.toFixed(2)} USDC`,
                `• PnL: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${pnlPct}%)`,
                `• TX: ${txHash}`,
                `• Reason: ${reason}`,
            ].join('\n');

            if (callback) await callback({ text, actions: ['LIFI_EXECUTE_SELL'], data: event });
            return { text, success: true, data: event };
        } catch (error) {
            logger.error({ error }, '[LIFI_EXECUTE_SELL] Sell failed');
            const errEvent: TradeEvent = {
                id: randomUUID(), agentId, agentName, type: 'ERROR',
                ticker, reason: `Sell failed: ${error instanceof Error ? error.message : String(error)}`,
                ts: new Date().toISOString(),
            };
            service.broadcast(errEvent);
            if (callback) {
                await callback({ text: `❌ Sell failed: ${errEvent.reason}`, actions: ['LIFI_EXECUTE_SELL'] });
            }
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'sell $BRETT narrative is cooling', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '✅ SOLD $BRETT on BASE...', actions: ['LIFI_EXECUTE_SELL'] },
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
