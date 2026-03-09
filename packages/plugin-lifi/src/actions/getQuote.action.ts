// ─────────────────────────────────────────────────────────
//  Action: LIFI_GET_QUOTE
//  Gets a cross-chain swap quote via @lifi/sdk
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getQuote as getLiFiQuote, convertQuoteToRoute } from '@lifi/sdk';
import { LiFiService } from '../service.js';
import { CHAIN_IDS, USDC_ADDRESSES, MEME_COINS } from '../constants.js';
import type { QuoteResult } from '../types.js';

export const getQuoteAction: Action = {
    name: 'LIFI_GET_QUOTE',
    similes: ['GET_SWAP_QUOTE', 'PRICE_CHECK', 'QUOTE_TRADE', 'HOW_MUCH_TO_BUY'],
    description:
        'Gets a cross-chain swap quote from LI.FI for buying or selling a token. ' +
        'Use when you want to check the price impact and route before executing a trade.',

    validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        options: Record<string, any> = {},
        callback?: HandlerCallback,
    ): Promise<ActionResult> => {
        try {
            // Options can be passed directly by other actions (machine-to-machine)
            const ticker = options.ticker ?? extractTicker(message.content.text ?? '');
            const amountUSD = options.amountUSD ?? 33;
            const direction = options.direction ?? 'BUY';  // 'BUY' | 'SELL'

            if (!ticker || !MEME_COINS[ticker]) {
                const errMsg = `Unknown ticker. Supported: ${Object.keys(MEME_COINS).join(', ')}`;
                if (callback) await callback({ text: errMsg, actions: ['LIFI_GET_QUOTE'] });
                return { success: false, error: new Error(errMsg) };
            }

            const coin = MEME_COINS[ticker];
            const service = runtime.getService<LiFiService>(LiFiService.serviceType);

            // BUY: USDC (on coin's chain) → coin
            // SELL: coin → USDC (on coin's chain)
            const fromToken = direction === 'BUY' ? USDC_ADDRESSES[coin.chainId] : coin.address;
            const toToken = direction === 'BUY' ? coin.address : USDC_ADDRESSES[coin.chainId];
            const fromChainId = coin.chainId;
            const toChainId = coin.chainId;

            // Convert USD to USDC units (6 decimals)
            const fromAmount = direction === 'BUY'
                ? String(Math.floor(amountUSD * 1e6))
                : options.tokenAmount ?? '1000000000000000000'; // fallback 1 token

            if (!service?.walletAddress) {
                const errMsg = 'Wallet not configured — set WALLET_ADDRESS in environment';
                if (callback) await callback({ text: errMsg, actions: ['LIFI_GET_QUOTE'] });
                return { success: false, error: new Error(errMsg) };
            }

            logger.info(`[LIFI_GET_QUOTE] ${direction} $${ticker} — fromAmount=${fromAmount}`);

            const quote = await getLiFiQuote({
                fromChain: fromChainId,
                toChain: toChainId,
                fromToken,
                toToken,
                fromAmount,
                fromAddress: service.walletAddress,
                slippage: 0.01,  // 1% slippage for meme coins
                integrator: 'NarrativeTrader',
            });

            const result: QuoteResult = {
                success: true,
                fromToken: direction === 'BUY' ? 'USDC' : ticker,
                toToken: direction === 'BUY' ? ticker : 'USDC',
                fromChain: coin.chainKey,
                toChain: coin.chainKey,
                fromAmountUSD: amountUSD,
                toAmount: quote.estimate.toAmount,
                estimatedToAmountUSD: parseFloat(quote.estimate.toAmountUSD ?? '0'),
                gasCostUSD: parseFloat(quote.estimate.gasCosts?.[0]?.amountUSD ?? '0'),
                route: convertQuoteToRoute(quote),
            };

            const text = [
                `📊 **LI.FI Quote — ${direction} $${ticker}**`,
                `• Route: ${coin.chainKey} → ${coin.chainKey}`,
                `• You send: $${amountUSD} USDC`,
                `• You receive: ~$${result.estimatedToAmountUSD.toFixed(2)} worth of $${ticker}`,
                `• Gas cost: ~$${result.gasCostUSD.toFixed(3)}`,
                `• Slippage: 1% max`,
            ].join('\n');

            if (callback) await callback({ text, actions: ['LIFI_GET_QUOTE'], data: result });
            return { text, success: true, data: result };
        } catch (error) {
            logger.error({ error }, '[LIFI_GET_QUOTE] Error');
            const msg = `Quote failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, actions: ['LIFI_GET_QUOTE'] });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'get a quote to buy $BRETT', actions: [] } },
            {
                name: '{{agent}}',
                content: {
                    text: '📊 LI.FI Quote — BUY $BRETT\n• You send: $33 USDC...',
                    actions: ['LIFI_GET_QUOTE'],
                },
            },
        ],
    ],
};

function extractTicker(text: string): string | null {
    const match = text.match(/\$([A-Z]{2,8})/i);
    if (match) {
        const t = match[1].toUpperCase();
        return MEME_COINS[t] ? t : null;
    }
    return null;
}
