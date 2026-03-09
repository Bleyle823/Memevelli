
import { AgentRuntime } from '../packages/core/src/runtime';
import { lifiPlugin } from '../packages/plugin-lifi/src/plugin';
import { LiFiService } from '../packages/plugin-lifi/src/service';
import { plugin as sqlPlugin } from '../packages/plugin-sql/src/index';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

async function testActions() {
    const runtime = new AgentRuntime({
        character: {
            name: 'Alpha',
            plugins: [lifiPlugin as any, sqlPlugin as any],
            settings: {
                secrets: {
                    WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
                    LIFI_API_KEY: process.env.LIFI_API_KEY || ''
                }
            }
        },
        settings: {
            PGLITE_DATA_DIR: 'memory://',
            WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
            LIFI_API_KEY: process.env.LIFI_API_KEY || ''
        }
    });

    try {
        console.log('--- Initializing Runtime ---');
        await runtime.initialize();
    } catch (e) {
        console.error('Initialization failed:', e);
        process.exit(1);
    }

    const service = runtime.getService<LiFiService>(LiFiService.serviceType);
    if (!service) {
        throw new Error('LiFiService not found after init');
    }

    console.log('--- Testing LIFI_EXECUTE_BUY ---');
    try {
        await runtime.processActions(
            {
                id: randomUUID() as any,
                entityId: runtime.agentId,
                roomId: runtime.agentId,
                content: { text: 'buy $BRETT on BASE narrative is hot', actions: ['LIFI_EXECUTE_BUY'] }
            } as any,
            [{
                id: randomUUID() as any,
                entityId: runtime.agentId,
                roomId: runtime.agentId,
                content: { text: 'BOUGHT $BRETT', actions: ['LIFI_EXECUTE_BUY'] }
            }] as any,
            undefined,
            async (msg) => {
                console.log('Callback output:', msg.text);
                return [];
            }
        );
    } catch (e) {
        console.error('Buy Action execution error:', e);
    }

    // Check internal state of service
    const portfolio = service.getPortfolio(runtime.agentId);
    console.log('Portfolio Positions:', portfolio.positions.length);
    if (portfolio.positions.length > 0) {
        console.log('Position Ticker:', portfolio.positions[0].ticker);
    }

    console.log('--- Testing LIFI_GET_QUOTE ---');
    try {
        await runtime.processActions(
            {
                id: randomUUID() as any,
                entityId: runtime.agentId,
                roomId: runtime.agentId,
                content: { text: 'get a quote for $WIF on ARB', actions: ['LIFI_GET_QUOTE'] }
            } as any,
            [{
                id: randomUUID() as any,
                entityId: runtime.agentId,
                roomId: runtime.agentId,
                content: { text: 'QUOTE $WIF', actions: ['LIFI_GET_QUOTE'] }
            }] as any,
            undefined,
            async (msg) => {
                console.log('Callback output:', msg.text);
                return [];
            }
        );
    } catch (e) {
        console.error('Quote Action execution error:', e);
    }

    process.exit(0);
}

testActions().catch(err => {
    console.error('Fatal test script error:', err);
    process.exit(1);
});
