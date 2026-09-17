// boot.js
// Installs everything the Creator changed from the panel over the defaults
// the code ships: platform settings (economy numbers), Monopoly boards,
// shop items and Meme Hype cards. Each step is independent - one that fails
// is logged and the rest still load, leaving that part as the code ships.

/* eslint-disable global-require */
const steps = [
  ['settings', () => require('./settings').load()],
  ['boards', () => {
    const problems = require('./boards').install();
    problems.forEach((p) => console.error(`Board "${p.id}" could not be installed: ${p.error}`)); // eslint-disable-line no-console
  }],
  ['shop', () => require('../economy/shopAdmin').install()],
  ['memes', () => require('../memehype/memeAdmin').install()],
];

function installAll() {
  const failed = [];
  steps.forEach(([name, run]) => {
    try {
      run();
    } catch (err) {
      failed.push(name);
      // eslint-disable-next-line no-console
      console.error(`Could not install the Creator's ${name}:`, err);
    }
  });
  return failed;
}

module.exports = { installAll };
