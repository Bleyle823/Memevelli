// ─────────────────────────────────────────────────────────
//  Action: LIFI_GET_TOKEN_INFO
//  Gets price + metadata for any token via LI.FI
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getToken } from '@lifi/sdk';
import { MEME_COINS, CHAIN_IDS } from '../constants.js';

export const getTokenInfoAction: Action = {
    name: 'LIFI_GET_TOKEN_INFO',
    similes: ['TOKEN_PRICE', 'LOOKUP_TOKEN', 'TOKEN_INFO', 'COIN_PRICE'],
    description:
        'Gets price, decimals, and metadata for a meme coin token via LI.FI. ' +
        'Use to check current price before or after a trade.',

    validate: async (): Promise<boolean> => true,

    handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        options: Record<string, any> = {},
        callback?: HandlerCallback,
    ): Promise<ActionResult> => {
        const ticker = options.ticker ?? extractTicker(message.content.text ?? '');
        const chainId = options.chainId;

        if (!ticker && !chainId) {
            const msg = 'Please specify a token ticker (e.g. $BRETT) or chain + token address.';
            if (callback) await callback({ text: msg, actions: ['LIFI_GET_TOKEN_INFO'] });
            return { success: false, error: new Error(msg) };
        }

        try {
            let cId: number;
            let tokenAddr: string;

            if (ticker && MEME_COINS[ticker]) {
                const coin = MEME_COINS[ticker];
                cId = coin.chainId;
                tokenAddr = coin.address;
            } else {
                cId = chainId ?? CHAIN_IDS.ETH;
                tokenAddr = options.tokenAddress ?? ticker;
            }

            const token = await getToken(cId, tokenAddr);

            const text = [
                `💰 **$${token.symbol ?? ticker}** on chain ${cId}`,
                `• Name: ${token.name}`,
                `• Price: $${parseFloat(token.priceUSD ?? '0').toFixed(8)}`,
                `• Decimals: ${token.decimals}`,
                `• Address: ${token.address}`,
            ].join('\n');

            if (callback) await callback({ text, actions: ['LIFI_GET_TOKEN_INFO'], data: token });
            return { text, success: true, data: token };
        } catch (error) {
            logger.error({ error }, '[LIFI_GET_TOKEN_INFO] Error');
            const msg = `Token lookup failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, actions: ['LIFI_GET_TOKEN_INFO'] });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'what is the price of $BRETT?', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '💰 $BRETT on chain 8453...', actions: ['LIFI_GET_TOKEN_INFO'] },
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
