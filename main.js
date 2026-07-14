const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let steamClient = null;
try {
  const steamworks = require('steamworks.js');
  steamClient = steamworks.init(480);
  if (steamClient && steamClient.localUser) {
    console.log("Steamworks API initialized. Active user:", steamClient.localUser.getSteamName());
  } else {
    console.log("Steamworks API initialized successfully (No local user info).");
  }
} catch (err) {
  console.warn("Steamworks API failed to initialize (Offline Mode):", err.message);
}

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winWidth = 350;
  const winHeight = 350;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    // Position near the bottom-right of the primary screen, just above the taskbar
    x: screenWidth - winWidth - 50,
    y: screenHeight - winHeight - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Start with click-through enabled (ignoring clicks) for transparent parts.
  // forward: true ensures mouse movements are still tracked inside the window.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}



// Helper to determine path to settings configuration file inside main process
function getAssetsPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'assets');
  }
  return path.join(app.getAppPath(), 'assets');
}

function shouldOptimizeGPU() {
  const assetsDir = getAssetsPath();
  const settingsFile = path.join(assetsDir, 'settings');
  const settingsTxtFile = path.join(assetsDir, 'settings.txt');
  let filePath = null;
  if (fs.existsSync(settingsFile)) filePath = settingsFile;
  else if (fs.existsSync(settingsTxtFile)) filePath = settingsTxtFile;
  
  if (filePath && fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const lines = data.split('\n');
      let optimize = true; // Default to true if not specified
      lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2 && parts[0].trim() === 'gpuOptimize') {
          optimize = (parts[1].trim() !== 'false');
        }
      });
      return optimize;
    } catch (e) {
      console.error('Error reading settings in main:', e);
    }
  }
  return true; // Default to true if file missing
}

// Disable GPU occlusion tracking to prevent chromium from suspending rendering
// when window overlaps with other apps
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');

// Conditionally append GPU optimizations based on user preference config
if (shouldOptimizeGPU()) {
  // Force Electron to request the high-performance dedicated GPU (discrete graphics)
  app.commandLine.appendSwitch('force-high-performance-gpu', 'true');

  // Bypass Chromium driver blocklists to ensure hardware acceleration is active
  app.commandLine.appendSwitch('ignore-gpu-blocklist', 'true');
}

// Disable automatic DPI scaling to prevent window enlarging/shrinking when dragging across monitors
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// IPC handler to toggle mouse click-through capability
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// IPC handler to return the assets path synchronously
ipcMain.on('get-assets-path', (event) => {
  event.returnValue = getAssetsPath();
});

// IPC handler to move the window when dragging the character
ipcMain.on('move-window', (event, delta) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(Math.round(x + delta.x), Math.round(y + delta.y));
  }
});

// IPC handler to dynamically resize the window based on 3D asset dimensions
ipcMain.on('resize-window', (event, size) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [w, h] = mainWindow.getSize();
    const deltaW = Math.round(size.width - w);
    const deltaH = Math.round(size.height - h);
    
    // Adjust position coordinates by the size delta so the bottom-right corner stays anchored
    mainWindow.setBounds({
      x: Math.round(x - deltaW),
      y: Math.round(y - deltaH),
      width: Math.round(size.width),
      height: Math.round(size.height)
    });
  }
});

// IPC handler to activate Steam achievements
ipcMain.on('trigger-steam-achievement', (event, achievementName) => {
  if (steamClient) {
    try {
      if (!steamClient.achievements.isActivated(achievementName)) {
        steamClient.achievements.activate(achievementName);
        console.log(`[Steam] Achievement activated: ${achievementName}`);
        event.reply('steam-achievement-unlocked', { success: true, name: achievementName, isSteamOnline: true });
      } else {
        console.log(`[Steam] Achievement already unlocked: ${achievementName}`);
        event.reply('steam-achievement-unlocked', { success: false, alreadyUnlocked: true, name: achievementName, isSteamOnline: true });
      }
    } catch (err) {
      console.error(`[Steam] Error activating achievement:`, err);
      event.reply('steam-achievement-unlocked', { success: false, error: err.message, name: achievementName, isSteamOnline: false });
    }
  } else {
    event.reply('steam-achievement-unlocked', { success: false, name: achievementName, isSteamOnline: false });
  }
});
