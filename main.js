const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Helper to determine path to assets folder
function getAssetsPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'assets');
  }
  return path.join(app.getAppPath(), 'assets');
}

// Global logger for writing traces to assets/diagnostics.log
function logDiagnostic(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(`[Diagnostic] ${message}`);
  try {
    const assetsDir = getAssetsPath();
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const diagnosticsLogPath = path.join(assetsDir, 'diagnostics.log');
    
    // Check file size and truncate if larger than 100KB to keep it constrained
    if (fs.existsSync(diagnosticsLogPath)) {
      const stats = fs.statSync(diagnosticsLogPath);
      if (stats.size > 100 * 1024) {
        const data = fs.readFileSync(diagnosticsLogPath, 'utf8');
        const lines = data.split('\n');
        const truncatedData = lines.slice(-100).join('\n') + '\n';
        fs.writeFileSync(diagnosticsLogPath, truncatedData, 'utf8');
      }
    }
    
    fs.appendFileSync(diagnosticsLogPath, logLine);
  } catch (e) {
    console.error("Failed to write to diagnostics.log:", e);
  }
}

// Log application start
logDiagnostic('=== Application Session Started ===');

const isDevMode = process.argv.includes('--dev');
logDiagnostic(`Developer Mode active: ${isDevMode}`);


class MockSteamClient {
  constructor() {
    this.isInitialized = true;
    this.isMock = true;
    this.friends = {
      getPersonaName: () => "Guest Pet Owner 🐰"
    };
    this.userStats = {
      unlockedAchievements: new Set(),
      getAchievement: (name) => {
        return this.userStats.unlockedAchievements.has(name);
      },
      setAchievement: (name) => {
        this.userStats.unlockedAchievements.add(name);
        return true;
      },
      storeStats: () => {
        console.log(`[Mock Steam] Stats stored.`);
        return true;
      }
    };
  }
  on(event, callback) {
    console.log(`[Mock Steam] Event listener registered for ${event}`);
  }
  shutdown() {
    console.log(`[Mock Steam] Shutdown mock client.`);
  }
}

let isSteamOverlayActive = false;
let steamClient = null;
let edgeCheckInterval = null;
logDiagnostic('Loading Steamworks module @skyatnpm/steamworks-js...');
try {
  const { SteamClient } = require('@skyatnpm/steamworks-js');
  logDiagnostic('Steamworks module loaded successfully. Initializing against App ID 480...');
  const realClient = new SteamClient();
  realClient.init(480).then((success) => {
    if (success) {
      steamClient = realClient;
      logDiagnostic(`Steamworks API initialized successfully. Active user: ${steamClient.friends.getPersonaName()}`);
      
      // Register gameOverlayActivated event listener
      steamClient.on('gameOverlayActivated', (active) => {
        logDiagnostic(`[Steam Event] Overlay activated state changed to: ${active}`);
        isSteamOverlayActive = active;
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (active) {
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.setFullScreen(true);
            mainWindow.webContents.send('steam-overlay-active', true);
          } else {
            mainWindow.setFullScreen(false);
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
            mainWindow.webContents.send('steam-overlay-active', false);
          }
        }
      });
    } else {
      logDiagnostic('Steamworks API initialization failed: init(480) returned false. Falling back to Mock Client.');
      steamClient = new MockSteamClient();
    }
  }).catch((err) => {
    logDiagnostic(`Steamworks API initialization rejected: ${err.message || err}. Falling back to Mock Client.`);
    steamClient = new MockSteamClient();
  });
} catch (err) {
  logDiagnostic(`Failed to load Steamworks native binary or module: ${err.message || err}. Falling back to Mock Client.`);
  steamClient = new MockSteamClient();
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

  // Start with click-through enabled (ignoring clicks) for transparent parts (unless in dev mode).
  // forward: true ensures mouse movements are still tracked inside the window.
  mainWindow.setIgnoreMouseEvents(!isDevMode, { forward: true });

  if (isDevMode) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    logDiagnostic('Developer mode: Detached DevTools window opened.');
  }

  // Repaint invalidator for Steam overlay rendering correctness
  mainWindow.steamworksRepaintInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.webContents.isPainting()) {
        mainWindow.webContents.invalidate();
      }
    } else {
      clearInterval(mainWindow.steamworksRepaintInterval);
    }
  }, 1000 / 60);

  mainWindow.on('closed', function () {
    if (mainWindow && mainWindow.steamworksRepaintInterval) {
      clearInterval(mainWindow.steamworksRepaintInterval);
    }
    if (edgeCheckInterval) {
      clearInterval(edgeCheckInterval);
      edgeCheckInterval = null;
    }
    mainWindow = null;
  });
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

// Steam Overlay hooks for Electron
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-direct-composition');

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (steamClient && steamClient.isInitialized) {
    steamClient.shutdown();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// IPC handler to toggle mouse click-through capability
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (isSteamOverlayActive) return; // Prevent renderer from overriding active overlay focus
  if (mainWindow) {
    const finalIgnore = isDevMode ? false : ignore;
    mainWindow.setIgnoreMouseEvents(finalIgnore, { forward: true });

    // Active polling fallback: check if cursor is outside window boundaries when click-through is enabled
    if (finalIgnore) {
      if (!edgeCheckInterval) {
        edgeCheckInterval = setInterval(() => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            clearInterval(edgeCheckInterval);
            edgeCheckInterval = null;
            return;
          }
          const { x, y } = screen.getCursorScreenPoint();
          const bounds = mainWindow.getBounds();

          const isOutside = x < bounds.x || x > bounds.x + bounds.width ||
                            y < bounds.y || y > bounds.y + bounds.height;

          if (isOutside) {
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.webContents.send('force-hover-exit');
            clearInterval(edgeCheckInterval);
            edgeCheckInterval = null;
          }
        }, 100);
      }
    } else {
      if (edgeCheckInterval) {
        clearInterval(edgeCheckInterval);
        edgeCheckInterval = null;
      }
    }
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
  logDiagnostic(`Received request to trigger achievement: ${achievementName}`);
  if (steamClient && steamClient.isInitialized) {
    try {
      const isActivated = steamClient.userStats.getAchievement(achievementName);
      const isMock = !!steamClient.isMock;
      if (!isActivated) {
        steamClient.userStats.setAchievement(achievementName);
        steamClient.userStats.storeStats();
        logDiagnostic(`[Steam] Achievement successfully activated: ${achievementName} (isMock: ${isMock})`);
        event.reply('steam-achievement-unlocked', { 
          success: !isMock, 
          name: achievementName, 
          isSteamOnline: !isMock 
        });
      } else {
        logDiagnostic(`[Steam] Achievement already unlocked: ${achievementName}`);
        event.reply('steam-achievement-unlocked', { 
          success: false, 
          alreadyUnlocked: true, 
          name: achievementName, 
          isSteamOnline: !isMock 
        });
      }
    } catch (err) {
      logDiagnostic(`[Steam] Error activating achievement ${achievementName}: ${err.message || err}`);
      event.reply('steam-achievement-unlocked', { success: false, error: err.message, name: achievementName, isSteamOnline: false });
    }
  } else {
    logDiagnostic(`[Steam] Failed to trigger achievement ${achievementName}: steamClient not initialized.`);
    event.reply('steam-achievement-unlocked', { success: false, name: achievementName, isSteamOnline: false });
  }
});

// IPC handler to return absolute diagnostic log contents
ipcMain.on('get-diagnostic-logs', (event) => {
  try {
    const diagnosticsLogPath = path.join(getAssetsPath(), 'diagnostics.log');
    if (fs.existsSync(diagnosticsLogPath)) {
      event.returnValue = fs.readFileSync(diagnosticsLogPath, 'utf8');
    } else {
      event.returnValue = 'No diagnostic logs found.';
    }
  } catch (e) {
    event.returnValue = `Error reading diagnostics log: ${e.message}`;
  }
});

// IPC handler to clear diagnostics log
ipcMain.on('clear-diagnostic-logs', (event) => {
  try {
    const diagnosticsLogPath = path.join(getAssetsPath(), 'diagnostics.log');
    fs.writeFileSync(diagnosticsLogPath, `[${new Date().toISOString()}] Diagnostics cleared.\n`, 'utf8');
    event.returnValue = true;
  } catch (e) {
    event.returnValue = false;
  }
});

// IPC handler to query developer mode status
ipcMain.on('is-dev-mode', (event) => {
  event.returnValue = isDevMode;
});

// IPC handler for renderer diagnostics logging
ipcMain.on('log-diagnostic', (event, message) => {
  logDiagnostic(message);
});


