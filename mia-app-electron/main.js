const { app, BrowserWindow } = require('electron');





let mainWindow;

// ================= WINDOW =================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,      // puoi lasciarlo per ora
      contextIsolation: false,     // idem (in prod si cambia)
      webSecurity: false            // Disabilita la sicurezza web per permettere le richieste a localhost
    }
  });

  mainWindow.loadFile('index.html');
}

// ================= APP =================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
