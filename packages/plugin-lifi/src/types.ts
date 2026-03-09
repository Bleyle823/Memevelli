// ─────────────────────────────────────────────────────────
//  Shared TypeScript interfaces for plugin-lifi
// ─────────────────────────────────────────────────────────

export interface Position {
    agentId: string;
    ticker: string;
    chain: string;
    chainId: number;
    tokenAddress: string;
    entryPrice: number;     // USD at entry
    currentPrice: number;
    sizeUSD: number;
    tokenAmount: string;    // raw token amount (bigint string)
    entryScore: number;     // narrative score at entry
    openedAt: Date;
    txHash: string;
    [key: string]: any;
}

export interface TradeEvent {
    id: string;
    agentId: string;
    agentName: string;
    type: 'BUY' | 'SELL' | 'SKIP' | 'THOUGHT' | 'ERROR';
    ticker?: string;
    chain?: string;
    reason: string;
    txHash?: string;
    pnlUSD?: number;
    ts: string;
    [key: string]: any;
}

export interface MentionData {
    ticker: string;
    mentionsLastHour: number;
    mentionsLastDay: number;
    positiveRatio: number;       // 0.0–1.0
    uniqueAuthors: number;
    sampleTweets: string[];
    chain: string;               // chain where this token is most active
}

export interface NarrativeScore {
    ticker: string;
    score: number;               // 0.0–1.0 composite
    velocity: number;            // mentions acceleration ratio
    signal: 'BUY' | 'SELL' | 'HOLD' | 'NONE';
    reason: string;
    chain: string;
}

export interface QuoteResult {
    success: boolean;
    fromToken: string;
    toToken: string;
    fromChain: string;
    toChain: string;
    fromAmountUSD: number;
    toAmount: string;
    estimatedToAmountUSD: number;
    gasCostUSD: number;
    bridge?: string;
    exchange?: string;
    route?: any;  // raw LI.FI route object for execution
    error?: string;
    [key: string]: any;
}

export interface ExecuteResult {
    success: boolean;
    txHash?: string;
    fromAmount: string;
    toAmount: string;
    priceUSD: number;
    chain: string;
    error?: string;
}

export interface StatusResult {
    status: 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND';
    substatus?: string;
    sending?: { txHash: string; amount: string; chainId: number };
    receiving?: { txHash: string; amount: string; chainId: number };
    lifiExplorerLink?: string;
    [key: string]: any;
}

export interface AgentPortfolio {
    agentId: string;
    positions: Position[];
    totalExposureUSD: number;
    realizedPnlUSD: number;
    unrealizedPnlUSD: number;
    totalPnlUSD: number;
}
