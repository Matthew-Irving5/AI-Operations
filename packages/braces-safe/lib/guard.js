'use strict';

const MAX_AST_DEPTH = 256;
const MAX_BRACE_DEPTH = 64;

const guardAstDepth = (depth) => {
  if (depth > MAX_AST_DEPTH) {
    throw new RangeError(
      `Brace AST nesting exceeds the maximum supported depth (${MAX_AST_DEPTH})`,
    );
  }
};

guardAstDepth.maxBraceDepth = MAX_BRACE_DEPTH;

module.exports = guardAstDepth;
