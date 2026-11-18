const { expect } = require("chai");
const { readDeployConfig, envFilesToLoad } = require("../scripts/lib/deployConfig");

const OWNER = "0x000000000000000000000000000000000000dEaD";
const complete = {
  TOKEN_NAME: "SENSE Points",
  TOKEN_SYMBOL: "SENSE",
  INITIAL_SUPPLY: "1000000000000000000000000000",
  OWNER_ADDRESS: OWNER,
};

describe("deploy settings", function () {
  it("reads a complete set of settings", function () {
    const config = readDeployConfig(complete, "baseSepolia");

    expect(config).to.deep.equal({
      tokenName: "SENSE Points",
      tokenSymbol: "SENSE",
      initialSupply: 1000000000000000000000000000n,
      owner: OWNER,
    });
  });

  for (const name of Object.keys(complete)) {
    it(`refuses to deploy when ${name} is missing or blank, and names it`, function () {
      expect(() => readDeployConfig({ ...complete, [name]: undefined }, "localhost")).to.throw(
        name,
      );
      expect(() => readDeployConfig({ ...complete, [name]: "  " }, "localhost")).to.throw(name);
    });
  }

  it("refuses an owner that is not an address, without printing the value", function () {
    const attempt = () => readDeployConfig({ ...complete, OWNER_ADDRESS: "0x1234" }, "localhost");

    expect(attempt).to.throw("OWNER_ADDRESS");
    expect(attempt).to.not.throw("0x1234");
  });

  it("refuses the zero address as owner", function () {
    expect(() =>
      readDeployConfig({ ...complete, OWNER_ADDRESS: `0x${"0".repeat(40)}` }, "localhost"),
    ).to.throw("OWNER_ADDRESS");
  });

  for (const supply of ["1000000000.5", "1e27", "-5", "0", "0x10"]) {
    it(`refuses a supply written as ${supply}`, function () {
      expect(() => readDeployConfig({ ...complete, INITIAL_SUPPLY: supply }, "localhost")).to.throw(
        "INITIAL_SUPPLY",
      );
    });
  }

  it("refuses Base mainnet unless the deploy was confirmed", function () {
    expect(() => readDeployConfig(complete, "base")).to.throw("DEPLOY_MAINNET_CONFIRMED");
    expect(() =>
      readDeployConfig({ ...complete, DEPLOY_MAINNET_CONFIRMED: "yes" }, "base"),
    ).to.throw("DEPLOY_MAINNET_CONFIRMED");
  });

  it("allows Base mainnet once confirmed with 1", function () {
    const config = readDeployConfig({ ...complete, DEPLOY_MAINNET_CONFIRMED: "1" }, "base");

    expect(config.owner).to.equal(OWNER);
  });
});

describe("a supply written in whole tokens by mistake", function () {
  // 18 decimals: one token is 10^18 base units. A figure below that is less than one token,
  // which is what a supply typed in whole tokens looks like, and the mint cannot be redone.
  it("refuses a supply of less than one whole token", function () {
    expect(() =>
      readDeployConfig({ ...complete, INITIAL_SUPPLY: "1000000000" }, "localhost"),
    ).to.throw("INITIAL_SUPPLY");
    expect(() =>
      readDeployConfig({ ...complete, INITIAL_SUPPLY: "999999999999999999" }, "localhost"),
    ).to.throw("INITIAL_SUPPLY");
  });

  it("accepts exactly one whole token", function () {
    const config = readDeployConfig(
      { ...complete, INITIAL_SUPPLY: "1000000000000000000" },
      "localhost",
    );

    expect(config.initialSupply).to.equal(10n ** 18n);
  });
});

describe("loading the env files", function () {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { loadEnvFiles } = require("../scripts/lib/deployConfig");

  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sense-env-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true });
  });

  it("lets the named file win over a value already in the environment", function () {
    const file = path.join(dir, "named.env");
    fs.writeFileSync(file, "OWNER_ADDRESS=from-file\n");
    const env = { ENV_FILE: file, OWNER_ADDRESS: "from-shell" };

    loadEnvFiles(env);

    expect(env.OWNER_ADDRESS).to.equal("from-file");
  });

  it("refuses to go on when the named file cannot be read", function () {
    const env = { ENV_FILE: path.join(dir, "missing.env") };

    expect(() => loadEnvFiles(env)).to.throw("ENV_FILE");
  });

  it("goes on without complaint when no file is named and there is no .env", function () {
    const env = {};

    expect(() => loadEnvFiles(env, dir)).to.not.throw();
  });
});

describe("which env files are loaded", function () {
  it("loads only the named file when one is named, so no other file can fill a gap in it", function () {
    expect(envFilesToLoad({ ENV_FILE: ".env.mainnet" })).to.deep.equal([".env.mainnet"]);
  });

  it("falls back to .env when no file is named", function () {
    expect(envFilesToLoad({})).to.deep.equal([".env"]);
    expect(envFilesToLoad({ ENV_FILE: "  " })).to.deep.equal([".env"]);
  });
});
