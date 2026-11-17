require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-gas-reporter");

const dotenv = require("dotenv");

const { envFilesToLoad } = require("./scripts/lib/deployConfig");

// A named ENV_FILE is the only file loaded. `.env` is read only when no file is named.
for (const path of envFilesToLoad(process.env)) {
  dotenv.config({ path });
}

const {
  PRIVATE_KEY,
  BASE_SEPOLIA_RPC,
  BASE_MAINNET_RPC,
  ETHERSCAN_API_KEY,
  COINMARKETCAP_API_KEY,
} = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

module.exports = {
  // Tests and local work never reach a live network by accident.
  defaultNetwork: "hardhat",

  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", accounts, chainId: 31337 },
    base: { url: BASE_MAINNET_RPC || "https://mainnet.base.org", accounts, chainId: 8453 },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      accounts,
      chainId: 84532,
    },
  },

  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 10000 },
    },
  },

  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    L2: "base",
    outputFile: "gas-report.txt",
    noColors: true,
    coinmarketcap: COINMARKETCAP_API_KEY || "",
    etherscan: ETHERSCAN_API_KEY || "",
  },
};
