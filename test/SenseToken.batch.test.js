const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySense } = require("./helpers/deploy");

// The owner on a public network is a multisig, and a multisig hands points out in a batch: one
// transaction holding several `transfer` calls, run through a MultiSendCallOnly contract by
// delegatecall. No batch function is needed on the token for this; these tests show the rule
// already allows it for an exempt sender and refuses it for anyone else.
//
// TestBatchWallet plays the multisig and TestMultiSendCallOnly plays the batch contract. Both live
// in contracts/test/ and are never deployed.

const CALL = 0;

// The wallet's balance after the handover. Every amount below is worked out from it.
const FUNDS = ethers.parseEther("1000");

/**
 * Packs calls the way MultiSendCallOnly reads them: for each call, the operation (1 byte, 0 for
 * CALL), the target (20 bytes), the value (32 bytes), the data length (32 bytes), then the data.
 */
function packBatch(calls) {
  return ethers.concat(
    calls.map(({ to, data }) =>
      ethers.solidityPacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [CALL, to, 0, ethers.dataLength(data), data],
      ),
    ),
  );
}

function transferCalls(token, tokenAddress, payments) {
  return payments.map(([to, amount]) => ({
    to: tokenAddress,
    data: token.interface.encodeFunctionData("transfer", [to, amount]),
  }));
}

/**
 * The token of `deploySense`, with ownership handed to a batching wallet that holds FUNDS, and a
 * second wallet of the same kind that is not exempt and holds FUNDS too.
 */
async function deployWithBatchingOwner() {
  const base = await deploySense();
  const { token, owner } = base;
  const [operator, carol, dave, erin] = (await ethers.getSigners()).slice(7, 11);
  const tokenAddress = await token.getAddress();

  const multiSend = await (await ethers.getContractFactory("TestMultiSendCallOnly")).deploy();
  const Wallet = await ethers.getContractFactory("TestBatchWallet");
  const wallet = await Wallet.deploy(operator.address);
  const plainWallet = await Wallet.deploy(operator.address);
  const multiSendAddress = await multiSend.getAddress();
  const walletAddress = await wallet.getAddress();
  const plainWalletAddress = await plainWallet.getAddress();

  // Funded while the first owner is still exempt.
  await token.connect(owner).transfer(walletAddress, FUNDS);
  await token.connect(owner).transfer(plainWalletAddress, FUNDS);

  // The wallet accepts ownership in a one-call batch, so it is exempt by being the owner.
  await token.connect(owner).transferOwnership(walletAddress);
  const accept = packBatch([
    { to: tokenAddress, data: token.interface.encodeFunctionData("acceptOwnership") },
  ]);
  await wallet.connect(operator).execBatch(multiSendAddress, accept);

  return {
    ...base,
    tokenAddress,
    operator,
    carol,
    dave,
    erin,
    multiSendAddress,
    wallet,
    walletAddress,
    plainWallet,
    plainWalletAddress,
  };
}

describe("SenseToken: an exempt multisig hands points out in a batch", function () {
  it("sets up the wallet as the owner, exempt, and the receivers as not exempt", async function () {
    const { token, walletAddress, plainWalletAddress, carol, dave, erin } =
      await loadFixture(deployWithBatchingOwner);

    expect(await token.owner()).to.equal(walletAddress);
    expect(await token.isTransferExempt(walletAddress)).to.equal(true);
    expect(await token.isTransferExempt(plainWalletAddress)).to.equal(false);
    for (const receiver of [carol, dave, erin]) {
      expect(await token.isTransferExempt(receiver.address)).to.equal(false);
    }
  });

  it("sends to three wallets that are not exempt in one transaction", async function () {
    const {
      token,
      tokenAddress,
      operator,
      carol,
      dave,
      erin,
      multiSendAddress,
      wallet,
      walletAddress,
    } = await loadFixture(deployWithBatchingOwner);
    const toCarol = ethers.parseEther("100");
    const toDave = ethers.parseEther("250");
    const toErin = ethers.parseEther("400");
    const batch = packBatch(
      transferCalls(token, tokenAddress, [
        [carol.address, toCarol],
        [dave.address, toDave],
        [erin.address, toErin],
      ]),
    );

    const tx = await wallet.connect(operator).execBatch(multiSendAddress, batch);

    // All three Transfer events come from this one transaction, sent by the wallet.
    await expect(tx)
      .to.emit(token, "Transfer")
      .withArgs(walletAddress, carol.address, toCarol)
      .and.to.emit(token, "Transfer")
      .withArgs(walletAddress, dave.address, toDave)
      .and.to.emit(token, "Transfer")
      .withArgs(walletAddress, erin.address, toErin);
    // Each receiver started with nothing, so holds exactly what it was sent.
    expect(await token.balanceOf(carol.address)).to.equal(toCarol);
    expect(await token.balanceOf(dave.address)).to.equal(toDave);
    expect(await token.balanceOf(erin.address)).to.equal(toErin);
    // 1000 - (100 + 250 + 400) = 250 left with the wallet.
    expect(await token.balanceOf(walletAddress)).to.equal(ethers.parseEther("250"));
  });

  it("refuses the same batch from a wallet that is not exempt, and nothing moves", async function () {
    const {
      token,
      tokenAddress,
      operator,
      carol,
      dave,
      erin,
      multiSendAddress,
      plainWallet,
      plainWalletAddress,
    } = await loadFixture(deployWithBatchingOwner);
    const batch = packBatch(
      transferCalls(token, tokenAddress, [
        [carol.address, ethers.parseEther("100")],
        [dave.address, ethers.parseEther("250")],
        [erin.address, ethers.parseEther("400")],
      ]),
    );

    // The first transfer is refused by the rule, and its error comes back out of the batch.
    await expect(plainWallet.connect(operator).execBatch(multiSendAddress, batch))
      .to.be.revertedWithCustomError(token, "TransferNotAllowed")
      .withArgs(plainWalletAddress, carol.address);

    expect(await token.balanceOf(plainWalletAddress)).to.equal(FUNDS);
    for (const receiver of [carol, dave, erin]) {
      expect(await token.balanceOf(receiver.address)).to.equal(0);
    }
  });

  it("lets a wallet that is not exempt pay exempt addresses in a batch", async function () {
    const {
      token,
      tokenAddress,
      operator,
      treasury,
      escrow,
      multiSendAddress,
      plainWallet,
      plainWalletAddress,
    } = await loadFixture(deployWithBatchingOwner);
    const toTreasury = ethers.parseEther("30");
    const toEscrow = ethers.parseEther("70");
    const treasuryBefore = await token.balanceOf(treasury.address);
    const escrowBefore = await token.balanceOf(escrow.address);
    const batch = packBatch(
      transferCalls(token, tokenAddress, [
        [treasury.address, toTreasury],
        [escrow.address, toEscrow],
      ]),
    );

    // The rule allows a transfer when either end is exempt, so the receivers alone carry it.
    await expect(plainWallet.connect(operator).execBatch(multiSendAddress, batch))
      .to.emit(token, "Transfer")
      .withArgs(plainWalletAddress, treasury.address, toTreasury)
      .and.to.emit(token, "Transfer")
      .withArgs(plainWalletAddress, escrow.address, toEscrow);

    expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + toTreasury);
    expect(await token.balanceOf(escrow.address)).to.equal(escrowBefore + toEscrow);
    // 1000 - (30 + 70) = 900 left with the wallet.
    expect(await token.balanceOf(plainWalletAddress)).to.equal(ethers.parseEther("900"));
  });

  it("reverts the whole batch when one transfer in it fails", async function () {
    const {
      token,
      tokenAddress,
      operator,
      carol,
      dave,
      erin,
      multiSendAddress,
      wallet,
      walletAddress,
    } = await loadFixture(deployWithBatchingOwner);
    // 100 + 200 + 800 = 1100, more than the 1000 the wallet holds. The first two would go through
    // on their own; the third finds 1000 - 300 = 700 left and asks for 800.
    const batch = packBatch(
      transferCalls(token, tokenAddress, [
        [carol.address, ethers.parseEther("100")],
        [dave.address, ethers.parseEther("200")],
        [erin.address, ethers.parseEther("800")],
      ]),
    );

    await expect(wallet.connect(operator).execBatch(multiSendAddress, batch))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
      .withArgs(walletAddress, ethers.parseEther("700"), ethers.parseEther("800"));

    // The first two transfers are undone with the third.
    expect(await token.balanceOf(walletAddress)).to.equal(FUNDS);
    for (const receiver of [carol, dave, erin]) {
      expect(await token.balanceOf(receiver.address)).to.equal(0);
    }
  });

  it("leaves the receivers unable to send to each other afterwards", async function () {
    const { token, tokenAddress, operator, carol, dave, erin, multiSendAddress, wallet } =
      await loadFixture(deployWithBatchingOwner);
    const amount = ethers.parseEther("100");
    const batch = packBatch(
      transferCalls(token, tokenAddress, [
        [carol.address, amount],
        [dave.address, amount],
        [erin.address, amount],
      ]),
    );
    await wallet.connect(operator).execBatch(multiSendAddress, batch);

    // Receiving from the owner does not make a wallet exempt.
    const pairs = [
      [carol, dave],
      [dave, erin],
      [erin, carol],
    ];
    for (const [from, to] of pairs) {
      await expect(token.connect(from).transfer(to.address, amount))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(from.address, to.address);
    }
    for (const receiver of [carol, dave, erin]) {
      expect(await token.balanceOf(receiver.address)).to.equal(amount);
    }
  });
});
