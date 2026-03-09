# **MEMEVELLI: Autonomous Capital Agents**

![Memevelli Banner](./memevelli_banner_1773063048752.png)

## **Build autonomous agents that move capital across chains**

AI agents are becoming the new users of crypto. They trade, they farm yield, they rebalance portfolios, and they execute strategies faster and more consistently than humans ever could.

**Memevelli** is an autonomous agent framework powered by [ElizaOS](https://github.com/elizaos/eliza) and [LI.FI](https://li.fi/), designed to move capital across chains, protocols, and ecosystems through a single unified interface.

---

## **Why This Plugin Matters: The Missing LI.FI x ElizaOS Bridge**

> **There is currently no independent, production-ready LI.FI plugin in the official ElizaOS plugin registry.**

[ElizaOS](https://github.com/elizaos/eliza) is the **largest and most widely adopted crypto AI agent framework** in the ecosystem, with thousands of developers building on it. Despite this, there has been no native way for Eliza agents to perform cross-chain token swaps, bridges, or memecoin purchases using real on-chain execution — until now.

**Memevelli fills this gap** by introducing `@elizaos/plugin-lifi`, a fully functional, open-source LI.FI plugin that:

- Integrates cleanly with the ElizaOS agent architecture
- Exposes bridge, buy, and balance-check actions to any Eliza character
- Is designed to be submitted to the **official ElizaOS plugin registry** so every future Eliza developer can benefit from it

This means that any developer building an Eliza agent — whether for trading bots, portfolio managers, or autonomous DeFi participants — will be able to drop in this plugin and gain full cross-chain execution power through LI.FI, without having to build it themselves.

---

## **Objective**

The goal of Memevelli is to provide a working template for an AI agent that uses **LI.FI** to execute real on-chain strategies. Memevelli doesn't just call a swap endpoint; it actively uses LI.FI as part of its autonomous execution loop to:

- **Move funds** across chains to follow the most viral narratives.
- **Execute trades** on meme coins across Arbitrum, Base, BSC, Ethereum, and more.
- **Rebalance portfolios** based on real-time sentiment analysis and alpha signals.

---

## **Key Capabilities (Powered by LI.FI)**

Memevelli integrates the LI.FI SDK directly into the agent's decision-making process via custom actions:

### 🔄 **LIFI_EXECUTE_BRIDGE**
Allows the agent to move USDC across any supported chain. If the agent detects a hot narrative on Base but its funds are on Arbitrum, it will automatically bridge the capital to where the action is.
- *Example:* `"Bridge 0.5 USDC from Base to Arbitrum"`

### 🚀 **LIFI_EXECUTE_BUY**
Enables the agent to purchase meme tokens on any target chain using its current holdings. The agent calculates the best route via LI.FI to minimize slippage and gas costs.
- *Example:* `"Buy $WIF on BSC"` or `"The PEPE narrative is heating up, buy some."`

### 📊 **LIFI_CHECK_BALANCE**
Provides the agent with real-time visibility into its multichain holdings, allowing it to make informed allocations.

---

## **You Don't Need USDC on Every Chain**

This is one of the most powerful — and least understood — features of the LI.FI integration.

**Traditional platforms require you to manually bridge funds before you can trade on a new chain.** If you want to buy a memecoin on Base but all your USDC is on Arbitrum, you'd normally have to:
1. Go to a bridge
2. Wait for the bridge to complete
3. Go to a DEX on Base
4. Execute the trade

**With Memevelli, the agent handles all of this in a single command.** The LI.FI plugin automatically detects which chain has sufficient liquidity, initiates the bridge, and executes the buy — all in one unified flow. You can hold all your capital on Arbitrum and still buy memecoins on Base, Ethereum, or BSC without ever manually moving funds.

### **Memevelli vs. GmGn (and similar platforms)**

| Feature | GmGn / Photon / BullX | Memevelli + LI.FI |
|---|---|---|
| Cross-chain buying | ❌ Manual bridging required | ✅ Automatic, agent-driven |
| Natural language input | ❌ Manual UI clicks | ✅ `"Buy PEPE on Ethereum"` |
| Autonomous strategy execution | ❌ Human operated | ✅ Fully autonomous |
| Multi-agent coordination | ❌ Single user | ✅ Multiple characters (Edd, Ed, Eddy) |
| Narrative-driven trading | ❌ Not supported | ✅ Built-in via ElizaOS |
| Requires funds per chain | ✅ Yes | ❌ No, LI.FI bridges automatically |

Platforms like GmGn are excellent for manual traders who want speed and convenience on a single chain. **Memevelli is for the next paradigm** — where the agent *is* the trader, operating across all chains simultaneously, without human intervention.

---

## **Live Transaction Explorer**

The following transactions demonstrate Memevelli agents executing real on-chain strategies via the LI.FI plugin.

### 🟢 Buy Brett on Base
| # | Description | Tx Hash | Explorer Link |
|---|---|---|---|
| 1 | Agent buys $BRETT on Base | *(coming soon)* | *(coming soon)* |
| 2 | Agent buys $BRETT on Base | *(coming soon)* | *(coming soon)* |

### 🟣 Buy Bonk on Arbitrum
| # | Description | Tx Hash | Explorer Link |
|---|---|---|---|
| 1 | Agent buys $BONK on Arbitrum | *(coming soon)* | *(coming soon)* |
| 2 | Agent buys $BONK on Arbitrum | *(coming soon)* | *(coming soon)* |

### 🔵 Buy Pepe on Ethereum
| # | Description | Tx Hash | Explorer Link |
|---|---|---|---|
| 1 | Agent buys $PEPE on Ethereum | *(coming soon)* | *(coming soon)* |
| 2 | Agent buys $PEPE on Ethereum | *(coming soon)* | *(coming soon)* |

### 🔴 Sell Brett on Base
| # | Description | Tx Hash | Explorer Link |
|---|---|---|---|
| 1 | Agent sells $BRETT on Base | *(coming soon)* | *(coming soon)* |
| 2 | Agent sells $BRETT on Base | *(coming soon)* | *(coming soon)* |

### 🌉 USDC Cross-Chain Bridge
| # | Description | Tx Hash | Explorer Link |
|---|---|---|---|
| 1 | Agent bridges USDC from Arbitrum → Base | *(coming soon)* | *(coming soon)* |
| 2 | Agent bridges USDC from Base → Ethereum | *(coming soon)* | *(coming soon)* |

> All transactions are executed by autonomous agents using the `@elizaos/plugin-lifi` plugin. No manual intervention required.

---

## **Why LI.FI?**

LI.FI gives Memevelli-powered agents the ability to navigate the fragmented liquidity of the multichain world. By using the **LI.FI SDK**, Memevelli-powered agents can:

- Source liquidity from over 30+ DEXs.
- Access 14+ Bridges.
- Support 20+ Chains.
- Handle complex cross-chain swaps in a single transaction.

---

## **Getting Started**

### **Prerequisites**

- [Node.js](https://nodejs.org/) (v23+)
- [Bun](https://bun.sh/) (v1.1+)
- An **OpenRouter API key** — used as the LLM backend for the Eliza agents. Get one at [openrouter.ai](https://openrouter.ai/)
- A **wallet private key** — a burner wallet is strongly recommended. The agent will use this wallet to sign and send transactions. Fund it with a small amount of USDC and native gas tokens (ETH on Base/Arbitrum, etc.)
- Your **wallet public address** — the checksummed address corresponding to your private key
- *(Optional)* A **LI.FI API key** — not required but unlocks higher rate limits. Get one at [li.fi](https://li.fi/)

> ⚠️ **Security Warning:** Never use a wallet that holds significant funds. Always use a dedicated burner wallet for agent operations. Your private key will be stored in a `.env` file — never commit this file to source control.

---

### **Installation — Windows**

1. **Install prerequisites:**
   - Download and install [Node.js v23+](https://nodejs.org/en/download)
   - Install Bun by opening **PowerShell** and running:
     ```powershell
     powershell -c "irm bun.sh/install.ps1 | iex"
     ```
   - Restart your terminal after installation.

2. **Clone the repository:**
   ```powershell
   git clone https://github.com/Bleyle823/Memevelli.git
   cd Memevelli
   ```

3. **Install dependencies:**
   ```powershell
   bun install
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root of the project and add the following:
   ```env
   # LLM Provider — OpenRouter is required
   OPENROUTER_API_KEY=your_openrouter_api_key_here

   # Agent Wallet
   WALLET_PRIVATE_KEY=your_burner_wallet_private_key_here
   WALLET_ADDRESS=your_burner_wallet_public_address_here

   # Optional: LI.FI API Key (for higher rate limits)
   LIFI_API_KEY=your_lifi_api_key_here
   ```

5. **Build the project:**
   ```powershell
   bun run build
   ```

6. **Launch the agents:**
   ```powershell
   # Launch all three agents (Edd, Ed, and Eddy)
   bun run ./packages/cli/dist/index.js start --character characters/edd.json --character characters/ed.json --character characters/eddy.json

   # Or launch a single agent
   bun run ./packages/cli/dist/index.js start --character characters/edd.json
   ```

---

### **Installation — macOS**

1. **Install prerequisites:**
   - Install [Homebrew](https://brew.sh/) if you don't have it:
     ```bash
     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
     ```
   - Install Node.js v23+:
     ```bash
     brew install node@23
     ```
   - Install Bun:
     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```
   - Restart your terminal (or run `source ~/.zshrc`) after installation.

2. **Clone the repository:**
   ```bash
   git clone https://github.com/Bleyle823/Memevelli.git
   cd Memevelli
   ```

3. **Install dependencies:**
   ```bash
   bun install
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root of the project:
   ```bash
   touch .env
   ```
   Then open it with any text editor and add:
   ```env
   # LLM Provider — OpenRouter is required
   OPENROUTER_API_KEY=your_openrouter_api_key_here

   # Agent Wallet
   WALLET_PRIVATE_KEY=your_burner_wallet_private_key_here
   WALLET_ADDRESS=your_burner_wallet_public_address_here

   # Optional: LI.FI API Key (for higher rate limits)
   LIFI_API_KEY=your_lifi_api_key_here
   ```

5. **Build the project:**
   ```bash
   bun run build
   ```

6. **Launch the agents:**
   ```bash
   # Launch all three agents (Edd, Ed, and Eddy)
   bun run ./packages/cli/dist/index.js start --character characters/edd.json --character characters/ed.json --character characters/eddy.json

   # Or launch a single agent
   bun run ./packages/cli/dist/index.js start --character characters/edd.json
   ```

---

### **Environment Variables Reference**

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ Yes | API key from [openrouter.ai](https://openrouter.ai). Powers the LLM reasoning behind each agent. |
| `WALLET_PRIVATE_KEY` | ✅ Yes | Private key of your burner wallet. Used to sign on-chain transactions. |
| `WALLET_ADDRESS` | ✅ Yes | Public address of your burner wallet. |
| `LIFI_API_KEY` | ❌ Optional | Unlocks higher API rate limits from LI.FI. |

---

## **Vibeathon Submission Requirements**

### 1. **Working Agent**
Memevelli is a fully functional agent capable of cross-chain execution. You can verify this by running the test script:
```bash
bun exec scripts/test-lifi-final.ts
```

### 2. **Execution Video**
The submission video for Memevelli demonstrates:
- The agent parsing a narrative-driven prompt.
- Identifying the need for cross-chain movement.
- Executing a bridge/swap via LI.FI.
- Confirming the transaction on-chain.

---

## **Technical Architecture**

Memevelli extends the ElizaOS framework with a specialized `@elizaos/plugin-lifi`. This plugin leverages the `LiFiService` to interact with the LI.FI SDK, ensuring typed, safe, and efficient multichain operations.

- **Plugin Path:** `packages/plugin-lifi/`
- **Core Actions:** `executeBuy.action.ts`, `executeBridge.action.ts`, `checkBalance.action.ts`
- **Service:** `service.ts`
- **Characters:** `characters/edd.json`, `characters/ed.json`, `characters/eddy.json`

---

Built for the **LI.FI Vibeathon** | March 9th, 2026
