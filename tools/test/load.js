// Load the app's classic-script files into Node's global context (window === global), for tests and checks.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
module.exports = function load(files) {
  global.window = global; global.self = global;
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  return global;
};
