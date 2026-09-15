// errors.js
// The error every rejected Catan action throws. The socket layer passes
// its message back to the player who tried the action; anything else that
// is thrown is treated as a server bug.

class CatanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatanError';
  }
}

module.exports = { CatanError };
