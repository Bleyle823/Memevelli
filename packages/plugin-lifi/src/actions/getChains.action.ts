// ─────────────────────────────────────────────────────────
//  Action: LIFI_GET_CHAINS
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getChains, ChainType } from '@lifi/sdk';

export const getChainsAction: Action = {
    name: 'LIFI_GET_CHAINS',
    similes: ['SUPPORTED_CHAINS', 'LIST_CHAINS', 'WHAT_CHAINS'],
    description: 'Returns all chains supported by LI.FI for cross-chain swaps and bridging.',

    validate: async (): Promise<boolean> => true,

    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
        _options: any = {},
        callback?: HandlerCallback,
        responses?: Memory[],
    ): Promise<ActionResult> => {
        try {
            const chains = await getChains({ chainTypes: [ChainType.EVM] });
            const text = [
                `🔗 **${chains.length} EVM Chains supported by LI.FI:**`,
                chains.slice(0, 20).map(c => `• ${c.name} (ID: ${c.id})`).join('\n'),
                chains.length > 20 ? `...and ${chains.length - 20} more` : '',
            ].filter(Boolean).join('\n');

            if (callback) await callback({ text, actions: ['LIFI_GET_CHAINS'], data: chains as any });
            return { text, success: true, data: chains as any };
        } catch (error) {
            logger.error({ error }, '[LIFI_GET_CHAINS] Error');
            const text = `Failed to fetch chains: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text, actions: ['LIFI_GET_CHAINS'] });
            return {
                success: false,
                text,
                data: { error: error instanceof Error ? error.message : String(error), actionName: 'LIFI_GET_CHAINS' }
            };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'what chains does lifi support?', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '🔗 42 EVM Chains supported...', actions: ['LIFI_GET_CHAINS'] },
            },
        ],
    ],
};
