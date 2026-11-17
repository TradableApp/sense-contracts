const hre = require("hardhat");

const { ethers, upgrades } = hre;

const VERIFY_DELAY_MS = 60_000;

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. See "Deploying" in the README.`);
  }
  return value.trim();
}

function addressFrom(name) {
  const value = required(name);
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} is not an address.`);
  }
  return ethers.getAddress(value);
}

function supplyFrom(name) {
  const value = required(name);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a whole number of base units (wei), with no decimal point.`);
  }
  return BigInt(value);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const tokenName = required("TOKEN_NAME");
  const tokenSymbol = required("TOKEN_SYMBOL");
  const initialSupply = supplyFrom("INITIAL_SUPPLY");
  const owner = addressFrom("OWNER_ADDRESS");

  console.log(`Network:        ${hre.network.name}`);
  console.log(`Deployer:       ${deployer.address}`);
  console.log(`Name / symbol:  ${tokenName} / ${tokenSymbol}`);
  console.log(`Supply:         ${ethers.formatEther(initialSupply)}`);
  console.log(`Owner:          ${owner}`);
  if (owner !== deployer.address) {
    console.log("The owner is not the deployer: the owner receives the supply and must set the");
    console.log("exempt addresses itself (setTransferExempt). This script sets none.");
  }

  const SenseToken = await ethers.getContractFactory("SenseToken");
  const proxy = await upgrades.deployProxy(
    SenseToken,
    [tokenName, tokenSymbol, initialSupply, owner],
    { initializer: "initialize", kind: "uups", timeout: 60_000 },
  );
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`SenseToken proxy: ${proxyAddress}`);

  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    return;
  }

  console.log("Waiting a minute before verifying, so the explorer has the deployment...");
  await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
  try {
    await hre.run("verify:verify", { address: proxyAddress, constructorArguments: [] });
    console.log("Verified.");
  } catch (error) {
    // The token is deployed either way; verification can be run again by hand.
    console.error("Verification failed. Run `hardhat verify` for the proxy address above.");
    console.error(error instanceof Error ? error.message : String(error));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
