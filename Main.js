// ==============================
// IMPORTS
// ==============================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Disable GPU crash (Windows fix)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

let mainWindow;

// ==============================
// CREATE WINDOW
// ==============================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ==============================
// WINDOW CONTROLS
// ==============================

ipcMain.on('minimize', () => mainWindow?.minimize());

ipcMain.on('maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized()
    ? mainWindow.unmaximize()
    : mainWindow.maximize();
});

ipcMain.on('close', () => mainWindow?.close());

// ==============================
// ADD SONG FROM YOUTUBE
// ==============================

ipcMain.handle('add-song-from-url', async (event, url) => {

  console.log("📥 Received URL:", url);

  try {

    const musicFolder = path.join(app.getPath('music'), 'Melody Downloads');

    if (!fs.existsSync(musicFolder)) {
      fs.mkdirSync(musicFolder, { recursive: true });
    }

    const videoId = Date.now().toString();
    const finalFilePath = path.join(musicFolder, `${videoId}.mp3`);
    const outputTemplate = path.join(musicFolder, `${videoId}.%(ext)s`);
    const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');

    console.log("🚀 Starting yt-dlp...");

    return await new Promise((resolve) => {

      const yt = spawn(ytDlpPath, [
        '--no-playlist',            // ✅ FIXED: only download single video
        '-x',
        '--audio-format', 'mp3',
        '--ffmpeg-location', __dirname,
        '--no-warnings',
        '--newline',
        '-o', outputTemplate,
        url
      ]);

      let resolved = false;

      // 🔥 Progress Updates
      yt.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(text);

        const match = text.match(/(\d{1,3}\.\d+)%/);
        if (match && mainWindow) {
          mainWindow.webContents.send(
            'download-progress',
            parseFloat(match[1])
          );
        }
      });

      yt.stderr.on('data', (data) => {
        console.log(data.toString());
      });

      yt.on('close', (code) => {

        if (resolved) return;
        resolved = true;

        console.log("❗ yt-dlp closed with code:", code);

        if (code === 0 && fs.existsSync(finalFilePath)) {

          console.log("✅ File saved:", finalFilePath);

          resolve({
            success: true,
            title: `YouTube-${videoId}`,
            duration: 0,
            thumbnail: '',
            url: `file://${finalFilePath.replace(/\\/g, '/')}`,
            artist: 'YouTube',
            id: videoId
          });

        } else {

          console.log("❌ Download failed");

          resolve({
            success: false,
            error: 'Download failed'
          });
        }
      });

      // 🔥 Safety Timeout (prevents infinite hang)
      setTimeout(() => {
        if (!resolved) {
          yt.kill();
          resolve({
            success: false,
            error: 'Download timeout'
          });
        }
      }, 120000);

    });

  } catch (error) {
    console.error("🔥 Fatal Error:", error);
    return { success: false, error: error.message };
  }
});

// ==============================
// LOCAL FILE SELECT
// ==============================

ipcMain.handle('select-local-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio Files',
          extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac']
        }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];

      return {
        success: true,
        title: path.basename(filePath).replace(/\.[^/.]+$/, ''),
        url: `file://${filePath.replace(/\\/g, '/')}`,
        local: true
      };
    }

    return { success: false };

  } catch (error) {
    console.error('Error selecting file:', error);
    return { success: false, error: error.message };
  }
});
