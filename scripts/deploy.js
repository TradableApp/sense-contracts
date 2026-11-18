const hre = require("hardhat");

const { readDeployConfig } = require("./lib/deployConfig");

const { ethers, upgrades } = hre;

const VERIFY_DELAY_MS = 60_000;

async function main() {
  const [deployer] = await ethers.getSigners();
  const { tokenName, tokenSymbol, initialSupply, owner } = readDeployConfig(
    process.env,
    hre.network.name,
  );

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
  // The message only: a whole provider error can carry the request, and with it an RPC URL.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
