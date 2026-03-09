// ─────────────────────────────────────────────────────────
//  Action: LIFI_EXECUTE_BRIDGE
//  Bridges tokens from one chain to another
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getQuote, convertQuoteToRoute, executeRoute } from '@lifi/sdk';
import { LiFiService } from '../service.js';
import { CHAIN_IDS, USDC_ADDRESSES, LIFI_BASE_URL, type ChainKey } from '../constants.js';
import { randomUUID } from 'node:crypto';

export const executeBridgeAction: Action = {
    name: 'LIFI_EXECUTE_BRIDGE',
    similes: ['BRIDGE_TOKEN', 'TRANSFER_CHAIN', 'CROSS_CHAIN_TRANSFER', 'MOVE_FUNDS'],
    description:
        'Bridges tokens (like USDC) from one chain to another via LI.FI SDK. Use when a user asks to move funds across chains or when the agent strategy requires rebalancing funds.',

    validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType as any);
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
        if (!service) return { success: false, error: new Error('LiFiService not available') };

        const agentId = runtime.agentId;
        const agentName = runtime.character?.name ?? agentId;

        const incomingText = message.content.text || '';
        let bridgeParams = extractBridgeParams(incomingText);

        // Fallback: Check state if parameters are missing from incoming message
        if (!bridgeParams.amount && _state) {
            const recent = _state.recentMessagesData as any[];
            if (recent && recent.length > 0) {
                const latest = recent[0];
                if (latest?.entityId === agentId) {
                    const fallbackParams = extractBridgeParams(latest.content?.text ?? '');
                    bridgeParams = { ...bridgeParams, ...fallbackParams };
                }
            }
        }

        const amountStr = options.amount || bridgeParams.amount;
        const tokenStr = options.token || bridgeParams.token;
        const fromChainStr = options.fromChain || bridgeParams.fromChain;
        const toChainStr = options.toChain || bridgeParams.toChain;

        if (!amountStr || !tokenStr || !fromChainStr || !toChainStr) {
            if (callback) {
                await callback({ text: '❌ Please specify amount, token, source chain, and destination chain. Example: "Bridge 0.5 USDC from Base to Arbitrum"' });
            }
            return { success: false, error: 'Missing bridge parameters' as any };
        }

        const amountUSD = parseFloat(amountStr);
        if (isNaN(amountUSD) || amountUSD <= 0) {
            return { success: false, error: `Invalid amount: ${amountStr}` as any };
        }

        const fromChainId = getChainIdFromName(fromChainStr);
        const toChainId = getChainIdFromName(toChainStr);

        if (!fromChainId) return { success: false, error: `Unknown source chain: ${fromChainStr}` as any };
        if (!toChainId) return { success: false, error: `Unknown destination chain: ${toChainStr}` as any };

        // For now, only USDC is fully supported for this simple bridge prompt
        if (tokenStr.toUpperCase() !== 'USDC') {
            return { success: false, error: `Only USDC bridging is currently supported. Got: ${tokenStr}` as any };
        }

        const fromTokenAddress = USDC_ADDRESSES[fromChainId];
        const toTokenAddress = USDC_ADDRESSES[toChainId];

        if (!fromTokenAddress) return { success: false, error: `USDC not supported on ${fromChainStr}` as any };
        if (!toTokenAddress) return { success: false, error: `USDC not supported on ${toChainStr}` as any };

        // Convert to 6 decimals for USDC
        const fromAmount = String(Math.floor(amountUSD * 1e6));

        try {
            logger.info(`[LIFI_EXECUTE_BRIDGE] Bridging ${amountUSD} USDC from ${fromChainStr} to ${toChainStr}`);

            if (callback) {
                await callback({
                    text: `🔄 Fetching LI.FI quote to bridge ${amountUSD} USDC from ${fromChainStr} to ${toChainStr}...`,
                    actions: ['LIFI_EXECUTE_BRIDGE'],
                });
            }

            const quote = await getQuote({
                fromChain: fromChainId,
                toChain: toChainId,
                fromToken: fromTokenAddress,
                toToken: toTokenAddress,
                fromAmount,
                fromAddress: service.walletAddress!,
                slippage: 0.01,
                integrator: 'NarrativeTrader',
            });

            const estimatedToAmountStr = parseFloat(quote.estimate.toAmount) / 1e6;
            const gasCostUSD = parseFloat(quote.estimate.gasCosts?.[0]?.amountUSD ?? '0');
            const route = convertQuoteToRoute(quote);

            let txHash = '';
            const result = await executeRoute(route, {
                updateRouteHook(updatedRoute) {
                    const step = updatedRoute.steps[0];
                    const processes = step?.execution?.process ?? [];
                    const latest = processes[processes.length - 1];
                    if (latest?.txHash && latest.txHash !== txHash) {
                        txHash = latest.txHash;
                        logger.info(`[LIFI_EXECUTE_BRIDGE] TX submitted: ${txHash}`);
                    }
                },
                acceptExchangeRateUpdateHook: async (updateParam) => {
                    const pct = Math.abs((parseFloat(updateParam.newToAmount) - parseFloat(updateParam.oldToAmount)) / parseFloat(updateParam.oldToAmount));
                    return pct < 0.03;
                },
            });

            const finalStep = result.steps[result.steps.length - 1];
            const finalProcess = finalStep?.execution?.process ?? [];
            const finalTx = finalProcess.find(p => p.txHash)?.txHash ?? txHash;

            const successText = [
                `✅ **BRIDGED ${amountUSD} USDC**`,
                `• From: ${fromChainStr.toUpperCase()}`,
                `• To: ${toChainStr.toUpperCase()}`,
                `• Received: ~${estimatedToAmountStr.toFixed(4)} USDC`,
                `• Gas: ~$${gasCostUSD.toFixed(3)}`,
                `• TX: ${finalTx}`,
            ].join('\n');

            if (callback) await callback({ text: successText, actions: ['LIFI_EXECUTE_BRIDGE'] });
            return { success: true, text: successText, data: { txHash: finalTx } };

        } catch (error) {
            logger.error({ error }, '[LIFI_EXECUTE_BRIDGE] Bridge failed');
            if (callback) {
                await callback({ text: `❌ Bridge failed: ${error instanceof Error ? error.message : String(error)}`, actions: ['LIFI_EXECUTE_BRIDGE'] });
            }
            return { success: false, error: (error instanceof Error ? error.message : String(error)) as any };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'Bridge 0.5 usdc from base to arbitrum', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '✅ BRIDGED 0.5 USDC from BASE to ARBITRUM...', actions: ['LIFI_EXECUTE_BRIDGE'] },
            },
        ],
    ],
};

function extractBridgeParams(text: string) {
    // Basic regex to match "Bridge <amount> <token> from <chain> to <chain>"
    const match = text.match(/bridge\s+([\d.]+)\s+([a-zA-Z]+)\s+from\s+([a-zA-Z]+)\s+to\s+([a-zA-Z]+)/i);
    if (match) {
        return {
            amount: match[1],
            token: match[2],
            fromChain: match[3],
            toChain: match[4]
        };
    }
    return {};
}

function getChainIdFromName(name: string): number | null {
    const upper = name.toUpperCase();
    for (const [key, value] of Object.entries(CHAIN_IDS)) {
        if (key === upper) return value;
        // Handle common variations
        if (upper === 'ETHEREUM' && key === 'ETH') return value;
        if (upper === 'POLYGON' && key === 'POL') return value;
        if (upper === 'ARBITRUM' && key === 'ARB') return value;
        if (upper === 'OPTIMISM' && key === 'OPT') return value;
        if (upper === 'BINANCE' && key === 'BSC') return value;
        if (upper === 'AVALANCHE' && key === 'AVA') return value;
        if (upper === 'LINEA' && key === 'LIN') return value;
    }
    return null;
}
