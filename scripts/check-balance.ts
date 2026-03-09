
import { LiFiService } from '../packages/plugin-lifi/src/service.ts';
import { checkBalanceAction } from '../packages/plugin-lifi/src/actions/checkBalance.action.ts';
import { MEME_COINS } from '../packages/plugin-lifi/src/constants.ts';
import { formatUnits } from 'viem';
import dotenv from 'dotenv';

dotenv.config();

const ERC20_ABI = [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const;

async function checkBalance() {
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

    for (const chainId of [8453, 42161, 1]) {
        const client = service.publicClients.get(chainId);
        if (client) {
            try {
                const bal = await client.getBalance({ address: service.walletAddress as any });
                const eth = Number(bal) / 1e18;
                console.log(`ETH Balance on chain ${chainId}: ${eth.toFixed(6)} ETH`);
            } catch (e) {
                console.error(`Error checking ETH on ${chainId}:`, e);
            }
        }
    }

    for (const [ticker, coin] of Object.entries(MEME_COINS)) {
        const client = service.publicClients.get(coin.chainId);
        if (client) {
            try {
                const bal = await client.readContract({
                    address: coin.address as any,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [service.walletAddress as any]
                });
                const formatted = formatUnits(bal as bigint, coin.decimals);
                if (parseFloat(formatted) > 0) {
                    console.log(`Balance of ${ticker} on ${coin.chainKey}: ${formatted}`);
                }
            } catch (e) { }
        }
    }

    const result = await checkBalanceAction.handler(runtime, {} as any, {} as any, {}, async (msg) => {
        console.log(msg.text);
        return [];
    });

    process.exit(0);
}

checkBalance().catch(err => {
    console.error(err);
    process.exit(1);
});
