// ─────────────────────────────────────────────────────────
//  Provider: PORTFOLIO_PROVIDER
//  Injects agent's open positions and PnL into LLM context
// ─────────────────────────────────────────────────────────

import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from '@elizaos/core';
import { LiFiService } from '../service.js';

export const portfolioProvider: Provider = {
    name: 'PORTFOLIO_PROVIDER',
    description: 'Provides the agent\'s current open positions, exposure, and PnL summary for decision-making.',

    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
    ): Promise<ProviderResult> => {
        const service = runtime.getService<LiFiService>(LiFiService.serviceType);
        if (!service) {
            return { text: 'Portfolio: LiFiService not available', values: {}, data: {} };
        }

        const portfolio = service.getPortfolio(runtime.agentId);
        const { positions, totalExposureUSD, realizedPnlUSD, unrealizedPnlUSD, totalPnlUSD } = portfolio;

        const posText = positions.length === 0
            ? 'No open positions.'
            : positions.map(p => {
                const pnlPct = ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(1);
                return `  • $${p.ticker} on ${p.chain}: $${p.sizeUSD} entry, currently ${pnlPct}% PnL`;
            }).join('\n');

        const text = [
            '=== PORTFOLIO STATUS ===',
            posText,
            `Open exposure: $${totalExposureUSD.toFixed(2)}`,
            `Realized PnL: ${realizedPnlUSD >= 0 ? '+' : ''}$${realizedPnlUSD.toFixed(2)}`,
            `Unrealized PnL: ${unrealizedPnlUSD >= 0 ? '+' : ''}$${unrealizedPnlUSD.toFixed(2)}`,
            `Total PnL: ${totalPnlUSD >= 0 ? '+' : ''}$${totalPnlUSD.toFixed(2)}`,
            '========================',
        ].join('\n');

        return {
            text,
            values: { totalPnlUSD, totalExposureUSD, openPositionCount: positions.length },
            data: portfolio,
        };
    },
};
