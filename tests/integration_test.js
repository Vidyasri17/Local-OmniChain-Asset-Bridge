const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Bridge Integration Tests", function () {
    // High timeout for integration tests
    this.timeout(300000);

    let deployerA, deployerB; // Signers
    let vaultToken, bridgeLock, govEmergency;
    let wrappedToken, bridgeMint, govVoting;
    let deployments;

    before(async function () {
        // Ensure deployments.json exists
        const deploymentsPath = path.resolve(__dirname, "../deployments.json");
        if (!fs.existsSync(deploymentsPath)) {
            console.log("Deployments not found, skipping tests or please run deploy script first.");
            // In a real scenario, we might want to run the deploy script here programmatically.
            // For now, we assume the environment is set up.
            throw new Error("deployments.json not found");
        }
        deployments = JSON.parse(fs.readFileSync(deploymentsPath));

        // Connect to Chain A
        const providerA = new ethers.JsonRpcProvider("http://localhost:8545");
        deployerA = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerA);

        // Connect to Chain B
        const providerB = new ethers.JsonRpcProvider("http://localhost:9545");
        deployerB = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerB);

        // Attach contracts Chain A
        const VaultToken = await ethers.getContractFactory("VaultToken");
        const BridgeLock = await ethers.getContractFactory("BridgeLock");
        const GovernanceEmergency = await ethers.getContractFactory("GovernanceEmergency");

        vaultToken = VaultToken.attach(deployments.chainA.VaultToken).connect(deployerA);
        bridgeLock = BridgeLock.attach(deployments.chainA.BridgeLock).connect(deployerA);
        govEmergency = GovernanceEmergency.attach(deployments.chainA.GovernanceEmergency).connect(deployerA);

        // Attach contracts Chain B
        const WrappedVaultToken = await ethers.getContractFactory("WrappedVaultToken");
        const BridgeMint = await ethers.getContractFactory("BridgeMint");
        const GovernanceVoting = await ethers.getContractFactory("GovernanceVoting");

        wrappedToken = WrappedVaultToken.attach(deployments.chainB.WrappedVaultToken).connect(deployerB);
        bridgeMint = BridgeMint.attach(deployments.chainB.BridgeMint).connect(deployerB);
        govVoting = GovernanceVoting.attach(deployments.chainB.GovernanceVoting).connect(deployerB);

        // Approve BridgeLock to spend VaultToken
        const tx = await vaultToken.approve(await bridgeLock.getAddress(), ethers.MaxUint256);
        await tx.wait();
        console.log("Approved BridgeLock");
    });

    it("Should lock tokens on Chain A and mint on Chain B (End-to-End)", async function () {
        const amount = ethers.parseEther("100");
        const initialBalanceA = await vaultToken.balanceOf(deployerA.address);

        console.log(`Locking ${ethers.formatEther(amount)} tokens...`);
        const tx = await bridgeLock.lock(amount);
        const receipt = await tx.wait();

        // Wait for relayer
        console.log("Waiting for relayer to process lock...");
        await sleep(10000); // 10s wait

        const finalBalanceA = await vaultToken.balanceOf(deployerA.address);
        const balanceB = await wrappedToken.balanceOf(deployerB.address);

        expect(initialBalanceA - finalBalanceA).to.equal(amount);
        expect(balanceB).to.equal(amount);
    });

    it("Should burn tokens on Chain B and unlock on Chain A", async function () {
        const amount = ethers.parseEther("50");
        const initialBalanceA = await vaultToken.balanceOf(deployerA.address);
        const initialBalanceB = await wrappedToken.balanceOf(deployerB.address);

        // Approve BridgeMint (not strictly needed if using internal burn, but let's check contract)
        // BridgeMint calls burnFrom on token. Token is WVTK.
        // We need to approve BridgeMint to burn our WVTK.
        const txApprove = await wrappedToken.approve(await bridgeMint.getAddress(), amount);
        await txApprove.wait();

        console.log(`Burning ${ethers.formatEther(amount)} tokens...`);
        const tx = await bridgeMint.burn(amount);
        await tx.wait();

        console.log("Waiting for relayer to process burn...");
        await sleep(10000);

        const finalBalanceA = await vaultToken.balanceOf(deployerA.address);
        const finalBalanceB = await wrappedToken.balanceOf(deployerB.address);

        expect(initialBalanceB - finalBalanceB).to.equal(amount);
        expect(finalBalanceA - initialBalanceA).to.equal(amount);
    });

    it("Should recover from relayer crash", async function () {
        // Stop Relayer
        console.log("Stopping relayer...");
        execSync("docker-compose stop relayer");

        const amount = ethers.parseEther("10");
        console.log(`Locking ${ethers.formatEther(amount)} tokens while relayer is down...`);
        const tx = await bridgeLock.lock(amount);
        await tx.wait();

        // Wait a bit to ensure no processing happens
        await sleep(5000);

        // Check B balance shouldn't have changed yet
        const preBalanceB = await wrappedToken.balanceOf(deployerB.address);

        // Start Relayer
        console.log("Starting relayer...");
        execSync("docker-compose start relayer");

        // Wait for recovery and processing
        console.log("Waiting for relayer to recover...");
        await sleep(20000);

        const postBalanceB = await wrappedToken.balanceOf(deployerB.address);
        expect(postBalanceB - preBalanceB).to.equal(amount);
    });

    it("Should execute governance pause", async function () {
        // Create Proposal
        console.log("Creating proposal...");
        const txCreate = await govVoting.createProposal("Emergency Pause");
        await txCreate.wait();

        const proposalId = 1; // Assuming sequential IDs and this is 1st or we check event
        // But in test suite order, if previous tests ran, ID might be different.
        // We can get ID from event or just query count.
        const count = await govVoting.proposalCount();
        const id = count;

        // Vote
        console.log(`Voting on proposal ${id}...`);
        const txVote = await govVoting.vote(id);
        await txVote.wait();

        console.log("Waiting for relayer to process proposal...");
        await sleep(10000);

        // Check if BridgeLock is paused
        const isPaused = await bridgeLock.paused();
        expect(isPaused).to.be.true;

        // Try to lock should fail
        const amount = ethers.parseEther("1");
        await expect(bridgeLock.lock(amount)).to.be.reverted;
    });
});
