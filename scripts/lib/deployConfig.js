const path = require("path");

const dotenv = require("dotenv");
const { getAddress, isAddress, ZeroAddress } = require("ethers");

const MAINNET_NETWORK = "base";
const MAINNET_CONFIRMATION = "DEPLOY_MAINNET_CONFIRMED";
// 18 decimals: one whole token in base units.
const ONE_TOKEN = 10n ** 18n;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

/**
 * The env files to load, in order. When a file is named it is the only one: a second file
 * filling a gap in it could put a development owner or key into a mainnet deploy.
 */
function envFilesToLoad(env) {
  return isBlank(env.ENV_FILE) ? [".env"] : [env.ENV_FILE.trim()];
}

/**
 * Loads the env files into `env`. A named file wins over what the shell already exported, and a
 * named file that cannot be read stops the run: a mistyped name would otherwise leave the shell's
 * values, or nothing, in charge of a deploy. With no file named, a missing `.env` is not an error.
 */
function loadEnvFiles(env, cwd = process.cwd()) {
  const named = !isBlank(env.ENV_FILE);
  for (const file of envFilesToLoad(env)) {
    const result = dotenv.config({
      path: path.resolve(cwd, file),
      processEnv: env,
      override: named,
      quiet: true,
    });
    if (named && result.error) {
      throw new Error("The file named by ENV_FILE could not be read.");
    }
  }
}

function required(env, name) {
  if (isBlank(env[name])) {
    throw new Error(`${name} is not set. See "Deploying" in the README.`);
  }
  return String(env[name]).trim();
}

/**
 * Reads and checks the deploy settings. Throws before anything is sent, naming the setting that
 * is wrong and never its value.
 */
function readDeployConfig(env, networkName) {
  const tokenName = required(env, "TOKEN_NAME");
  const tokenSymbol = required(env, "TOKEN_SYMBOL");

  const supply = required(env, "INITIAL_SUPPLY");
  if (!/^[1-9][0-9]*$/.test(supply)) {
    throw new Error(
      "INITIAL_SUPPLY must be a whole number of base units (wei), with no decimal point.",
    );
  }

  if (BigInt(supply) < ONE_TOKEN) {
    throw new Error(
      "INITIAL_SUPPLY is less than one whole token. It is given in base units: one billion tokens is 1 followed by 27 zeros.",
    );
  }

  const owner = required(env, "OWNER_ADDRESS");
  if (!isAddress(owner) || getAddress(owner) === ZeroAddress) {
    throw new Error("OWNER_ADDRESS is not a usable address.");
  }

  // The supply is minted once, to the owner, and nothing can undo it. A mainnet deploy therefore
  // has to be asked for on purpose.
  if (networkName === MAINNET_NETWORK && env[MAINNET_CONFIRMATION] !== "1") {
    throw new Error(`Deploying to Base mainnet needs ${MAINNET_CONFIRMATION}=1.`);
  }

  return { tokenName, tokenSymbol, initialSupply: BigInt(supply), owner: getAddress(owner) };
}

module.exports = { readDeployConfig, envFilesToLoad, loadEnvFiles };
