const { createApp } = require('./src/app');

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
