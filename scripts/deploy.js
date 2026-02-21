const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const relayerAddress = deployer.address; // Using deployer as relayer for simplicity

    console.log("Deploying contracts with the account:", deployer.address);

    // --- Chain A Deployment ---
    // Switch to Chain A logic by creating a provider/wallet connected to Chain A
    // In Hardhat, we can run this script with --network chainA, but we need to deploy to BOTH.
    // Using explicit JsonRpcProvider is better.

    const providerA = new hre.ethers.JsonRpcProvider(process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545");
    const walletA = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerA);

    const providerB = new hre.ethers.JsonRpcProvider(process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545");
    const walletB = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerB);

    console.log("Chain A ID:", (await providerA.getNetwork()).chainId);
    console.log("Wallet A Nonce:", await walletA.getNonce());
    console.log("Chain B ID:", (await providerB.getNetwork()).chainId);
    console.log("Wallet B Nonce:", await walletB.getNonce());

    let nonceA = await providerA.getTransactionCount(walletA.address);
    let nonceB = await providerB.getTransactionCount(walletB.address);

    console.log(`Initial Nonces - Chain A: ${nonceA}, Chain B: ${nonceB}`);

    // Deploy VaultToken (Chain A)
    const VaultToken = await hre.ethers.getContractFactory("VaultToken", walletA);
    const vaultToken = await VaultToken.deploy({ nonce: nonceA++ });
    await vaultToken.waitForDeployment();
    const vaultTokenAddr = await vaultToken.getAddress();
    console.log("VaultToken deployed to Chain A:", vaultTokenAddr);

    // Deploy BridgeLock (Chain A)
    const BridgeLock = await hre.ethers.getContractFactory("BridgeLock", walletA);
    const bridgeLock = await BridgeLock.deploy(vaultTokenAddr, relayerAddress, { nonce: nonceA++ });
    await bridgeLock.waitForDeployment();
    const bridgeLockAddr = await bridgeLock.getAddress();
    console.log("BridgeLock deployed to Chain A:", bridgeLockAddr);

    // Deploy GovernanceEmergency (Chain A)
    const GovernanceEmergency = await hre.ethers.getContractFactory("GovernanceEmergency", walletA);
    const governanceEmergency = await GovernanceEmergency.deploy(bridgeLockAddr, relayerAddress, { nonce: nonceA++ });
    await governanceEmergency.waitForDeployment();
    const governanceEmergencyAddr = await governanceEmergency.getAddress();
    console.log("GovernanceEmergency deployed to Chain A:", governanceEmergencyAddr);

    // Grant PAUSER_ROLE to GovernanceEmergency on BridgeLock
    const PAUSER_ROLE = await bridgeLock.PAUSER_ROLE();
    await bridgeLock.grantRole(PAUSER_ROLE, governanceEmergencyAddr, { nonce: nonceA++ });
    console.log("Granted PAUSER_ROLE to GovernanceEmergency");

    // --- Chain B Deployment ---
    // Deploy WrappedVaultToken (Chain B)
    const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken", walletB);
    const wrappedVaultToken = await WrappedVaultToken.deploy({ nonce: nonceB++ });
    await wrappedVaultToken.waitForDeployment();
    const wrappedVaultTokenAddr = await wrappedVaultToken.getAddress();
    console.log("WrappedVaultToken deployed to Chain B:", wrappedVaultTokenAddr);

    // Deploy BridgeMint (Chain B)
    const BridgeMint = await hre.ethers.getContractFactory("BridgeMint", walletB);
    const bridgeMint = await BridgeMint.deploy(wrappedVaultTokenAddr, relayerAddress, { nonce: nonceB++ });
    await bridgeMint.waitForDeployment();
    const bridgeMintAddr = await bridgeMint.getAddress();
    console.log("BridgeMint deployed to Chain B:", bridgeMintAddr);

    // Grant MINTER_ROLE to BridgeMint on WrappedVaultToken
    const MINTER_ROLE = await wrappedVaultToken.MINTER_ROLE();
    await wrappedVaultToken.grantRole(MINTER_ROLE, bridgeMintAddr, { nonce: nonceB++ });
    console.log("Granted MINTER_ROLE to BridgeMint");

    // Deploy GovernanceVoting (Chain B)
    const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting", walletB);
    const governanceVoting = await GovernanceVoting.deploy(wrappedVaultTokenAddr, { nonce: nonceB++ });
    await governanceVoting.waitForDeployment();
    const governanceVotingAddr = await governanceVoting.getAddress();
    console.log("GovernanceVoting deployed to Chain B:", governanceVotingAddr);

    // Output addresses for usage
    console.log("\n--- Deployment Summary ---");
    console.log("Chain A:");
    console.log("  VaultToken:", vaultTokenAddr);
    console.log("  BridgeLock:", bridgeLockAddr);
    console.log("  GovernanceEmergency:", governanceEmergencyAddr);
    console.log("Chain B:");
    console.log("  WrappedVaultToken:", wrappedVaultTokenAddr);
    console.log("  BridgeMint:", bridgeMintAddr);
    console.log("  GovernanceVoting:", governanceVotingAddr);

    // Save addresses to a file for the relayer/tests to use
    const fs = require('fs');
    const deployments = {
        chainA: {
            VaultToken: vaultTokenAddr,
            BridgeLock: bridgeLockAddr,
            GovernanceEmergency: governanceEmergencyAddr
        },
        chainB: {
            WrappedVaultToken: wrappedVaultTokenAddr,
            BridgeMint: bridgeMintAddr,
            GovernanceVoting: governanceVotingAddr
        }
    };
    fs.writeFileSync('deployments.json', JSON.stringify(deployments, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
