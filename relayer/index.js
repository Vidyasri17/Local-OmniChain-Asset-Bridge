const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || "./data/processed_nonces.db";
// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nonce TEXT,
    chainId INTEGER,
    txHash TEXT,
    UNIQUE(nonce, chainId)
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    chainId INTEGER PRIMARY KEY,
    lastProcessedBlock INTEGER
  );
`);

// Deployment Addresses
const DEPLOYMENTS_PATH = process.env.DEPLOYMENTS_PATH || "../deployments.json";
let deployments;

async function waitForDeployments() {
    let retries = 60;
    while (retries > 0) {
        if (fs.existsSync(DEPLOYMENTS_PATH)) {
            try {
                const data = fs.readFileSync(DEPLOYMENTS_PATH, 'utf8');
                if (data.trim().length > 0) {
                    deployments = JSON.parse(data);
                    if (deployments.chainA && deployments.chainB) return;
                }
            } catch (e) { }
        }
        console.log("Waiting for deployments.json...");
        await new Promise(r => setTimeout(r, 2000));
        retries--;
    }
    console.error("Deployments file not found after waiting.");
    process.exit(1);
}

// ... ABIs ...
const CHAIN_A_RPC = process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545";
const CHAIN_B_RPC = process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CONFIRMATIONS = parseInt(process.env.CONFIRMATION_DEPTH || "3");

const BRIDGE_LOCK_ABI = [

    "event Locked(address indexed user, uint256 amount, uint256 nonce)",
    "function unlock(address user, uint256 amount, uint256 nonce) external",
    "function pause() external"
];
const GOVERNANCE_EMERGENCY_ABI = [
    "function pauseBridge() external",
    "event EmergencyActionTriggered(string action)"
];
const BRIDGE_MINT_ABI = [
    "event Burned(address indexed user, uint256 amount, uint256 nonce)",
    "event Minted(address indexed user, uint256 amount, uint256 nonce)",
    "function mintWrapped(address user, uint256 amount, uint256 nonce) external",
    "function burn(uint256 amount) external"
];
const GOVERNANCE_VOTING_ABI = [
    "event ProposalPassed(uint256 proposalId, bytes data)"
];

async function main() {
    await waitForDeployments();

    // ... continue ...
    const providerA = new ethers.JsonRpcProvider(CHAIN_A_RPC);
    const providerB = new ethers.JsonRpcProvider(CHAIN_B_RPC);
    const walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
    const walletB = new ethers.Wallet(PRIVATE_KEY, providerB);

    const bridgeLock = new ethers.Contract(deployments.chainA.BridgeLock, BRIDGE_LOCK_ABI, walletA);
    const govEmergency = new ethers.Contract(deployments.chainA.GovernanceEmergency, GOVERNANCE_EMERGENCY_ABI, walletA);
    const bridgeMint = new ethers.Contract(deployments.chainB.BridgeMint, BRIDGE_MINT_ABI, walletB);
    const govVoting = new ethers.Contract(deployments.chainB.GovernanceVoting, GOVERNANCE_VOTING_ABI, walletB);

    console.log("Relayer started.");
    console.log(`Relayer Wallet Address: ${walletA.address}`);
    console.log(`Chain A Lock: ${deployments.chainA.BridgeLock}`);
    console.log(`Chain B Mint: ${deployments.chainB.BridgeMint}`);

    // Poll loop
    while (true) {
        try {
            await processChainA(providerA, bridgeLock, bridgeMint);
            await processChainB(providerB, bridgeLock, bridgeMint, govVoting, govEmergency);
        } catch (e) {
            console.error("Error in loop:", e);
            if (e.data) console.error("Error Data:", e.data);
            if (e.transaction) console.error("Failed Tx:", e.transaction);
        }
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
    }
}

async function processChainA(provider, bridgeLock, bridgeMint) {
    const chainId = 1111; // Chain A ID
    const currentBlock = await provider.getBlockNumber();
    let lastBlock = getLastBlock(chainId);
    if (lastBlock === 0) {
        lastBlock = currentBlock - 100; // Start from recent
        if (lastBlock < 0) lastBlock = 0;
    }

    const toBlock = currentBlock - CONFIRMATIONS;
    if (toBlock <= lastBlock) return;

    // console.log(`Scanning Chain A from ${lastBlock + 1} to ${toBlock}`);

    // Scan for Locked events
    const filter = bridgeLock.filters.Locked();
    const logs = await bridgeLock.queryFilter(filter, lastBlock + 1, toBlock);

    for (const log of logs) {
        // Parse event
        // Ethers v6 uses log.args
        const user = log.args[0];
        const amount = log.args[1];
        const nonce = log.args[2];

        if (getProcessed(nonce, chainId)) continue;

        console.log(`Detected Locked: User=${user}, Amount=${amount}, Nonce=${nonce}`);

        try {
            const tx = await bridgeMint.mintWrapped(user, amount, nonce);
            console.log(`Sent mintWrapped tx: ${tx.hash}`);
            await tx.wait(); // Confirm transaction
            console.log("Mint confirmed");
            setProcessed(nonce, chainId, tx.hash);
        } catch (e) {
            console.error(`Failed to mint for nonce ${nonce}:`, e);
        }
    }

    setLastBlock(chainId, toBlock);
}

async function processChainB(provider, bridgeLock, bridgeMint, govVoting, govEmergency) {
    const chainId = 2222; // Chain B ID
    const currentBlock = await provider.getBlockNumber();
    let lastBlock = getLastBlock(chainId);
    if (lastBlock === 0) {
        lastBlock = currentBlock - 100;
        if (lastBlock < 0) lastBlock = 0;
    }

    const toBlock = currentBlock - CONFIRMATIONS;
    if (toBlock <= lastBlock) return;

    // console.log(`Scanning Chain B from ${lastBlock + 1} to ${toBlock}`);

    // 1. Scan for Burned events
    const filterBurn = bridgeMint.filters.Burned();
    const logsBurn = await bridgeMint.queryFilter(filterBurn, lastBlock + 1, toBlock);

    for (const log of logsBurn) {
        const user = log.args[0];
        const amount = log.args[1];
        const nonce = log.args[2];

        if (getProcessed(nonce, chainId)) continue;

        console.log(`Detected Burned: User=${user}, Amount=${amount}, Nonce=${nonce}`);

        try {
            const tx = await bridgeLock.unlock(user, amount, nonce);
            console.log(`Sent unlock tx: ${tx.hash}`);
            await tx.wait();
            console.log("Unlock confirmed");
            setProcessed(nonce, chainId, tx.hash);
        } catch (e) {
            console.error(`Failed to unlock for nonce ${nonce}:`, e);
        }
    }

    // 2. Scan for ProposalPassed events
    const filterVote = govVoting.filters.ProposalPassed();
    const logsVote = await govVoting.queryFilter(filterVote, lastBlock + 1, toBlock);

    for (const log of logsVote) {
        const proposalId = log.args[0];
        const data = log.args[1]; // bytes

        // Use a unique composite key for nonce-like tracking: "PROPOSAL-{id}"
        const pseudoNonce = `PROPOSAL-${proposalId}`;

        if (getProcessed(pseudoNonce, chainId)) continue;

        console.log(`Detected ProposalPassed: ID=${proposalId}, Data=${data}`);

        try {
            // Assuming the action is always PAUSE as per requirements
            const tx = await govEmergency.pauseBridge();
            console.log(`Sent pauseBridge tx: ${tx.hash}`);
            await tx.wait();
            console.log("Pause confirmed");
            setProcessed(pseudoNonce, chainId, tx.hash);
        } catch (e) {
            console.error(`Failed to pause for proposal ${proposalId}:`, e);
        }
    }

    setLastBlock(chainId, toBlock);
}

function getProcessed(nonce, chainId) {
    const row = db.prepare('SELECT * FROM processed_events WHERE nonce = ? AND chainId = ?').get(nonce.toString(), chainId);
    return !!row;
}

function setProcessed(nonce, chainId, txHash) {
    db.prepare('INSERT OR IGNORE INTO processed_events (nonce, chainId, txHash) VALUES (?, ?, ?)').run(nonce.toString(), chainId, txHash);
}

function getLastBlock(chainId) {
    const row = db.prepare('SELECT lastProcessedBlock FROM sync_state WHERE chainId = ?').get(chainId);
    return row ? row.lastProcessedBlock : 0;
}

function setLastBlock(chainId, block) {
    db.prepare('INSERT OR REPLACE INTO sync_state (chainId, lastProcessedBlock) VALUES (?, ?)').run(chainId, block);
}

main().catch(console.error);
