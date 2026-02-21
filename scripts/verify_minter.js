const hre = require("hardhat");

async function main() {
    const providerB = new hre.ethers.JsonRpcProvider("http://127.0.0.1:9545");
    const walletB = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, providerB);

    const wrappedVaultTokenAddr = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
    const bridgeMintAddr = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";

    const WrappedVaultToken = await hre.ethers.getContractAt("WrappedVaultToken", wrappedVaultTokenAddr, walletB);

    const MINTER_ROLE = await WrappedVaultToken.MINTER_ROLE();
    const hasRole = await WrappedVaultToken.hasRole(MINTER_ROLE, bridgeMintAddr);

    console.log(`BridgeMint Address: ${bridgeMintAddr}`);
    console.log(`WrappedVaultToken Address: ${wrappedVaultTokenAddr}`);
    console.log(`MINTER_ROLE: ${MINTER_ROLE}`);
    console.log(`Has Role: ${hasRole}`);

    if (!hasRole) {
        console.log("Granting role explicitly...");
        const tx = await WrappedVaultToken.grantRole(MINTER_ROLE, bridgeMintAddr);
        await tx.wait();
        console.log("Role granted.");
    }
}

main().catch(console.error);
