// ─────────────────────────────────────────────────────────
//  Action: LIFI_GET_STATUS
//  Polls LI.FI REST API for tx status, returns DONE/FAILED/PENDING
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { LIFI_BASE_URL } from '../constants.js';
import type { StatusResult } from '../types.js';

export const getStatusAction: Action = {
    name: 'LIFI_GET_STATUS',
    similes: ['CHECK_TX', 'TRANSACTION_STATUS', 'TX_STATUS', 'CHECK_BRIDGE_STATUS'],
    description:
        'Checks the status of a LI.FI cross-chain transaction by its hash. ' +
        'Returns PENDING, DONE, or FAILED with substatus details.',

    validate: async (): Promise<boolean> => true,

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        options: any = {},
        callback?: HandlerCallback,
        responses?: Memory[],
    ): Promise<ActionResult> => {
        // Extract txHash from options (machine) or message text (human)
        const txHash = options.txHash ?? extractTxHash(message.content.text ?? '');
        const fromChain = options.fromChain;
        const toChain = options.toChain;
        const bridge = options.bridge;

        if (!txHash) {
            const msg = 'No transaction hash provided. Please include the tx hash.';
            if (callback) await callback({ text: msg, actions: ['LIFI_GET_STATUS'] });
            return { success: false, error: new Error(msg) };
        }

        try {
            const params = new URLSearchParams({ txHash });
            if (fromChain) params.set('fromChain', String(fromChain));
            if (toChain) params.set('toChain', String(toChain));
            if (bridge) params.set('bridge', bridge);

            const headers: Record<string, string> = {};
            if (process.env.LIFI_API_KEY) {
                headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;
            }

            const res = await fetch(`${LIFI_BASE_URL}/status?${params.toString()}`, { headers });
            if (!res.ok) {
                throw new Error(`LI.FI status API returned ${res.status}`);
            }
            const data = await res.json() as any;

            const result: StatusResult = {
                status: data.status ?? 'NOT_FOUND',
                substatus: data.substatus,
                sending: data.sending ? { txHash: data.sending.txHash, amount: data.sending.amount, chainId: data.sending.chainId } : undefined,
                receiving: data.receiving ? { txHash: data.receiving.txHash, amount: data.receiving.amount, chainId: data.receiving.chainId } : undefined,
                lifiExplorerLink: data.lifiExplorerLink,
            };

            const statusEmoji = result.status === 'DONE' ? '✅' : result.status === 'FAILED' ? '❌' : '⏳';
            const text = [
                `${statusEmoji} **TX Status: ${result.status}**`,
                result.substatus ? `• Substatus: ${result.substatus}` : null,
                result.sending ? `• Sent: TX ${result.sending.txHash.slice(0, 10)}...` : null,
                result.receiving ? `• Received on chain ${result.receiving.chainId}: TX ${result.receiving.txHash.slice(0, 10)}...` : null,
                result.lifiExplorerLink ? `• Explorer: ${result.lifiExplorerLink}` : null,
            ].filter(Boolean).join('\n');

            if (callback) await callback({ text, actions: ['LIFI_GET_STATUS'], data: result });
            return { text, success: true, data: result };
        } catch (error) {
            logger.error({ error }, '[LIFI_GET_STATUS] Error');
            const text = `Status check failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text, actions: ['LIFI_GET_STATUS'] });
            return {
                success: false,
                text,
                data: { error: error instanceof Error ? error.message : String(error), actionName: 'LIFI_GET_STATUS' }
            };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'check status of 0xabc123...', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '✅ TX Status: DONE\n• Sent: TX 0xabc123...', actions: ['LIFI_GET_STATUS'] },
            },
        ],
    ],
};

function extractTxHash(text: string): string | null {
    const match = text.match(/0x[a-fA-F0-9]{64}/);
    return match ? match[0] : null;
}
