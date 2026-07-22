const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require('electron');
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


let isSteamOverlayActive = false;
let steamClient = null;
let edgeCheckInterval = null;

// Initialize Steamworks API directly using production module steamworks.js
logDiagnostic('[Steamworks] Connecting to native Steam API (App ID 480)...');
try {
  const steamworks = require('steamworks.js');
  const client = steamworks.init(480);
  const personaName = client.localplayer ? client.localplayer.getName() : "Steam User 🎮";
  
  steamClient = {
    isInitialized: true,
    client: client,
    getPersonaName: () => personaName,
    setAchievement: (name) => {
      client.achievement.activate(name);
      return true;
    },
    isAchievementUnlocked: (name) => {
      return client.achievement.isUnlocked(name);
    },
    openOverlay: (dialog = 'Friends') => {
      logDiagnostic(`[Steam API] Opening native overlay dialog: ${dialog}`);
      client.overlay.activateDialog(dialog);
      return true;
    }
  };
  logDiagnostic(`[Steamworks SUCCESS] Connected! Live Steam Persona: ${personaName}`);
} catch (err) {
  logDiagnostic(`[Steamworks ERROR] Steam Client is not connected (${err.message}). Please ensure Steam Desktop App (steam.exe) is running.`);
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

  // Background uptime monitor for ACH_TRAVEL_FAR (triggers every 20 minutes)
  let uptimeAchievementInterval = setInterval(() => {
    if (steamClient && steamClient.isInitialized && steamClient.userStats) {
      logDiagnostic('[Uptime Monitor] Triggering 20-minute achievement: ACH_TRAVEL_FAR');
      steamClient.userStats.setAchievement('ACH_TRAVEL_FAR');
      steamClient.userStats.storeStats();
    }
  }, 1200 * 1000);

  mainWindow.on('closed', function () {
    if (uptimeAchievementInterval) {
      clearInterval(uptimeAchievementInterval);
    }
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

// Steam Overlay hooks & DirectComposition GPU acceleration for Electron
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-begin-frame-scheduling');

app.on('ready', () => {
  createWindow();
  try {
    globalShortcut.register('Shift+Tab', () => {
      logDiagnostic('[Shortcut] Shift+Tab shortcut pressed.');
      triggerSteamOverlay('Friends');
    });
  } catch (e) {
    logDiagnostic(`[Shortcut] Shift+Tab shortcut registration: ${e.message}`);
  }
});

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

// Map internal or legacy triggers to the configured Steamworks API Name (NEW_ACHIEVEMENT_1_0)
const ACHIEVEMENT_MAP = {
  'ACH_FIRST_STEPS': 'NEW_ACHIEVEMENT_1_0',
  'ACH_WIN_ONE_GAME': 'NEW_ACHIEVEMENT_1_0',
  'ACH_HEAVY_RADAR': 'NEW_ACHIEVEMENT_1_0',
  'NEW_ACHIEVEMENT_1_0': 'NEW_ACHIEVEMENT_1_0'
};

// IPC handler to activate Steam achievements
ipcMain.on('trigger-steam-achievement', (event, rawAchievementName) => {
  const achievementName = ACHIEVEMENT_MAP[rawAchievementName] || rawAchievementName;
  logDiagnostic(`Received request to trigger achievement: ${rawAchievementName} (Mapped API Name: ${achievementName})`);
  if (steamClient && steamClient.isInitialized) {
    try {
      const isUnlocked = steamClient.isAchievementUnlocked(achievementName);
      if (!isUnlocked) {
        steamClient.setAchievement(achievementName);
        logDiagnostic(`[Steam SUCCESS] Achievement unlocked on Steam: ${achievementName}`);
        event.reply('steam-achievement-unlocked', { success: true, name: achievementName, isSteamOnline: true });
      } else {
        logDiagnostic(`[Steam INFO] Achievement already unlocked: ${achievementName}`);
        event.reply('steam-achievement-unlocked', { success: false, alreadyUnlocked: true, name: achievementName, isSteamOnline: true });
      }
    } catch (err) {
      logDiagnostic(`[Steam ERROR] Failed to unlock achievement ${achievementName}: ${err.message || err}`);
      event.reply('steam-achievement-unlocked', { success: false, error: err.message, name: achievementName, isSteamOnline: false });
    }
  } else {
    logDiagnostic(`[Steam WARNING] Cannot trigger achievement ${achievementName}: Steam is not connected. Please open Steam client.`);
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

// Helper to open native Steam overlay or launch Steam client protocol UI
function triggerSteamOverlay(dialogName = 'Friends') {
  logDiagnostic(`[Steam Overlay] Triggering overlay/interface for: ${dialogName}`);
  if (steamClient && steamClient.isInitialized) {
    try {
      steamClient.openOverlay(dialogName);
      logDiagnostic(`[Steam Overlay] Native overlay activated for ${dialogName}`);
      return true;
    } catch (err) {
      logDiagnostic(`[Steam Overlay] Native hook failed (${err.message}). Opening via Steam Client protocol...`);
    }
  }
  // Steam protocol fallback opens Steam Client directly to Friends/Community
  shell.openExternal('steam://open/friends');
  return true;
}

// IPC handler to open Steam overlay on demand
ipcMain.on('open-steam-overlay', (event, dialogName) => {
  const success = triggerSteamOverlay(dialogName || 'Friends');
  event.reply('steam-overlay-result', { success });
});


