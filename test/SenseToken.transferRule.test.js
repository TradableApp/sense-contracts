const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySense } = require("./helpers/deploy");

const ONE = ethers.parseEther("1");

describe("SenseToken: who may move points", function () {
  describe("between ordinary holders", function () {
    it("refuses a transfer from one holder to another", async function () {
      const { token, alice, bob } = await loadFixture(deploySense);

      await expect(token.connect(alice).transfer(bob.address, ONE))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(alice.address, bob.address);
    });

    it("refuses a transfer to an address that holds nothing, such as a pool", async function () {
      const { token, alice, pool } = await loadFixture(deploySense);

      await expect(token.connect(alice).transfer(pool.address, ONE))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(alice.address, pool.address);
    });

    it("refuses a pull by an approved spender that is not exempt", async function () {
      const { token, alice, pool } = await loadFixture(deploySense);
      await token.connect(alice).approve(pool.address, ONE);

      await expect(token.connect(pool).transferFrom(alice.address, pool.address, ONE))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(alice.address, pool.address);
    });

    it("refuses a transfer of nothing, so a holder cannot even signal to another", async function () {
      const { token, alice, bob } = await loadFixture(deploySense);

      await expect(token.connect(alice).transfer(bob.address, 0)).to.be.revertedWithCustomError(
        token,
        "TransferNotAllowed",
      );
    });

    it("refuses a holder's transfer to themselves", async function () {
      const { token, alice } = await loadFixture(deploySense);

      await expect(token.connect(alice).transfer(alice.address, ONE)).to.be.revertedWithCustomError(
        token,
        "TransferNotAllowed",
      );
    });

    it("leaves both balances as they were after a refused transfer", async function () {
      const { token, alice, bob, grant } = await loadFixture(deploySense);

      await expect(token.connect(alice).transfer(bob.address, ONE)).to.be.reverted;

      expect(await token.balanceOf(alice.address)).to.equal(grant);
      expect(await token.balanceOf(bob.address)).to.equal(grant);
    });
  });

  describe("an exempt spender is not a relay", function () {
    it("refuses an exempt spender moving one holder's points to another holder", async function () {
      const { token, escrow, alice, bob } = await loadFixture(deploySense);
      await token.connect(alice).approve(escrow.address, ONE);

      await expect(token.connect(escrow).transferFrom(alice.address, bob.address, ONE))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(alice.address, bob.address);
    });

    it("refuses the owner moving one holder's points to another holder", async function () {
      const { token, owner, alice, bob } = await loadFixture(deploySense);
      await token.connect(alice).approve(owner.address, ONE);

      await expect(
        token.connect(owner).transferFrom(alice.address, bob.address, ONE),
      ).to.be.revertedWithCustomError(token, "TransferNotAllowed");
    });
  });

  describe("the movements SenseAI makes", function () {
    it("lets the escrow pull a holder's fee into itself", async function () {
      const { token, escrow, alice, grant } = await loadFixture(deploySense);
      await token.connect(alice).approve(escrow.address, ONE);

      await token.connect(escrow).transferFrom(alice.address, escrow.address, ONE);

      expect(await token.balanceOf(escrow.address)).to.equal(ONE);
      expect(await token.balanceOf(alice.address)).to.equal(grant - ONE);
    });

    it("lets the escrow refund the holder", async function () {
      const { token, escrow, alice, grant } = await loadFixture(deploySense);
      await token.connect(alice).approve(escrow.address, ONE);
      await token.connect(escrow).transferFrom(alice.address, escrow.address, ONE);

      await token.connect(escrow).transfer(alice.address, ONE);

      expect(await token.balanceOf(alice.address)).to.equal(grant);
    });

    it("lets the escrow pay a finalised fee to the treasury", async function () {
      const { token, escrow, treasury, alice } = await loadFixture(deploySense);
      await token.connect(alice).approve(escrow.address, ONE);
      await token.connect(escrow).transferFrom(alice.address, escrow.address, ONE);

      await token.connect(escrow).transfer(treasury.address, ONE);

      expect(await token.balanceOf(treasury.address)).to.equal(ONE);
    });

    it("lets the escrow move a holder's fee straight to the treasury", async function () {
      const { token, escrow, treasury, alice } = await loadFixture(deploySense);
      await token.connect(alice).approve(escrow.address, ONE);

      await token.connect(escrow).transferFrom(alice.address, treasury.address, ONE);

      expect(await token.balanceOf(treasury.address)).to.equal(ONE);
    });

    it("lets a holder send points to an exempt address themselves", async function () {
      const { token, treasury, alice } = await loadFixture(deploySense);

      await token.connect(alice).transfer(treasury.address, ONE);

      expect(await token.balanceOf(treasury.address)).to.equal(ONE);
    });
  });

  describe("handing points out", function () {
    it("lets the owner send points to any address", async function () {
      const { token, owner, stranger } = await loadFixture(deploySense);

      await expect(token.connect(owner).transfer(stranger.address, ONE))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, stranger.address, ONE);
    });

    it("lets a listed treasury send points to any address", async function () {
      const { token, owner, treasury, stranger } = await loadFixture(deploySense);
      await token.connect(owner).transfer(treasury.address, ONE);

      await token.connect(treasury).transfer(stranger.address, ONE);

      expect(await token.balanceOf(stranger.address)).to.equal(ONE);
    });
  });

  describe("the exempt list", function () {
    it("reports the owner as exempt without being listed", async function () {
      const { token, owner } = await loadFixture(deploySense);

      expect(await token.isTransferExempt(owner.address)).to.equal(true);
    });

    it("reports a listed address as exempt and an ordinary holder as not", async function () {
      const { token, treasury, alice } = await loadFixture(deploySense);

      expect(await token.isTransferExempt(treasury.address)).to.equal(true);
      expect(await token.isTransferExempt(alice.address)).to.equal(false);
    });

    it("emits TransferExemptSet when an address is listed", async function () {
      const { token, stranger } = await loadFixture(deploySense);

      await expect(token.setTransferExempt(stranger.address, true))
        .to.emit(token, "TransferExemptSet")
        .withArgs(stranger.address, true);
    });

    it("applies the rule again once an address is taken off the list", async function () {
      const { token, owner, treasury, alice } = await loadFixture(deploySense);
      await token.connect(owner).transfer(treasury.address, ONE);

      await expect(token.setTransferExempt(treasury.address, false))
        .to.emit(token, "TransferExemptSet")
        .withArgs(treasury.address, false);

      expect(await token.isTransferExempt(treasury.address)).to.equal(false);
      await expect(token.connect(treasury).transfer(alice.address, ONE))
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(treasury.address, alice.address);
    });

    it("refuses a change to the list from anyone but the owner", async function () {
      const { token, alice } = await loadFixture(deploySense);

      await expect(token.connect(alice).setTransferExempt(alice.address, true))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("refuses a listed address changing the list", async function () {
      const { token, treasury, alice } = await loadFixture(deploySense);

      await expect(
        token.connect(treasury).setTransferExempt(alice.address, true),
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("refuses to list the zero address", async function () {
      const { token } = await loadFixture(deploySense);

      await expect(token.setTransferExempt(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        token,
        "ExemptAccountIsZero",
      );
    });
  });

  describe("the owner's exemption follows ownership", function () {
    it("does not exempt a pending owner before they accept", async function () {
      const { token, owner, stranger } = await loadFixture(deploySense);

      await token.connect(owner).transferOwnership(stranger.address);

      expect(await token.isTransferExempt(stranger.address)).to.equal(false);
      expect(await token.isTransferExempt(owner.address)).to.equal(true);
    });

    it("exempts the new owner and stops exempting the old one once accepted", async function () {
      const { token, owner, stranger } = await loadFixture(deploySense);
      await token.connect(owner).transferOwnership(stranger.address);

      await token.connect(stranger).acceptOwnership();

      expect(await token.isTransferExempt(stranger.address)).to.equal(true);
      expect(await token.isTransferExempt(owner.address)).to.equal(false);
    });

    it("still lets the old owner hand its balance to the new owner", async function () {
      const { token, owner, stranger } = await loadFixture(deploySense);
      await token.connect(owner).transferOwnership(stranger.address);
      await token.connect(stranger).acceptOwnership();
      const held = await token.balanceOf(owner.address);

      await token.connect(owner).transfer(stranger.address, held);

      expect(await token.balanceOf(stranger.address)).to.equal(held);
    });

    it("refuses the old owner sending to an ordinary holder", async function () {
      const { token, owner, stranger, alice } = await loadFixture(deploySense);
      await token.connect(owner).transferOwnership(stranger.address);
      await token.connect(stranger).acceptOwnership();

      await expect(token.connect(owner).transfer(alice.address, ONE)).to.be.revertedWithCustomError(
        token,
        "TransferNotAllowed",
      );
    });
  });
});
