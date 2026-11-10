'use strict';

// Use the maintained HTTP parser rather than Node's bundled fetch.
// Undici #5474 fixes an uncatchable assertion when a paused response socket ends.
// Keep this explicit: do not replace the global fetch used by unrelated integrations.
module.exports = require('undici').fetch;
