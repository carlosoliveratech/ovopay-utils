const BASE64_CHARS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  '+',
  '/',
  '=',
]);

function isLikelyBase64Chunk(chunk) {
  if (!chunk || chunk.length === 0) {
    return false;
  }

  for (let i = 0; i < chunk.length; i += 1) {
    const code = chunk[i];
    if (code === 0x0a || code === 0x0d || code === 0x09 || code === 0x20) {
      continue;
    }
    if (code > 0x7f) {
      return false;
    }
    const char = String.fromCharCode(code);
    if (!BASE64_CHARS.has(char)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  isLikelyBase64Chunk,
};
