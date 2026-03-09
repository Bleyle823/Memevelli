// ─────────────────────────────────────────────────────────
//  Action: LIFI_CHECK_BALANCE
//  Checks wallet USDC balance + open position values
// ─────────────────────────────────────────────────────────

import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { formatUnits } from 'viem';
import { LiFiService } from '../service.js';
import { USDC_ADDRESSES, CHAIN_IDS } from '../constants.js';

// Minimal ERC20 ABI for balanceOf
const ERC20_ABI = [
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

export const checkBalanceAction: Action = {
    name: 'LIFI_CHECK_BALANCE',
    similes: ['MY_BALANCE', 'CHECK_WALLET', 'WALLET_BALANCE', 'HOW_MUCH_DO_I_HAVE'],
    description:
        'Checks the agent wallet\'s USDC balance across Arbitrum and Base, ' +
        'plus current open position values and total portfolio PnL.',

    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        return !!service?.walletAddress;
    },

    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
        _options: any,
        callback?: HandlerCallback,
    ): Promise<ActionResult> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        if (!service?.walletAddress) {
            return { success: false, error: new Error('Wallet not configured') };
        }

        const agentId = runtime.agentId;

        try {
            // Check USDC on ARB and BASE (our primary trading chains)
            const balances: Record<string, number> = {};
            const checkChains = [
                { key: 'ARB', chainId: CHAIN_IDS.ARB },
                { key: 'BASE', chainId: CHAIN_IDS.BASE },
                { key: 'ETH', chainId: CHAIN_IDS.ETH },
            ];

            for (const { key, chainId } of checkChains) {
                const client = service.publicClients.get(chainId);
                const usdcAddr = USDC_ADDRESSES[chainId];
                if (!client || !usdcAddr) continue;

                try {
                    const raw = await client.readContract({
                        address: usdcAddr as `0x${string}`,
                        abi: ERC20_ABI,
                        functionName: 'balanceOf',
                        args: [service.walletAddress as `0x${string}`],
                    });
                    balances[key] = parseFloat(formatUnits(raw as bigint, 6));
                } catch {
                    balances[key] = 0;
                }
            }

            const portfolio = service.getPortfolio(agentId);
            const totalUSDC = Object.values(balances).reduce((s, v) => s + v, 0);

            const text = [
                `💼 **Wallet Balance**`,
                ...Object.entries(balances).map(([chain, bal]) => `• USDC on ${chain}: $${bal.toFixed(2)}`),
                `• Total USDC: $${totalUSDC.toFixed(2)}`,
                ``,
                `📊 **Portfolio**`,
                `• Open positions: ${portfolio.positions.length}`,
                `• Exposure: $${portfolio.totalExposureUSD.toFixed(2)}`,
                `• Unrealized PnL: ${portfolio.unrealizedPnlUSD >= 0 ? '+' : ''}$${portfolio.unrealizedPnlUSD.toFixed(2)}`,
                `• Realized PnL:   ${portfolio.realizedPnlUSD >= 0 ? '+' : ''}$${portfolio.realizedPnlUSD.toFixed(2)}`,
                `• Total PnL:      ${portfolio.totalPnlUSD >= 0 ? '+' : ''}$${portfolio.totalPnlUSD.toFixed(2)}`,
            ].join('\n');

            if (callback) await callback({ text, actions: ['LIFI_CHECK_BALANCE'], data: { balances, portfolio } });
            return { text, success: true, data: { balances, portfolio } };
        } catch (error) {
            logger.error({ error }, '[LIFI_CHECK_BALANCE] Error');
            const text = `Balance check failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text, actions: ['LIFI_CHECK_BALANCE'] });
            return {
                success: false,
                text,
                data: { error: error instanceof Error ? error.message : String(error), actionName: 'LIFI_CHECK_BALANCE' }
            };
        }
    },

    examples: [
        [
            { name: '{{user}}', content: { text: 'check my wallet balance', actions: [] } },
            {
                name: '{{agent}}',
                content: { text: '💼 Wallet Balance\n• USDC on ARB: $67.32...', actions: ['LIFI_CHECK_BALANCE'] },
            },
        ],
    ],
};
