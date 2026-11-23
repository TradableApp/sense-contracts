// Contracts under contracts/test/ are fixtures, not shipped code: SenseTokenV2 exists only to be
// upgraded to, and TestBatchWallet and TestMultiSendCallOnly only to play a multisig sending a
// batch. Instrumenting them would report them as uncovered and understate the figure for the one
// contract that ships.
module.exports = {
  skipFiles: ["test/"],
};
