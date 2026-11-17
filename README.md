# sense-contracts

The `$SENSE` points token: a fixed-supply credit that is spent on SenseAI and cannot be moved
between holders.

## What the token does

`SenseToken` is an upgradeable (UUPS) ERC-20 with 18 decimals. The whole supply is minted once, to
the owner, when the proxy is initialised. There is no mint and no burn.

A transfer goes through only when the sender or the recipient is **exempt**. The owner is exempt,
and so is every address the owner lists with `setTransferExempt`.

| Movement                                                      | Result                                      |
| ------------------------------------------------------------- | ------------------------------------------- |
| Owner or treasury sends points to a wallet                    | Allowed                                     |
| A wallet pays a SenseAI escrow, or the treasury               | Allowed                                     |
| The escrow refunds a wallet, or pays the treasury             | Allowed                                     |
| A wallet sends points to another wallet                       | Reverts with `TransferNotAllowed(from, to)` |
| A wallet sends points to a pool, a bridge or a wrapper        | Reverts with `TransferNotAllowed(from, to)` |
| An exempt spender moves one wallet's points to another wallet | Reverts with `TransferNotAllowed(from, to)` |

The rule looks at where the points leave and where they arrive, never at who called. `approve`
works as in any ERC-20, so a wallet approves the escrow and the escrow pulls the fee.

## What the rule does not do

- The owner chooses the exempt addresses and can upgrade the contract, so the rule is as strong as
  the owner key. On a public network the owner should be a multisig.
- An exempt address can send to anyone. List only the treasury, a SenseAI escrow, or a contract
  that hands points out under its own rules. Never list a contract that forwards for whoever
  calls it.
- A wallet shows SENSE as an ordinary token with a send button. Sending to another wallet fails.
- A whole wallet can still change hands if its key is handed over. No contract can prevent that.

## Owner functions

| Function                                               | Effect                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `setTransferExempt(account, exempt)`                   | Lists or unlists an address; emits `TransferExemptSet`      |
| `pause()` / `unpause()`                                | Stops and resumes every movement, the allowed ones included |
| `transferOwnership(newOwner)` then `acceptOwnership()` | Two-step handover; the owner's exemption moves with it      |
| `upgradeToAndCall(...)`                                | Upgrades the implementation                                 |

`renounceOwnership()` always reverts.

## Development

Node 24 (see `.nvmrc`) and Bun 1.3.14.

```bash
bun install
bun run compile
bun run test
bun run lint
bun run coverage
```

## Deploying

The deploy script reads its settings from the file named by `ENV_FILE` (`.env.localnet`,
`.env.testnet` or `.env.mainnet`). A named file is the only one loaded; `.env` is read only when
no file is named, so a gap in the mainnet file is an error and is never filled from another file.
These files are never committed.

The settings are checked before anything is sent. A mainnet deploy also needs
`DEPLOY_MAINNET_CONFIRMED=1`, because the supply is minted once, to the owner, and cannot be undone.

| Variable                               | Meaning                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `TOKEN_NAME`, `TOKEN_SYMBOL`           | For example `SENSE` and `SENSE`                                                |
| `INITIAL_SUPPLY`                       | The whole supply in base units: `1000000000000000000000000000` for one billion |
| `OWNER_ADDRESS`                        | Receives the supply and owns the contract                                      |
| `PRIVATE_KEY`                          | The deployer's key                                                             |
| `BASE_SEPOLIA_RPC`, `BASE_MAINNET_RPC` | RPC endpoints                                                                  |
| `ETHERSCAN_API_KEY`                    | For source verification                                                        |

```bash
bun run deploy:localnet
bun run deploy:testnet
bun run deploy:mainnet
```

After deploying, the owner lists the treasury and each SenseAI escrow with `setTransferExempt`.
When the owner is not the deployer, the owner does this itself.

## Operating the exempt list

The escrow pays the treasury and refunds wallets, so the list and the escrow's settings have to
agree. If they do not, calls revert and points can be held where they are.

- **Changing the escrow's treasury:** list the new treasury here first, change it on the escrow,
  and unlist the old one last.
- **Never unlist an escrow that still holds pending payments.** Its refunds would revert until it
  is listed again.
- **The escrow's owner can undo the rule** by upgrading the escrow, since a listed escrow can send
  to anyone. Keep the escrow and the token under the same owner.
- **Never list the owner.** The owner is exempt already, and a listing would stay behind after
  ownership moves. The list cannot be read back from the chain in one call: rebuild it from
  `TransferExemptSet` events, and check it whenever ownership changes.
- **Pausing the token stops SenseAI answers**, because settling an answer moves points.
- Points sent straight to an escrow, without a prompt, stay there.

## Licence

Apache-2.0. See `LICENSE`.
