
import { LiFiService } from '../packages/plugin-lifi/src/service.ts';
import { checkBalanceAction } from '../packages/plugin-lifi/src/actions/checkBalance.action.ts';
import { executeBuyAction } from '../packages/plugin-lifi/src/actions/executeBuy.action.ts';
import { executeSellAction } from '../packages/plugin-lifi/src/actions/executeSell.action.ts';
import { lifiPlugin } from '../packages/plugin-lifi/src/plugin.ts';
import { logger } from '@elizaos/core';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testLifi() {
    console.log("Starting LiFi Plugin Real Wallet Test...");

    // Mock Runtime
    const runtime = {
        agentId: 'test-agent',
        character: { name: 'Alpha' },
        getSetting: (key: string) => process.env[key],
        getService: (type: string) => {
            if (type === 'lifi') return service;
            return null;
        },
        registerService: () => { },
    } as any;

    const service = await LiFiService.start(runtime);

    console.log("Wallet Address:", service.walletAddress);

    // 1. Check Balance
    console.log("\n--- Testing LIFI_CHECK_BALANCE ---");
    const balanceResult = await checkBalanceAction.handler(runtime, {} as any, {} as any, {}, async (msg) => {
        console.log("Agent Callback:", msg.text);
        return [];
    });
    console.log("Result:", balanceResult.success ? "SUCCESS" : "FAILED");
    if (!balanceResult.success) {
        console.error("Balance check failed:", balanceResult.error);
        return;
    }

    // 2. Execute Buy (Small amount of $BRETT on Base)
    console.log("\n--- Testing LIFI_EXECUTE_BUY ($1 of $BRETT on Base) ---");
    const buyResult = await executeBuyAction.handler(runtime, { content: { text: "buy $BRETT" } } as any, {} as any, { ticker: "BRETT", amountUSD: 1 }, async (msg) => {
        console.log("Agent Callback:", msg.text);
        return [];
    });
    console.log("Result:", buyResult.success ? "SUCCESS" : "FAILED");

    if (!buyResult.success) {
        console.error("Buy failed:", buyResult.error || "Unknown error");
        // Print data if available
        if (buyResult.data) console.log("Data:", JSON.stringify(buyResult.data, null, 2));
        return;
    }

    // 3. Check Balance again
    console.log("\n--- Checking Balance after Buy ---");
    await checkBalanceAction.handler(runtime, {} as any, {} as any, {}, async (msg) => {
        console.log("Agent Callback:", msg.text);
        return [];
    });

    // 4. Execute Sell
    console.log("\n--- Testing LIFI_EXECUTE_SELL ($BRETT) ---");
    const sellResult = await executeSellAction.handler(runtime, { content: { text: "sell $BRETT" } } as any, {} as any, { ticker: "BRETT" }, async (msg) => {
        console.log("Agent Callback:", msg.text);
        return [];
    });
    console.log("Result:", sellResult.success ? "SUCCESS" : "FAILED");
    if (!sellResult.success) {
        console.error("Sell failed:", sellResult.error || "Unknown error");
    }

    console.log("\nTest Completed.");
    process.exit(0);
}

testLifi().catch(console.error);
