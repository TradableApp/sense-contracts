# CLAUDE.md

Guidance for Claude Code in this repository.

## Overview

`SenseToken` (`contracts/SenseToken.sol`): the `$SENSE` points token for SenseAI. A fixed-supply,
pausable, UUPS-upgradeable ERC-20 whose transfers go through only when the sender or the recipient
is exempt. The README has the rule and its limits.

## Scripts

| Command                                     | Purpose                                                        |
| ------------------------------------------- | -------------------------------------------------------------- |
| `bun run compile`                           | Compile                                                        |
| `bun run test`                              | Hardhat tests                                                  |
| `bun run lint`                              | solhint; warnings are read, not only the exit code             |
| `bun run coverage`                          | solidity-coverage; `contracts/test/` is excluded               |
| `bun run format` / `format:check`           | Prettier for contracts, tests and scripts                      |
| `bun run deploy:localnet\|testnet\|mainnet` | Deploy the proxy; testnet and mainnet only on the owner's word |

## Rules that are easy to break

- **The transfer rule lives in `_update` and reads `from` and `to` only.** Do not exempt by
  `msg.sender`: an exempt spender would become a relay between holders.
- **No mint, no burn, no bulk hand-out function.** The supply test fails if one appears in the ABI.
- **Storage is namespaced (ERC-7201, `tradable.storage.SenseToken`).** A test reads the slot from
  the formula. New state goes in the struct, appended.
- **The owner's exemption is `account == owner()`**, not a listing, so it moves when a transfer of
  ownership is accepted and cannot be left behind on an old owner.
- `renounceOwnership` reverts and must stay `nonpayable` in the ABI.
- `.env*` files are never read or written by tooling here, and `gas-report.txt` is never committed.

## Related repositories

`tokenized-ai-agent` (the escrow that spends SENSE), `sense-ai-dapp`, `sense-ai-e2e`,
`able-contracts` (the token this contract was copied from).
