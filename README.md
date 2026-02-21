# Local Omnichain Asset Bridge

This project implements a two-chain asset bridge with a Node.js relayer and cross-chain governance. It demonstrates bridge architecture, relayer reliability, and smart contract security patterns.

## Architecture

The system consists of:
- **Chain A (Settlement Chain)**: Hosting `VaultToken`, `BridgeLock` (Liquidity Pool), and `GovernanceEmergency`.
- **Chain B (Execution Chain)**: Hosting `WrappedVaultToken`, `BridgeMint`, and `GovernanceVoting`.
- **Relayer Service**: An off-chain Node.js service that listens to events and executes transactions on both chains.
- **Dockerized Environment**: Using specific Docker containers for chains (Anvil) and the relayer.

### User Flow
1. **Lock & Mint**: User locks `VaultToken` on Chain A. Relayer detects `Locked` event. Relayer mints `WrappedVaultToken` on Chain B.
2. **Burn & Unlock**: User burns `WrappedVaultToken` on Chain B. Relayer detects `Burned` event. Relayer unlocks `VaultToken` on Chain A.
3. **Governance**: Users vote on Chain B. If proposal passes (`ProposalPassed`), Relayer pauses `BridgeLock` on Chain A.

## Setup & Running

### Prerequisites
- Docker & Docker Compose
- Node.js & NPM

### Configuration
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   (Already configured with default local keys/ports)

### Start the System
1. Start the blockchain nodes (Chain A & Chain B):
   ```bash
   docker-compose up -d chain-a chain-b
   ```

2. Deploy the Smart Contracts:
   ```bash
   # Install dependencies locally first
   npm install
   # Run deployment script
   npm run deploy
   # Or directly: npx hardhat run scripts/deploy.js --network localhost
   ```
   *Note: This generates `deployments.json` which the relayer needs.*

3. Start the Relayer:
   ```bash
   docker-compose up -d relayer
   ```
   The relayer will wait until `deployments.json` is available and valid.

### Running Tests
Integration tests run against the local dockerized environment. Ensure full system is running (steps 1-3).

```bash
npx hardhat test tests/integration_test.js
```

This test suite verifies:
- Token Locking & Minting (End-to-End)
- Token Burning & Unlocking
- Relayer Recovery (Restarting relayer while events occur)
- Cross-Chain Governance (Pausing the bridge)

## Project Structure
- `contracts/`: Solidity smart contracts for both chains.
- `scripts/`: Deployment scripts.
- `relayer/`: Node.js relayer service (Dockerized).
- `tests/`: Integration tests using Hardhat & Ethers.
- `docker-compose.yml`: Service orchestration.

## Security Features
- **Replay Protection**: Relayer uses a local SQLite database to track processed nonces.
- **Role-Based Access**: Only the Relayer can mint/unlock, only Governance can pause.
- **Confirmation Depth**: Relayer waits for 3 block confirmations before processing.
