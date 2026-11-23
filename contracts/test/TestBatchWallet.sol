// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Test batch wallet (test fixture)
 * @author Tradable
 * @notice Plays a multisig in the tests: one operator stands in for the signers. Never deployed.
 * @dev Runs a batch by delegatecall into a MultiSendCallOnly-style contract, as a Safe does, so
 *      every call in the batch is made by this wallet. A failed batch reverts with its own error.
 */
contract TestBatchWallet {
  /// @notice The one account allowed to run a batch.
  address public immutable OPERATOR;

  /// @notice Thrown when anyone but the operator asks for a batch.
  error NotOperator();

  /**
   * @notice Sets the one account allowed to run a batch.
   * @param _operator The account allowed to run a batch.
   */
  constructor(address _operator) {
    OPERATOR = _operator;
  }

  /**
   * @notice Runs a batch of packed calls in one transaction.
   * @param multiSend The batch contract to delegatecall.
   * @param transactions The packed calls it reads.
   */
  function execBatch(address multiSend, bytes calldata transactions) external {
    if (msg.sender != OPERATOR) revert NotOperator();
    // solhint-disable-next-line avoid-low-level-calls
    (bool ok, bytes memory result) = multiSend.delegatecall(
      abi.encodeWithSignature("multiSend(bytes)", transactions)
    );
    if (!ok) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        revert(add(result, 0x20), mload(result))
      }
    }
  }
}
