const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const originalLoad = BrowserWindow.prototype.loadFile;

dialog.showErrorBox = (title, message) => {
  fs.writeFileSync(process.env.SENTINEL_QA_DIALOG, JSON.stringify({ title, message }));
};
BrowserWindow.prototype.loadFile = function (file, options) {
  if (options?.query?.view === 'float') {
    app.quit();
    return Promise.reject(new Error('Window closed during startup'));
  }
  return originalLoad.call(this, file, options);
};
