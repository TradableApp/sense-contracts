// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Test MultiSendCallOnly (test fixture)
 * @author Tradable
 * @notice Exists only so the tests can batch calls the way a Safe multisig does. Never deployed.
 * @dev A small stand-in written here, not a copy, for Safe's MultiSendCallOnly. It reads the same
 *      packed encoding, one call after another: operation (1 byte, 0 for CALL), target (20 bytes),
 *      value (32 bytes), data length (32 bytes), data. Only CALL is accepted. It is run by
 *      delegatecall from the wallet, so each call is made by the wallet. The first call that fails
 *      reverts the whole batch with that call's own error.
 */
contract TestMultiSendCallOnly {
  /// @notice Thrown for an operation other than CALL.
  error OnlyCallAllowed();

  /**
   * @notice Makes each packed call in order and reverts all of them if one fails.
   * @param transactions The packed calls.
   */
  function multiSend(bytes calldata transactions) external payable {
    uint256 i = 0;
    while (i < transactions.length) {
      if (uint8(transactions[i]) != 0) revert OnlyCallAllowed();
      address to = address(bytes20(transactions[i + 1:i + 21]));
      uint256 value = uint256(bytes32(transactions[i + 21:i + 53]));
      uint256 dataLength = uint256(bytes32(transactions[i + 53:i + 85]));
      bytes calldata data = transactions[i + 85:i + 85 + dataLength];

      // solhint-disable-next-line avoid-low-level-calls
      (bool ok, bytes memory result) = to.call{ value: value }(data);
      if (!ok) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
          revert(add(result, 0x20), mload(result))
        }
      }
      i += 85 + dataLength;
    }
  }
}
