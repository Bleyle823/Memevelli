
import { AgentRuntime } from '../packages/core/src/runtime';
import { lifiPlugin } from '../packages/plugin-lifi/src/plugin';
import { LiFiService } from '../packages/plugin-lifi/src/service';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

// Mock Database Adapter
const mockAdapter: any = {
    init: async () => { },
    getMemories: async () => [],
    createMemory: async () => { },
    getAccount: async () => null,
    createAccount: async () => true,
    getRoom: async () => null,
    createRoom: async () => randomUUID(),
    log: async () => { },
    getKnowledge: async () => [],
    addKnowledge: async () => { },
    removeKnowledge: async () => { },
    clearKnowledge: async () => { },
    getGoals: async () => [],
    updateGoal: async () => { },
    createGoal: async () => { },
    removeGoal: async () => { },
    removeAllGoals: async () => { },
    getRelationships: async () => [],
    getRelationship: async () => null,
    createRelationship: async () => true,
    getParticipantsForAccount: async () => [],
    getParticipantsForRoom: async () => [],
    getAvailableRooms: async () => [],
};

async function testActions() {
    const runtime = new AgentRuntime({
        character: {
            name: 'Alpha',
            plugins: [lifiPlugin as any],
            settings: {
                secrets: {
                    WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
                    LIFI_API_KEY: process.env.LIFI_API_KEY || ''
                }
            }
        },
        settings: {
            WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
            LIFI_API_KEY: process.env.LIFI_API_KEY || ''
        }
    });

    // Manually register adapter and services to bypass initialize requirement
    (runtime as any).databaseAdapter = mockAdapter;

    // Explicitly init plugin
    await lifiPlugin.init!({}, runtime);

    const service = runtime.getService<LiFiService>(LiFiService.serviceType);
    if (!service) {
        throw new Error('LiFiService not found');
    }

    console.log('--- Testing LIFI_EXECUTE_BUY ---');
    // This will likely fail in getQuote/executeRoute because 0.5 USDC is too small
    // but we want to see a PROPER error result, not legacyResult: { success: false, error: {} }
    const result = await runtime.processActions(
        {
            id: randomUUID() as any,
            entityId: runtime.agentId,
            roomId: runtime.agentId,
            content: { text: 'buy $BRETT', actions: ['LIFI_EXECUTE_BUY'] }
        } as any,
        [{
            id: randomUUID() as any,
            entityId: runtime.agentId,
            roomId: runtime.agentId,
            content: { text: 'BOUGHT $BRETT', actions: ['LIFI_EXECUTE_BUY'] }
        }] as any,
        undefined,
        async (msg) => {
            console.log('Callback:', msg.text);
            return [];
        }
    );

    console.log('Final Result Structure:', JSON.stringify(result, null, 2));

    process.exit(0);
}

testActions().catch(err => {
    console.error('Fatal test script error:', err);
    process.exit(1);
});
