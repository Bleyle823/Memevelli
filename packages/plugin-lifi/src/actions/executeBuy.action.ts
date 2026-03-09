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
    similes: ['BUY_TOKEN', 'SWAP_INTO', 'ENTER_POSITION', 'NARRATIVE_BUY', 'PURCHASE_COIN'],
    description:
        'Executes a cross-chain token buy via LI.FI SDK. Use when a user explicitly asks to buy a token (e.g., "buy 0.5 USDC worth of BRETT on Base") or when the agent narrative indicates a buying opportunity.',

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
        const service = runtime.getService<LiFiService>(LiFiService.serviceType as any);
        if (!service) return { success: false, error: 'LiFiService not available' as any };

        const agentId = runtime.agentId;
        const agentName = runtime.character?.name ?? agentId;

        // Extraction logic: try options, then message, then the agent's own recently generated response (in state)
        let ticker = options.ticker ?? extractTicker(message.content.text ?? '');
        if (!ticker && _state) {
            // In Eliza, the response text is often added to state before actions are processed
            // or we can look at the latest message in recentMessagesData if it's from the agent
            const recent = _state.recentMessagesData as any[];
            if (recent && recent.length > 0) {
                const latest = recent[0];
                if (latest?.entityId === agentId) {
                    ticker = extractTicker(latest.content?.text ?? '');
                }
            }
        }

        const amountUSD = options.amountUSD ?? (runtime.character as any).settings?.groupBehavior?.tradeSizeUSD ?? (runtime.character as any).settings?.positionSizeUSD ?? DEFAULT_POSITION_SIZE_USD;
        const score = options.score ?? 0;
        const reason = options.reason ?? 'Narrative BUY signal';

        if (!ticker || !MEME_COINS[ticker]) {
            return { success: false, error: `Unknown ticker: ${ticker}` as any };
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
                    text: `🔄 Checking balances for $${amountUSD} USDC → $${ticker} on ${coin.chainKey}...`,
                    actions: ['LIFI_EXECUTE_BUY'],
                });
            }

            // --- Auto-Bridging Logic ---
            const targetChainId = coin.chainId;
            let fromChainId = targetChainId;
            let fromTokenAddress = fromToken;

            // Check balance on target chain first
            const targetBalance = await service.getUsdcBalance(targetChainId);
            const requiredBalance = BigInt(fromAmount);

            if (targetBalance < requiredBalance) {
                logger.info(`[LIFI_EXECUTE_BUY] Insufficient USDC on target chain ${coin.chainKey}. Balance: ${targetBalance}, Required: ${requiredBalance}. Checking fallback chains...`);

                // Prioritized fallback chains for liquidity
                const fallbackChains = [CHAIN_IDS.ARB, CHAIN_IDS.ETH, CHAIN_IDS.BASE, CHAIN_IDS.OPT, CHAIN_IDS.POL];
                let foundLiquidity = false;

                for (const fallbackChain of fallbackChains) {
                    if (fallbackChain === targetChainId) continue;

                    const fallbackBalance = await service.getUsdcBalance(fallbackChain);
                    if (fallbackBalance >= requiredBalance) {
                        fromChainId = fallbackChain;
                        fromTokenAddress = USDC_ADDRESSES[fallbackChain];
                        foundLiquidity = true;

                        logger.info(`[LIFI_EXECUTE_BUY] Found sufficient USDC on fallback chain ${fallbackChain}. Bridging from ${fallbackChain} to ${targetChainId}.`);
                        if (callback) {
                            await callback({
                                text: `🌉 Insufficient balance on ${coin.chainKey}. Bridging USDC from chain ${fallbackChain} to ${coin.chainKey}...`,
                                actions: ['LIFI_EXECUTE_BUY'],
                            });
                        }
                        break;
                    }
                }

                if (!foundLiquidity) {
                    throw new Error(`Insufficient USDC balance across all checked chains for ${amountUSD} USD purchase.`);
                }
            } else {
                logger.info(`[LIFI_EXECUTE_BUY] Sufficient USDC found on target chain ${coin.chainKey}.`);
            }
            // ---------------------------

            if (callback) {
                await callback({
                    text: `🔄 Fetching LI.FI quote for $${amountUSD} USDC → $${ticker} (Source Chain: ${fromChainId} → Target Chain: ${targetChainId})...`,
                    actions: ['LIFI_EXECUTE_BUY'],
                });
            }

            // 1. Get quote
            const quote = await getQuote({
                fromChain: fromChainId,
                toChain: targetChainId,
                fromToken: fromTokenAddress,
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
                acceptExchangeRateUpdateHook: async (updateParam) => {
                    const pct = Math.abs((parseFloat(updateParam.newToAmount) - parseFloat(updateParam.oldToAmount)) / parseFloat(updateParam.oldToAmount));
                    return pct < 0.03;
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
            return { success: false, error: (error instanceof Error ? error.message : String(error)) as any };
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
