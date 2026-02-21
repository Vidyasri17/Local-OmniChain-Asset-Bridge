const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const relayerAddress = deployer.address;

    const providerB = new hre.ethers.JsonRpcProvider("http://127.0.0.1:9545");
    const walletB = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerB);

    const bridgeMintAddr = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"; // From deployments.json
    const BridgeMint = await hre.ethers.getContractAt("BridgeMint", bridgeMintAddr, walletB);

    const RELAYER_ROLE = await BridgeMint.RELAYER_ROLE();
    const hasRole = await BridgeMint.hasRole(RELAYER_ROLE, relayerAddress);

    console.log(`Relayer Address: ${relayerAddress}`);
    console.log(`BridgeMint Address: ${bridgeMintAddr}`);
    console.log(`RELAYER_ROLE: ${RELAYER_ROLE}`);
    console.log(`Has Role: ${hasRole}`);

    if (!hasRole) {
        console.log("Granting role explicitly...");
        const tx = await BridgeMint.grantRole(RELAYER_ROLE, relayerAddress);
        await tx.wait();
        console.log("Role granted.");
    }
}

main().catch(console.error);
