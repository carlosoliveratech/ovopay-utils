const ipaddr = require('ipaddr.js');

const BLOCKED_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'private',
  'uniqueLocal',
  'reserved',
  'carrierGradeNat',
]);

function isPrivateAddress(address) {
  if (!ipaddr.isValid(address)) {
    return true;
  }

  const parsed = ipaddr.parse(address);
  const range = parsed.range();

  return BLOCKED_RANGES.has(range);
}

module.exports = {
  isPrivateAddress,
};
