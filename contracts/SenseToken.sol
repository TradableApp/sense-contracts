// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
// solhint-disable-next-line max-line-length
import { ERC20PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SENSE Token
 * @author Tradable
 * @notice A fixed-supply points credit that is spent on SenseAI. It cannot be moved between
 * holders: a transfer goes through only when the sender or the recipient is exempt.
 * @dev ERC20, Pausable, two-step Ownable and UUPS, from OpenZeppelin's upgradeable contracts. The
 * whole supply is minted once, in {initialize}; there is no mint and no burn.
 *
 * The rule is as strong as the owner key: the owner chooses the exempt addresses and can upgrade
 * this contract.
 */
contract SenseToken is
  Initializable,
  ERC20Upgradeable,
  ERC20PausableUpgradeable,
  Ownable2StepUpgradeable,
  UUPSUpgradeable
{
  /// @custom:storage-location erc7201:tradable.storage.SenseToken
  struct SenseTokenStorage {
    /// @dev Addresses the owner has listed as exempt. The owner is exempt without being listed.
    mapping(address account => bool exempt) transferExempt;
  }

  // keccak256(abi.encode(uint256(keccak256("tradable.storage.SenseToken")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant SENSE_TOKEN_STORAGE =
    0x3f27f25ea2c2c892dad4d222e0297f3d5e3989d291e1902eb56873f7a2916500;

  /// @notice Emitted when the owner adds an address to, or takes it off, the exempt list.
  /// @param account The address whose listing changed.
  /// @param exempt True when the address is now listed.
  event TransferExemptSet(address indexed account, bool exempt); // solhint-disable-line gas-indexed-events

  /// @notice Thrown when neither the sender nor the recipient of a transfer is exempt.
  /// @param from The address the points would have left.
  /// @param to The address the points would have reached.
  error TransferNotAllowed(address from, address to);

  /// @notice Thrown by {setTransferExempt} for the zero address.
  error ExemptAccountIsZero();

  /// @notice Thrown by {renounceOwnership}: ownership of this token cannot be abandoned.
  error OwnershipCannotBeRenounced();

  /**
   * @notice Locks the implementation contract so it can never be initialised directly.
   * @dev An uninitialised implementation can be claimed by anyone. That cannot reach the proxy's
   *      storage, but it would leave a source-verified token with this bytecode at a real address.
   */
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the contract, setting the name, symbol, supply and owner.
   * @dev Can only be called once, on the proxy. This is the only mint.
   * @param _name The name of the token.
   * @param _symbol The symbol of the token.
   * @param _initialSupply The whole supply, minted to the initial owner.
   * @param _initialOwner The address that receives the supply and owns the contract.
   */
  function initialize(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply,
    address _initialOwner
  ) public initializer {
    __ERC20_init(_name, _symbol);
    __ERC20Pausable_init();
    // __Ownable_init assigns the owner and is required: __Ownable2Step_init() has an empty body
    // that does not chain to it. It is called second so that any state a later OpenZeppelin
    // release gives it is initialised, and never sees a zero owner.
    __Ownable_init(_initialOwner);
    __Ownable2Step_init();

    _mint(_initialOwner, _initialSupply);
  }

  /**
   * @notice Adds an address to, or takes it off, the exempt list.
   * @dev Only the owner. An exempt address can receive points from anyone and send them to
   *      anyone, so list only the treasury, a SenseAI escrow, or a contract that hands points out
   *      under its own rules. Never list a contract that forwards for whoever calls it: it would
   *      move points between holders.
   * @param account The address to list or unlist.
   * @param exempt True to list, false to unlist.
   */
  function setTransferExempt(address account, bool exempt) external onlyOwner {
    if (account == address(0)) revert ExemptAccountIsZero();
    _senseStorage().transferExempt[account] = exempt;
    emit TransferExemptSet(account, exempt);
  }

  /**
   * @notice Whether an address may send points to, and receive points from, anyone.
   * @dev The owner is exempt by being the owner, so the exemption moves with ownership when a
   *      transfer of ownership is accepted.
   * @param account The address to check.
   * @return True when the address is the owner or is listed.
   */
  function isTransferExempt(address account) public view returns (bool) {
    return account == owner() || _senseStorage().transferExempt[account];
  }

  /**
   * @notice Pauses every movement of the token, the allowed ones included.
   * @dev Only the owner. Emits {Paused}.
   */
  function pause() public onlyOwner {
    _pause();
  }

  /**
   * @notice Resumes movements of the token.
   * @dev Only the owner. Emits {Unpaused}.
   */
  function unpause() public onlyOwner {
    _unpause();
  }

  /**
   * @notice Disabled: ownership of this token cannot be renounced.
   * @dev Renouncing would leave a pausable, upgradeable token with an exempt list that nobody
   *      could ever change again. {Ownable2StepUpgradeable} does not cover this: it overrides
   *      `transferOwnership` and leaves `renounceOwnership` as the single-step version.
   *
   *      `onlyOwner` is kept so a non-owner gets {OwnableUnauthorizedAccount} and the owner gets
   *      {OwnershipCannotBeRenounced}.
   *
   *      solc suggests `view` here; do not apply it. That changes the ABI's `stateMutability`,
   *      and callers dispatch on it: a `view` function is sent as a read, not a transaction.
   */
  function renounceOwnership() public override onlyOwner {
    revert OwnershipCannotBeRenounced();
  }

  /**
   * @notice Applies the transfer rule, then the pause, to every movement.
   * @dev The rule looks at where the points leave and where they arrive, never at who called. An
   *      exempt spender therefore cannot move one holder's points to another holder.
   *
   *      `from` is the zero address only for the mint in {initialize}. A transfer to the zero
   *      address never reaches here: {ERC20Upgradeable} refuses it first, and nothing burns.
   * @param from The address the points leave.
   * @param to The address the points reach.
   * @param value The amount moved.
   */
  function _update(
    address from,
    address to,
    uint256 value
  ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
    if (from != address(0) && !isTransferExempt(from) && !isTransferExempt(to)) {
      revert TransferNotAllowed(from, to);
    }
    super._update(from, to, value);
  }

  /**
   * @notice Authorizes an upgrade to a new implementation. Only the owner.
   * @param newImplementation The address of the new implementation.
   */
  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
    // solhint-disable-previous-line no-empty-blocks
    // Left blank on purpose: onlyOwner is the whole check.
  }

  function _senseStorage() private pure returns (SenseTokenStorage storage $) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      $.slot := SENSE_TOKEN_STORAGE
    }
  }
}
