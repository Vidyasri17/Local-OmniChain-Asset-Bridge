const hre = require("hardhat");

async function main() {
    const providerB = new hre.ethers.JsonRpcProvider("http://127.0.0.1:9545");
    const walletB = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerB);

    const bridgeMintAddr = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"; // From deployments.json
    const userAddr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // User address (Hardhat #1)

    const BridgeMint = await hre.ethers.getContractAt("BridgeMint", bridgeMintAddr, walletB);

    console.log("Attempting to mintWrapped...");
    try {
        const tx = await BridgeMint.mintWrapped(userAddr, ethers.parseEther("1"), 9999);
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log("Transaction confirmed!");
    } catch (e) {
        console.error("Minting failed:", e);
    }
}

main().catch(console.error);
