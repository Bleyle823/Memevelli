// ─────────────────────────────────────────────────────────
//  Constants: Chain IDs, Token Addresses, Meme Coin Registry
// ─────────────────────────────────────────────────────────

export const CHAIN_IDS = {
    ETH: 1,
    BSC: 56,
    POL: 137,
    ARB: 42161,
    OPT: 10,
    BASE: 8453,
    AVA: 43114,
    LIN: 59144,     // Linea
} as const;

export type ChainKey = keyof typeof CHAIN_IDS;

// USDC contract addresses per chain (6 decimals)
export const USDC_ADDRESSES: Record<number, string> = {
    [CHAIN_IDS.ETH]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [CHAIN_IDS.BSC]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    [CHAIN_IDS.POL]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    [CHAIN_IDS.ARB]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    [CHAIN_IDS.OPT]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    [CHAIN_IDS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [CHAIN_IDS.AVA]: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

// Native ETH/gas token (zero address convention)
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

// Meme coin registry — chain + contract addresses for buying
export interface MemeCoinEntry {
    ticker: string;
    chainId: number;
    chainKey: string;
    address: string;        // token contract address
    decimals: number;
    coingeckoId?: string;
    twitterHashtag: string;
}

export const MEME_COINS: Record<string, MemeCoinEntry> = {
    BRETT: {
        ticker: 'BRETT',
        chainId: CHAIN_IDS.BASE,
        chainKey: 'BASE',
        address: '0x532f27101965dd16442e59d40670faf5ebb142e4',
        decimals: 18,
        twitterHashtag: '$BRETT',
    },
    WIF: {
        ticker: 'WIF',
        chainId: CHAIN_IDS.ARB,  // bridged from Solana — use ARB USDC path
        chainKey: 'ARB',
        address: '0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6', // wormhole wrapped WIF on Arbitrum
        decimals: 6,
        twitterHashtag: '$WIF',
    },
    PEPE: {
        ticker: 'PEPE',
        chainId: CHAIN_IDS.ETH,
        chainKey: 'ETH',
        address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
        decimals: 18,
        twitterHashtag: '$PEPE',
    },
    BONK: {
        ticker: 'BONK',
        chainId: CHAIN_IDS.ARB,
        chainKey: 'ARB',
        address: '0x09199d9A5F4448D0848e4395D065d1D88C1428e9',
        decimals: 5,
        twitterHashtag: '$BONK',
    },
    FLOKI: {
        ticker: 'FLOKI',
        chainId: CHAIN_IDS.ETH,
        chainKey: 'ETH',
        address: '0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E',
        decimals: 9,
        twitterHashtag: '$FLOKI',
    },
    DOGE: {
        ticker: 'DOGE',
        chainId: CHAIN_IDS.BSC,
        chainKey: 'BSC',
        address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
        decimals: 8,
        twitterHashtag: '$DOGE',
    },
};

export const WATCHED_TICKERS = Object.keys(MEME_COINS);

// Narrative scoring thresholds
export const SCORE_BUY_DEFAULT = 0.70;
export const SCORE_SELL_DEFAULT = 0.40;
export const MIN_UNIQUE_AUTHORS = 50;

// Risk defaults
export const DEFAULT_POSITION_SIZE_USD = 1.5;   // ~$1.5 per trade (3 positions = $4.5 max)
export const MAX_POSITIONS = 3;
export const MAX_EXPOSURE_USD = 100;
export const STOP_LOSS_PCT = 0.15;  // exit at -15%
export const TAKE_PROFIT_PCT = 0.40;  // exit at +40%

// LI.FI SDK
export const LIFI_INTEGRATOR = 'NarrativeTrader';
export const LIFI_BASE_URL = 'https://li.quest/v1';

// SSE event types
export const SSE_EVENT_TYPES = {
    BUY: 'BUY',
    SELL: 'SELL',
    SKIP: 'SKIP',
    THOUGHT: 'THOUGHT',
    ERROR: 'ERROR',
    PRICE: 'PRICE',
    STATE: 'STATE',
} as const;
