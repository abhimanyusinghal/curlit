'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { registerIpcHandlers, closeAllWebSockets } = require('./ipc.cjs');

const isDev = !!process.env.CURLIT_DEV_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1013',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Any window.open() call (e.g. OAuth authorize) opens in the user's browser.
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.CURLIT_DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  registerIpcHandlers(ipcMain, win);

  win.on('closed', () => {
    closeAllWebSockets();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeAllWebSockets();
  if (process.platform !== 'darwin') app.quit();
});
