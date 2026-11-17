const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySense, TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY } = require("./helpers/deploy");

describe("SenseToken: a fixed supply", function () {
  it("carries the name, symbol and 18 decimals it was initialised with", async function () {
    const { token } = await loadFixture(deploySense);

    expect(await token.name()).to.equal(TOKEN_NAME);
    expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    expect(await token.decimals()).to.equal(18);
  });

  it("mints the whole supply once, to the owner it was initialised with", async function () {
    const { token, SenseToken, owner } = await loadFixture(deploySense);

    expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    const minted = await token.queryFilter(token.filters.Transfer(ethers.ZeroAddress));
    expect(minted).to.have.lengthOf(1);
    expect(minted[0].args.to).to.equal(owner.address);
    expect(minted[0].args.value).to.equal(INITIAL_SUPPLY);
    expect(SenseToken.interface.getFunction("initialize")).to.not.equal(null);
  });

  it("offers no way to mint, burn or hand out in bulk", async function () {
    const { SenseToken } = await loadFixture(deploySense);

    for (const name of ["mint", "burn", "burnFrom", "airdrop"]) {
      expect(SenseToken.interface.getFunction(name), name).to.equal(null);
    }
  });

  it("refuses a transfer to the zero address, so nothing can be destroyed that way", async function () {
    const { token, owner, alice } = await loadFixture(deploySense);

    await expect(token.connect(owner).transfer(ethers.ZeroAddress, 1n))
      .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver")
      .withArgs(ethers.ZeroAddress);
    await expect(token.connect(alice).transfer(ethers.ZeroAddress, 1n)).to.be.reverted;
  });

  it("keeps the total supply unchanged through spending and refunds", async function () {
    const { token, escrow, treasury, alice } = await loadFixture(deploySense);
    const fee = ethers.parseEther("5");
    await token.connect(alice).approve(escrow.address, fee * 2n);

    await token.connect(escrow).transferFrom(alice.address, escrow.address, fee * 2n);
    await token.connect(escrow).transfer(alice.address, fee);
    await token.connect(escrow).transfer(treasury.address, fee);

    expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
  });

  it("refuses a second initialisation", async function () {
    const { token, alice } = await loadFixture(deploySense);

    await expect(token.initialize("Other", "OTH", 1n, alice.address)).to.be.revertedWithCustomError(
      token,
      "InvalidInitialization",
    );
  });

  it("refuses the zero address as the first owner", async function () {
    const { SenseToken } = await loadFixture(deploySense);
    const { upgrades } = require("hardhat");

    await expect(
      upgrades.deployProxy(
        SenseToken,
        [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, ethers.ZeroAddress],
        {
          kind: "uups",
        },
      ),
    ).to.be.revertedWithCustomError(SenseToken, "OwnableInvalidOwner");
  });
});

describe("SenseToken: approvals", function () {
  it("records an approval and emits Approval, even to an address that could never pull", async function () {
    const { token, alice, pool } = await loadFixture(deploySense);

    await expect(token.connect(alice).approve(pool.address, 7n))
      .to.emit(token, "Approval")
      .withArgs(alice.address, pool.address, 7n);
    expect(await token.allowance(alice.address, pool.address)).to.equal(7n);
  });

  it("reduces the allowance by what the escrow pulled", async function () {
    const { token, escrow, alice } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, 10n);

    await token.connect(escrow).transferFrom(alice.address, escrow.address, 4n);

    expect(await token.allowance(alice.address, escrow.address)).to.equal(6n);
  });

  it("refuses a pull above the allowance", async function () {
    const { token, escrow, alice } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, 3n);

    await expect(
      token.connect(escrow).transferFrom(alice.address, escrow.address, 4n),
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
  });

  it("refuses a pull above the holder's balance", async function () {
    const { token, escrow, alice, grant } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, ethers.MaxUint256);

    await expect(
      token.connect(escrow).transferFrom(alice.address, escrow.address, grant + 1n),
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });

  it("leaves an unlimited allowance unlimited after a pull", async function () {
    const { token, escrow, alice } = await loadFixture(deploySense);
    await token.connect(alice).approve(escrow.address, ethers.MaxUint256);

    await token.connect(escrow).transferFrom(alice.address, escrow.address, 4n);

    expect(await token.allowance(alice.address, escrow.address)).to.equal(ethers.MaxUint256);
  });
});
