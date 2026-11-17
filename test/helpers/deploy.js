const { ethers, upgrades } = require("hardhat");

const TOKEN_NAME = "SENSE";
const TOKEN_SYMBOL = "SENSE";
const INITIAL_SUPPLY = ethers.parseEther("1000000000");

// ERC-7201 slot of the namespace `tradable.storage.SenseToken`, worked out here from the formula
// so the constant in the contract is checked against it and not against a copy of itself.
function namespaceSlot(id) {
  const inner = BigInt(ethers.keccak256(ethers.toUtf8Bytes(id))) - 1n;
  const hashed = BigInt(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [inner])),
  );
  return hashed & ~0xffn;
}

/**
 * The token behind a UUPS proxy, with the roles the rule is written for:
 * - `owner` holds the whole supply and is exempt by being the owner;
 * - `treasury` and `escrow` are exempt because the owner listed them;
 * - `alice`, `bob` and `pool` are ordinary holders, with `alice` and `bob` funded by the owner.
 */
async function deploySense() {
  const [owner, treasury, escrow, alice, bob, pool, stranger] = await ethers.getSigners();
  const SenseToken = await ethers.getContractFactory("SenseToken");
  const token = await upgrades.deployProxy(
    SenseToken,
    [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, owner.address],
    { initializer: "initialize", kind: "uups" },
  );
  await token.waitForDeployment();

  await token.setTransferExempt(treasury.address, true);
  await token.setTransferExempt(escrow.address, true);

  const grant = ethers.parseEther("1000");
  await token.transfer(alice.address, grant);
  await token.transfer(bob.address, grant);

  return { token, SenseToken, owner, treasury, escrow, alice, bob, pool, stranger, grant };
}

module.exports = { deploySense, namespaceSlot, TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY };
