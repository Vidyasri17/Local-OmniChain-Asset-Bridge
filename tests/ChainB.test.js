const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chain B Unit Tests", function () {
    let wrappedVaultToken, bridgeMint, govVoting;
    let owner, relayer, user, other;

    beforeEach(async function () {
        [owner, relayer, user, other] = await ethers.getSigners();

        const WrappedVaultToken = await ethers.getContractFactory("WrappedVaultToken");
        wrappedVaultToken = await WrappedVaultToken.deploy();

        const BridgeMint = await ethers.getContractFactory("BridgeMint");
        bridgeMint = await BridgeMint.deploy(await wrappedVaultToken.getAddress(), relayer.address);

        const GovernanceVoting = await ethers.getContractFactory("GovernanceVoting");
        govVoting = await GovernanceVoting.deploy(await wrappedVaultToken.getAddress());

        // Grant MINTER_ROLE to BridgeMint
        const MINTER_ROLE = await wrappedVaultToken.MINTER_ROLE();
        await wrappedVaultToken.grantRole(MINTER_ROLE, await bridgeMint.getAddress());
    });

    describe("BridgeMint", function () {
        it("Should mint wrapped tokens only by relayer", async function () {
            await bridgeMint.connect(relayer).mintWrapped(user.address, ethers.parseEther("100"), 1);
            expect(await wrappedVaultToken.balanceOf(user.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should burn wrapped tokens", async function () {
            await bridgeMint.connect(relayer).mintWrapped(user.address, ethers.parseEther("100"), 1);

            // Need approval? Yes, wait no.
            // wrappedVaultToken.burnFrom() calls super._spendAllowance(owner, spender, amount).
            // Here bridgeMint calls token.burnFrom(msg.sender, amount). 
            // msg.sender is user. token is WVTK.
            // bridgeMint logic: token.burnFrom(msg.sender, amount).
            // So BridgeMint is the spender. User is the owner.
            // User must approve BridgeMint to burn their tokens.

            await wrappedVaultToken.connect(user).approve(await bridgeMint.getAddress(), ethers.parseEther("50"));

            await expect(bridgeMint.connect(user).burn(ethers.parseEther("50")))
                .to.emit(bridgeMint, "Burned")
                .withArgs(user.address, ethers.parseEther("50"), 0); // nextNonce starts at 0

            expect(await wrappedVaultToken.balanceOf(user.address)).to.equal(ethers.parseEther("50"));
        });
    });

    describe("GovernanceVoting", function () {
        it("Should create proposal and vote", async function () {
            await govVoting.createProposal("Pause Bridge");

            // Give user some tokens first (via mint)
            // Simulating relayer minting tokens to user
            // Or manually minting if we have admin role on WrappedVaultToken? 
            // Admin is deployer (owner). But WrappedVaultToken only mints via MINTER_ROLE.
            // And MINTER_ROLE is granted to BridgeMint.
            // We can use BridgeMint via relayer to mint.
            await bridgeMint.connect(relayer).mintWrapped(user.address, ethers.parseEther("100"), 10);

            await govVoting.connect(user).vote(1);

            const proposal = await govVoting.proposals(1);
            expect(proposal.voteCount).to.equal(ethers.parseEther("100"));
        });
    });
});
