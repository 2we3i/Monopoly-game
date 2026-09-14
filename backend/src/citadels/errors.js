// errors.js
// The error every rejected Citadels action throws. The socket layer
// passes its message back to the player who tried the action; anything
// else that is thrown is treated as a server bug.

class CitadelsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CitadelsError';
  }
}

module.exports = { CitadelsError };
