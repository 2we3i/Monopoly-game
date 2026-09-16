// engine.js
// The Iron Throne rules live on the server (backend/src/throne/engine.mjs),
// which is authoritative for online rooms. The browser imports the very
// same module - for the hot-seat table and for previews (legal marches,
// battle odds) - so the two can never disagree.

export * from '@throne/engine.mjs';
