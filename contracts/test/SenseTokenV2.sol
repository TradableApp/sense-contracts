// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { SenseToken } from "../SenseToken.sol";

/**
 * @title SENSE Token V2 (test fixture)
 * @author Tradable
 * @notice Exists only so the tests have something to upgrade to. Never deployed.
 */
contract SenseTokenV2 is SenseToken {
  /**
   * @notice The version of this implementation.
   * @return The string "v2".
   */
  function version() public pure returns (string memory) {
    return "v2";
  }
}
