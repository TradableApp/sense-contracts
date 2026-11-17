const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySense, namespaceSlot, INITIAL_SUPPLY } = require("./helpers/deploy");

const ONE = ethers.parseEther("1");

describe("SenseToken: pausing", function () {
  it("starts unpaused", async function () {
    const { token } = await loadFixture(deploySense);

    expect(await token.paused()).to.equal(false);
  });

  it("stops every movement while paused, the allowed ones included", async function () {
    const { token, owner, escrow, alice } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, ONE);

    await expect(token.pause()).to.emit(token, "Paused").withArgs(owner.address);

    await expect(token.connect(owner).transfer(alice.address, ONE)).to.be.revertedWithCustomError(
      token,
      "EnforcedPause",
    );
    await expect(
      token.connect(escrow).transferFrom(alice.address, escrow.address, ONE),
    ).to.be.revertedWithCustomError(token, "EnforcedPause");
  });

  it("still allows an approval while paused", async function () {
    const { token, escrow, alice } = await loadFixture(deploySense);
    await token.pause();

    await token.connect(alice).approve(escrow.address, ONE);

    expect(await token.allowance(alice.address, escrow.address)).to.equal(ONE);
  });

  it("resumes the allowed movements once unpaused, and still refuses the others", async function () {
    const { token, owner, alice, bob } = await loadFixture(deploySense);
    await token.pause();

    await expect(token.unpause()).to.emit(token, "Unpaused").withArgs(owner.address);

    await token.connect(owner).transfer(alice.address, ONE);
    await expect(token.connect(alice).transfer(bob.address, ONE)).to.be.revertedWithCustomError(
      token,
      "TransferNotAllowed",
    );
  });

  it("refuses pause and unpause from anyone but the owner", async function () {
    const { token, treasury } = await loadFixture(deploySense);

    await expect(token.connect(treasury).pause())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(treasury.address);
    await token.pause();
    await expect(token.connect(treasury).unpause())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(treasury.address);
  });
});

describe("SenseToken: ownership", function () {
  it("does not hand ownership over until the recipient accepts", async function () {
    const { token, owner, stranger } = await loadFixture(deploySense);

    await token.connect(owner).transferOwnership(stranger.address);

    expect(await token.owner()).to.equal(owner.address);
    expect(await token.pendingOwner()).to.equal(stranger.address);
    await token.connect(stranger).acceptOwnership();
    expect(await token.owner()).to.equal(stranger.address);
  });

  it("does not let anyone else accept a pending transfer", async function () {
    const { token, owner, stranger, alice } = await loadFixture(deploySense);
    await token.connect(owner).transferOwnership(stranger.address);

    await expect(token.connect(alice).acceptOwnership())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("refuses to give ownership up, so the list and the pause are never left without an owner", async function () {
    const { token, owner } = await loadFixture(deploySense);

    await expect(token.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(
      token,
      "OwnershipCannotBeRenounced",
    );
    expect(await token.owner()).to.equal(owner.address);
  });

  it("tells a non-owner they are unauthorised, not that renouncing is disabled", async function () {
    const { token, alice } = await loadFixture(deploySense);

    await expect(token.connect(alice).renounceOwnership())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("keeps renounceOwnership a transaction in the ABI, not a read", async function () {
    const { SenseToken } = await loadFixture(deploySense);

    expect(SenseToken.interface.getFunction("renounceOwnership").stateMutability).to.equal(
      "nonpayable",
    );
  });
});

describe("SenseToken: upgrades and storage", function () {
  it("locks the implementation so it can never be initialised by itself", async function () {
    const { token, alice } = await loadFixture(deploySense);
    const implementation = await ethers.getContractAt(
      "SenseToken",
      await upgrades.erc1967.getImplementationAddress(await token.getAddress()),
    );

    await expect(
      implementation.initialize("Fake", "FAKE", 1n, alice.address),
    ).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
    expect(await implementation.totalSupply()).to.equal(0n);
    expect(await implementation.owner()).to.equal(ethers.ZeroAddress);
  });

  it("is a valid UUPS implementation", async function () {
    const { SenseToken } = await loadFixture(deploySense);

    await upgrades.validateImplementation(SenseToken, { kind: "uups" });
  });

  it("keeps balances, allowances, the list and the pause through an upgrade", async function () {
    const { token, escrow, treasury, alice, bob, grant } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, ONE);
    await token.pause();
    const SenseTokenV2 = await ethers.getContractFactory("SenseTokenV2");

    const upgraded = await upgrades.upgradeProxy(await token.getAddress(), SenseTokenV2);

    expect(await upgraded.version()).to.equal("v2");
    expect(await upgraded.totalSupply()).to.equal(INITIAL_SUPPLY);
    expect(await upgraded.balanceOf(alice.address)).to.equal(grant);
    expect(await upgraded.allowance(alice.address, escrow.address)).to.equal(ONE);
    expect(await upgraded.isTransferExempt(treasury.address)).to.equal(true);
    expect(await upgraded.isTransferExempt(bob.address)).to.equal(false);
    expect(await upgraded.paused()).to.equal(true);
  });

  it("still applies the rule after an upgrade", async function () {
    const { token, alice, bob } = await loadFixture(deploySense);
    const SenseTokenV2 = await ethers.getContractFactory("SenseTokenV2");

    const upgraded = await upgrades.upgradeProxy(await token.getAddress(), SenseTokenV2);

    await expect(upgraded.connect(alice).transfer(bob.address, ONE)).to.be.revertedWithCustomError(
      upgraded,
      "TransferNotAllowed",
    );
  });

  it("refuses an upgrade from anyone but the owner", async function () {
    const { token, treasury } = await loadFixture(deploySense);
    const SenseTokenV2 = await ethers.getContractFactory("SenseTokenV2", treasury);

    await expect(upgrades.upgradeProxy(await token.getAddress(), SenseTokenV2))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(treasury.address);
  });

  it("lets a new owner upgrade once ownership has moved", async function () {
    const { token, owner, stranger } = await loadFixture(deploySense);
    await token.connect(owner).transferOwnership(stranger.address);
    await token.connect(stranger).acceptOwnership();
    const SenseTokenV2 = await ethers.getContractFactory("SenseTokenV2", stranger);

    const upgraded = await upgrades.upgradeProxy(await token.getAddress(), SenseTokenV2);

    expect(await upgraded.version()).to.equal("v2");
  });

  it("stores the list in its own ERC-7201 namespace, at the slot the formula gives", async function () {
    const { token, treasury, alice } = await loadFixture(deploySense);
    const base = namespaceSlot("tradable.storage.SenseToken");
    const entry = (account) =>
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, base]),
      );
    const address = await token.getAddress();

    expect(BigInt(await ethers.provider.getStorage(address, entry(treasury.address)))).to.equal(1n);
    expect(BigInt(await ethers.provider.getStorage(address, entry(alice.address)))).to.equal(0n);
  });

  it("keeps nothing in the unnamespaced slots, so a later version can add state freely", async function () {
    const { token } = await loadFixture(deploySense);
    const address = await token.getAddress();

    for (let slot = 0; slot < 10; slot += 1) {
      expect(BigInt(await ethers.provider.getStorage(address, slot)), `slot ${slot}`).to.equal(0n);
    }
  });
});
