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

describe("which env files are loaded", function () {
  it("loads only the named file when one is named, so no other file can fill a gap in it", function () {
    expect(envFilesToLoad({ ENV_FILE: ".env.mainnet" })).to.deep.equal([".env.mainnet"]);
  });

  it("falls back to .env when no file is named", function () {
    expect(envFilesToLoad({})).to.deep.equal([".env"]);
    expect(envFilesToLoad({ ENV_FILE: "  " })).to.deep.equal([".env"]);
  });
});
