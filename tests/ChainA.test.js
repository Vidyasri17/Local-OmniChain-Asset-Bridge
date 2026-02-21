const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chain A Unit Tests", function () {
    let vaultToken, bridgeLock, govEmergency;
    let owner, relayer, user, other;

    beforeEach(async function () {
        [owner, relayer, user, other] = await ethers.getSigners();

        const VaultToken = await ethers.getContractFactory("VaultToken");
        vaultToken = await VaultToken.deploy();
        await vaultToken.waitForDeployment();

        const BridgeLock = await ethers.getContractFactory("BridgeLock");
        bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress(), relayer.address);
        await bridgeLock.waitForDeployment();

        const GovernanceEmergency = await ethers.getContractFactory("GovernanceEmergency");
        govEmergency = await GovernanceEmergency.deploy(await bridgeLock.getAddress(), relayer.address);
        await govEmergency.waitForDeployment();

        // Grant PAUSER_ROLE
        const PAUSER_ROLE = await bridgeLock.PAUSER_ROLE();
        await bridgeLock.grantRole(PAUSER_ROLE, await govEmergency.getAddress());

        // Mint tokens to user
        await vaultToken.transfer(user.address, ethers.parseEther("1000"));
        await vaultToken.connect(user).approve(await bridgeLock.getAddress(), ethers.MaxUint256);
    });

    describe("BridgeLock", function () {
        it("Should lock tokens", async function () {
            await bridgeLock.connect(user).lock(ethers.parseEther("100"));
            expect(await vaultToken.balanceOf(await bridgeLock.getAddress())).to.equal(ethers.parseEther("100"));
        });

        it("Should unlock tokens only by relayer", async function () {
            await bridgeLock.connect(user).lock(ethers.parseEther("100"));

            // Relayer unlocks
            await bridgeLock.connect(relayer).unlock(user.address, ethers.parseEther("50"), 1);

            expect(await vaultToken.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
        });

        it("Should prevent double unlock (replay)", async function () {
            await bridgeLock.connect(user).lock(ethers.parseEther("100"));
            await bridgeLock.connect(relayer).unlock(user.address, ethers.parseEther("50"), 1);

            await expect(
                bridgeLock.connect(relayer).unlock(user.address, ethers.parseEther("50"), 1)
            ).to.be.revertedWith("Nonce already processed");
        });
    });

    describe("GovernanceEmergency", function () {
        it("Should pause bridge only by relayer via GovernanceEmergency", async function () {
            await govEmergency.connect(relayer).pauseBridge();
            expect(await bridgeLock.paused()).to.equal(true);
        });

        it("Should not allow locking when paused", async function () {
            await govEmergency.connect(relayer).pauseBridge();
            await expect(
                bridgeLock.connect(user).lock(ethers.parseEther("10"))
            ).to.be.revertedWithCustomError(bridgeLock, "EnforcedPause");
            // Or check specific error string if simpler, 
            // but OpenZeppelin Pausable uses Custom Error in 5.x: EnforcedPause()
        });
    });
});
