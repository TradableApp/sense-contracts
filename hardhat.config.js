require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-gas-reporter");

const dotenv = require("dotenv");

// The file named by ENV_FILE is loaded first, so its values win; `.env` only fills in what that
// file left unset.
if (process.env.ENV_FILE) {
  dotenv.config({ path: process.env.ENV_FILE });
}
dotenv.config({ path: ".env" });

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
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: { apiURL: "https://api.basescan.org/api", browserURL: "https://basescan.org" },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
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
