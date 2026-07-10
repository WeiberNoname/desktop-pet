import * as THREE from './node_modules/three/build/three.module.js';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const { ipcRenderer } = window.require('electron');
const fs = window.require('fs');
const path = window.require('path');
const { pathToFileURL } = window.require('url');

let scene, camera, renderer, characterGroup, innerModelGroup, collisionProxy;
let mixer;
let idleAction = null;
let reactAction = null;
let loadedAnimations = [];
let availableAnimations = [];
let customModelLoaded = false;

// Settings Panel configurations
let currentSettings = {
  width: 350,
  height: 350,
  scale: 1.0,
  bobbing: true,
  spinX: false,
  spinY: false,
  spinZ: false,
  speedX: 1.0,
  speedY: 1.0,
  speedZ: 1.0,
  gpuOptimize: true,
  mouseOptimize: true,
  settingsLeft: false,
  lockPosition: false,
  activeModel: 'procedural',
  activeAnimation: 'default',
  clickCount: 0,
  fontSizeScale: 1.0
};

let discoveredModels = [];
let speechTimeout = null;
let lastIdleThoughtTime = Date.now();
let lastBreakReminderTime = Date.now();

// Helper function to update gear position dynamically
function updateGearPosition() {
  const gearBtn = document.getElementById('settings-btn');
  if (!gearBtn) return;
  if (currentSettings.settingsLeft) {
    gearBtn.style.left = '10px';
    gearBtn.style.right = 'auto';
  } else {
    gearBtn.style.right = '10px';
    gearBtn.style.left = 'auto';
  }
}
let hasSettingsFile = false;
let isSettingsOpen = false;
let isMouseOverCharacter = false;
let isMouseOverUI = false;
let isDragging = false;
let dragStartScreenX = 0;
let dragStartScreenY = 0;
let dragMoveDistance = 0;

// Navigation States (Blender-style Viewport Orbit/Pan/Zoom)
let isNavigating = false;
let navType = 'orbit'; // 'orbit', 'pan', 'zoom'
let navStartMouseX = 0;
let navStartMouseY = 0;
let navStartRotationX = 0;
let navStartRotationY = 0;
let navStartTranslationX = 0;
let navStartTranslationY = 0;
let navStartTranslationZ = 0;

// Modifier key states for click-through override tracking
let altKeyHeld = false;
let shiftKeyHeld = false;
let ctrlKeyHeld = false;

// Animation state
let animationState = {
  type: 'idle', // 'idle' or 'interact'
  startTime: 0,
  duration: 1000 // ms
};

function init() {
  const container = document.getElementById('container');
  
  // Load settings configuration file if it exists in assets/
  hasSettingsFile = readSettingsFile();

  const settingsPanel = document.getElementById('settings-panel');
  if (settingsPanel && currentSettings.fontSizeScale) {
    settingsPanel.style.setProperty('--panel-font-scale', currentSettings.fontSizeScale);
  }

  // 1. Create Scene
  scene = new THREE.Scene();

  // 2. Create Camera
  // Using PerspectiveCamera, centered on origin
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5.5);

  // 3. Create Renderer with full transparency
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // Completely transparent
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 4. Add Lights for a gorgeous glossy toy look
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(5, 8, 5);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0xffb6c1, 0.6, 15);
  fillLight.position.set(-4, -2, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
  rimLight.position.set(0, 5, -5);
  scene.add(rimLight);

  // 5. Auto-detect custom asset in assets/ or load procedural mascot
  detectAndLoadAsset();

  // 6. Hook up Interaction & Window Dragging
  setupInteraction();

  // 6.5. Setup Settings UI panel listeners if enabled
  if (hasSettingsFile) {
    setupSettingsUI();
    updateGearPosition();
  }

  // 7. Start Animation Loop
  animate();

  // Trigger startup greeting speech bubble
  setTimeout(() => {
    showSpeechBubble("Hi there! I'm your desktop pet! 🐰✨", 4000);
  }, 1800);

  // Handle Resize
  window.addEventListener('resize', onWindowResize);

  // Listen for Steam achievement updates from main process
  ipcRenderer.on('steam-achievement-unlocked', (event, result) => {
    if (result.success) {
      const achievementsInfo = {
        'ACH_WIN_ONE_GAME': 'First Pet! 🐹',
        'ACH_WIN_100_GAMES': 'Hyperactive Petting! 🚀',
        'ACH_HEAVY_RADAR': 'Configured Companion! ⚙️',
        'ACH_TRAVEL_FAR': 'Healthy Break! 🧘'
      };
      const friendlyName = achievementsInfo[result.name] || result.name;
      showSpeechBubble(`🏆 Steam Achievement Unlocked:\n${friendlyName}`, 5000);
    } else if (result.alreadyUnlocked) {
      console.log(`Achievement already active on Steam: ${result.name}`);
    } else if (!result.isSteamOnline) {
      // Offline mode fallback: show the mock achievement toast
      const achievementsInfo = {
        'ACH_WIN_ONE_GAME': 'First Pet! 🐹',
        'ACH_WIN_100_GAMES': 'Hyperactive Petting! 🚀',
        'ACH_HEAVY_RADAR': 'Configured Companion! ⚙️',
        'ACH_TRAVEL_FAR': 'Healthy Break! 🧘'
      };
      const friendlyName = achievementsInfo[result.name] || result.name;
      showSpeechBubble(`🏆 Achievement Unlocked (Offline):\n${friendlyName}`, 5000);
    }
  });
}

function createMascot() {
  characterGroup = new THREE.Group();
  innerModelGroup = new THREE.Group();
  characterGroup.add(innerModelGroup);

  // Materials configuration
  // Premium, glossy clay/vinyl toy shader
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff7597, // Cute glossy pink
    roughness: 0.15,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    sheen: 1.0,
    sheenColor: 0xffb6c1
  });

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.1
  });

  const eyeHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff
  });

  const blushMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4f7b,
    transparent: true,
    opacity: 0.7
  });

  const innerEarMaterial = new THREE.MeshStandardMaterial({
    color: 0xffa4b9,
    roughness: 0.3
  });

  const footMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff4d72,
    roughness: 0.2,
    metalness: 0.05
  });

  // --- Main Body ---
  // A rounded squashed sphere for a squishy feel
  const bodyGeom = new THREE.SphereGeometry(1.0, 36, 36);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMaterial);
  bodyMesh.scale.set(1.15, 0.95, 1.15);
  bodyMesh.position.y = -0.15;
  innerModelGroup.add(bodyMesh);

  // --- Eyes & Highlights ---
  const eyeGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const highlightGeom = new THREE.SphereGeometry(0.04, 8, 8);

  // Left Eye
  const leftEye = new THREE.Mesh(eyeGeom, eyeMaterial);
  leftEye.position.set(-0.35, 0.05, 0.9);
  
  const leftEyeHighlight1 = new THREE.Mesh(highlightGeom, eyeHighlightMaterial);
  leftEyeHighlight1.position.set(-0.30, 0.11, 0.99);
  innerModelGroup.add(leftEye);
  innerModelGroup.add(leftEyeHighlight1);

  // Right Eye
  const rightEye = new THREE.Mesh(eyeGeom, eyeMaterial);
  rightEye.position.set(0.35, 0.05, 0.9);
  
  const rightEyeHighlight1 = new THREE.Mesh(highlightGeom, eyeHighlightMaterial);
  rightEyeHighlight1.position.set(0.40, 0.11, 0.99);
  innerModelGroup.add(rightEye);
  innerModelGroup.add(rightEyeHighlight1);

  // --- Blush Cheeks ---
  const blushGeom = new THREE.SphereGeometry(0.16, 16, 16);
  
  const leftBlush = new THREE.Mesh(blushGeom, blushMaterial);
  leftBlush.scale.set(1, 0.6, 0.2);
  leftBlush.position.set(-0.55, -0.12, 0.88);
  leftBlush.rotation.set(0.1, 0.3, -0.1);
  innerModelGroup.add(leftBlush);

  const rightBlush = new THREE.Mesh(blushGeom, blushMaterial);
  rightBlush.scale.set(1, 0.6, 0.2);
  rightBlush.position.set(0.55, -0.12, 0.88);
  rightBlush.rotation.set(0.1, -0.3, 0.1);
  innerModelGroup.add(rightBlush);

  // --- Cute Smile ---
  // Torus geometry cut in half to create an upward arc
  const smileGeom = new THREE.TorusGeometry(0.07, 0.02, 8, 24, Math.PI);
  const smileMesh = new THREE.Mesh(smileGeom, eyeMaterial);
  smileMesh.position.set(0, -0.06, 0.99);
  smileMesh.rotation.z = Math.PI; // Invert to make it curve upwards
  innerModelGroup.add(smileMesh);

  // --- Bunny/Cat Ears ---
  const earGeom = new THREE.ConeGeometry(0.2, 0.8, 18);
  
  // Left Ear
  const leftEarGroup = new THREE.Group();
  leftEarGroup.position.set(-0.45, 0.6, 0);
  leftEarGroup.rotation.z = 0.25; // Rotate outwards

  const leftEarOuter = new THREE.Mesh(earGeom, bodyMaterial);
  leftEarOuter.scale.set(1, 1, 0.6); // Squashed front-to-back
  leftEarGroup.add(leftEarOuter);

  const leftEarInner = new THREE.Mesh(earGeom, innerEarMaterial);
  leftEarInner.scale.set(0.7, 0.8, 0.4);
  leftEarInner.position.set(0, -0.05, 0.06);
  leftEarGroup.add(leftEarInner);

  innerModelGroup.add(leftEarGroup);

  // Right Ear
  const rightEarGroup = new THREE.Group();
  rightEarGroup.position.set(0.45, 0.6, 0);
  rightEarGroup.rotation.z = -0.25; // Rotate outwards

  const rightEarOuter = new THREE.Mesh(earGeom, bodyMaterial);
  rightEarOuter.scale.set(1, 1, 0.6);
  rightEarGroup.add(rightEarOuter);

  const rightEarInner = new THREE.Mesh(earGeom, innerEarMaterial);
  rightEarInner.scale.set(0.7, 0.8, 0.4);
  rightEarInner.position.set(0, -0.05, 0.06);
  rightEarGroup.add(rightEarInner);

  innerModelGroup.add(rightEarGroup);

  // --- Feet ---
  const footGeom = new THREE.SphereGeometry(0.22, 16, 16);

  const leftFoot = new THREE.Mesh(footGeom, footMaterial);
  leftFoot.scale.set(1.2, 0.7, 1.2);
  leftFoot.position.set(-0.4, -0.9, 0.2);
  innerModelGroup.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeom, footMaterial);
  rightFoot.scale.set(1.2, 0.7, 1.2);
  rightFoot.position.set(0.4, -0.9, 0.2);
  innerModelGroup.add(rightFoot);

  // Create an invisible simplified box collision proxy matching mascot scale
  const proxyGeom = new THREE.BoxGeometry(1.6, 2.0, 1.6);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  collisionProxy = new THREE.Mesh(proxyGeom, proxyMat);
  collisionProxy.position.set(0, 0, 0);
  innerModelGroup.add(collisionProxy);

  // Tilt character slightly forward towards camera
  characterGroup.rotation.x = 0.08;

  scene.add(characterGroup);
}

function setupInteraction() {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let lastRaycastTime = 0;

  function updateIgnoreMouseState() {
    const shouldFocus = isSettingsOpen || 
                        isMouseOverCharacter || 
                        isMouseOverUI || 
                        isDragging || 
                        isNavigating || 
                        altKeyHeld || 
                        shiftKeyHeld || 
                        ctrlKeyHeld;

    ipcRenderer.send('set-ignore-mouse', !shouldFocus);
  }

  // Track mouse movements to update window ignore-mouse states
  window.addEventListener('mousemove', (event) => {
    // Sync modifiers state from direct mouse movement events
    altKeyHeld = event.altKey;
    shiftKeyHeld = event.shiftKey;
    ctrlKeyHeld = event.ctrlKey;

    // Handle model-centric navigation drag updates
    if (isNavigating) {
      if (innerModelGroup) {
        const deltaX = event.clientX - navStartMouseX;
        const deltaY = event.clientY - navStartMouseY;

        if (navType === 'orbit') {
          innerModelGroup.rotation.y = navStartRotationY + deltaX * 0.01;
          innerModelGroup.rotation.x = navStartRotationX + deltaY * 0.01;
        } else if (navType === 'pan') {
          innerModelGroup.position.x = navStartTranslationX + deltaX * 0.005;
          innerModelGroup.position.y = navStartTranslationY - deltaY * 0.005;
        } else if (navType === 'zoom') {
          const zPos = navStartTranslationZ - deltaY * 0.01;
          innerModelGroup.position.z = Math.max(-10.0, Math.min(4.0, zPos));
        }
      }
      return;
    }

    // If user is dragging the window, we don't recalculate raycast or send ignore-mouse toggles
    if (isDragging) {
      const deltaX = event.screenX - dragStartScreenX;
      const deltaY = event.screenY - dragStartScreenY;
      dragMoveDistance += Math.abs(deltaX) + Math.abs(deltaY);

      dragStartScreenX = event.screenX;
      dragStartScreenY = event.screenY;

      ipcRenderer.send('move-window', { x: deltaX, y: deltaY });
      return;
    }

    // Throttle hover raycast updates under Seamless Performance Mode
    if (currentSettings.mouseOptimize) {
      const now = Date.now();
      if (now - lastRaycastTime < 16) return;
      lastRaycastTime = now;
    }

    // Convert mouse client coordinates to Normalized Device Coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // Raycast against simplified box proxy (Seamless Mode) or recursively through full meshes (Precise Mode)
    let intersects = [];
    if (currentSettings.mouseOptimize && collisionProxy) {
      intersects = raycaster.intersectObject(collisionProxy);
    } else {
      intersects = raycaster.intersectObjects(characterGroup.children, true);
    }

    const raycastHit = (intersects.length > 0);
    if (raycastHit !== isMouseOverCharacter) {
      isMouseOverCharacter = raycastHit;
      document.body.style.cursor = isMouseOverCharacter ? 'pointer' : 'default';
    }
    updateIgnoreMouseState();
  });

  window.addEventListener('mousedown', (event) => {
    if (isSettingsOpen) return;

    altKeyHeld = event.altKey;
    shiftKeyHeld = event.shiftKey;
    ctrlKeyHeld = event.ctrlKey;

    const isMMB = event.button === 1;
    if (isMMB) {
      event.preventDefault(); // Prevent Windows auto-scroll popups
    }

    // Blender MMB mapping rules:
    // - MMB alone ➔ Orbit
    // - Shift + MMB ➔ Pan
    // - Ctrl + MMB ➔ Zoom
    const isOrbit = event.altKey || (isMMB && !event.shiftKey && !event.ctrlKey);
    const isPan = event.shiftKey;
    const isZoom = event.ctrlKey;

    if (isOrbit || isPan || isZoom) {
      if (innerModelGroup) {
        isNavigating = true;
        navType = isOrbit ? 'orbit' : (isPan ? 'pan' : 'zoom');
        navStartMouseX = event.clientX;
        navStartMouseY = event.clientY;
        navStartRotationX = innerModelGroup.rotation.x;
        navStartRotationY = innerModelGroup.rotation.y;
        navStartTranslationX = innerModelGroup.position.x;
        navStartTranslationY = innerModelGroup.position.y;
        navStartTranslationZ = innerModelGroup.position.z;

        document.body.style.cursor = isOrbit ? 'all-scroll' : (isPan ? 'move' : 'zoom-in');
        updateIgnoreMouseState();
      }
      return;
    }

    if (currentSettings.lockPosition) return;
    if (isMouseOverCharacter && event.button === 0) { // Left click
      isDragging = true;
      dragStartScreenX = event.screenX;
      dragStartScreenY = event.screenY;
      dragMoveDistance = 0;
      document.body.style.cursor = 'grabbing';
      updateIgnoreMouseState();
    }
  });

  window.addEventListener('mouseup', (event) => {
    altKeyHeld = event.altKey;
    shiftKeyHeld = event.shiftKey;
    ctrlKeyHeld = event.ctrlKey;

    const isMMB = event.button === 1;
    if (isMMB) {
      event.preventDefault();
    }

    if (isNavigating) {
      isNavigating = false;
      document.body.style.cursor = isMouseOverCharacter ? 'pointer' : 'default';
      updateIgnoreMouseState();
      return;
    }

    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = isMouseOverCharacter ? 'pointer' : 'default';
      updateIgnoreMouseState();

      // Treat small drag movements as a simple click
      if (dragMoveDistance < 8) {
        triggerInteraction();
      }
    }
  });

  // Scroll wheel zooming
  window.addEventListener('wheel', (event) => {
    if (isSettingsOpen) return;
    if (innerModelGroup) {
      const zoomSpeed = -0.002;
      const newZ = innerModelGroup.position.z + event.deltaY * zoomSpeed;
      innerModelGroup.position.z = Math.max(-10.0, Math.min(4.0, newZ));
    }
  }, { passive: true });

  // Double-click holding Alt to reset view
  window.addEventListener('dblclick', (event) => {
    if (isSettingsOpen) return;
    if (event.altKey && innerModelGroup) {
      innerModelGroup.rotation.set(0, 0, 0);
      innerModelGroup.position.set(0, 0, 0);
      showSpeechBubble("View reset! 🔄", 1500);
    }
  });

  // Keyboard modifiers activation mapping for click-through override
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Alt') altKeyHeld = true;
    if (event.key === 'Shift') shiftKeyHeld = true;
    if (event.key === 'Control') ctrlKeyHeld = true;
    updateIgnoreMouseState();

    // Blender emulated orthographic/perspective view hotkeys
    if (!isSettingsOpen && innerModelGroup) {
      const key = event.key;
      if (key === '1') {
        innerModelGroup.rotation.set(0, 0, 0);
        showSpeechBubble("Front View 🐰", 1200);
      } else if (key === '3') {
        innerModelGroup.rotation.set(0, Math.PI / 2, 0);
        showSpeechBubble("Right View ➡️", 1200);
      } else if (key === '7') {
        innerModelGroup.rotation.set(Math.PI / 2, 0, 0);
        showSpeechBubble("Top View ⬇️", 1200);
      } else if (key === '9') {
        innerModelGroup.rotation.y += Math.PI;
        showSpeechBubble("Opposite View 🔄", 1200);
      } else if (key === '.' || key.toLowerCase() === 'f') {
        innerModelGroup.rotation.set(0, 0, 0);
        innerModelGroup.position.set(0, 0, 0);
        showSpeechBubble("Frame Selected / Reset view 🔄", 1500);
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Alt') altKeyHeld = false;
    if (event.key === 'Shift') shiftKeyHeld = false;
    if (event.key === 'Control') ctrlKeyHeld = false;
    updateIgnoreMouseState();
  });

  window.addEventListener('blur', () => {
    isNavigating = false;
    altKeyHeld = false;
    shiftKeyHeld = false;
    ctrlKeyHeld = false;
    document.body.style.cursor = 'default';
    updateIgnoreMouseState();
  });

  // Track UI hover events to prevent click-through on HTML controls
  const gearBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');

  if (gearBtn) {
    gearBtn.addEventListener('mouseenter', () => {
      isMouseOverUI = true;
      updateIgnoreMouseState();
    });
    gearBtn.addEventListener('mouseleave', () => {
      isMouseOverUI = false;
      updateIgnoreMouseState();
    });
  }

  if (settingsPanel) {
    settingsPanel.addEventListener('mouseenter', () => {
      isMouseOverUI = true;
      updateIgnoreMouseState();
    });
    settingsPanel.addEventListener('mouseleave', () => {
      isMouseOverUI = false;
      updateIgnoreMouseState();
    });
  }
}

function showSpeechBubble(text, durationMs = 3000) {
  const bubble = document.getElementById('speech-bubble');
  const textEl = document.getElementById('bubble-text');
  if (!bubble || !textEl) return;
  
  if (speechTimeout) {
    clearTimeout(speechTimeout);
    speechTimeout = null;
  }
  
  textEl.textContent = text;
  bubble.classList.remove('hidden');
  bubble.classList.add('show');
  
  if (durationMs > 0) {
    speechTimeout = setTimeout(() => {
      bubble.classList.remove('show');
      setTimeout(() => {
        if (!bubble.classList.contains('show')) {
          bubble.classList.add('hidden');
        }
      }, 200);
    }, durationMs);
  }
}

function hideSpeechBubble() {
  const bubble = document.getElementById('speech-bubble');
  if (!bubble) return;
  if (speechTimeout) {
    clearTimeout(speechTimeout);
    speechTimeout = null;
  }
  bubble.classList.remove('show');
  setTimeout(() => {
    if (!bubble.classList.contains('show')) {
      bubble.classList.add('hidden');
    }
  }, 200);
}

function triggerInteraction() {
  if (animationState.type === 'interact') return;

  animationState.type = 'interact';
  animationState.startTime = Date.now();

  if (mixer) {
    if (reactAction && idleAction) {
      reactAction.reset();
      idleAction.crossFadeTo(reactAction, 0.15, true);
      reactAction.play();
    } else if (idleAction) {
      idleAction.timeScale = 2.0; // speed up single animation
    }
  }

  const reactions = [
    "Wheee! 🚀",
    "Hold on tight! 🌪️",
    "Double flip! 💫",
    "That tickles! 😄",
    "Look at me! ✨",
    "Yippee! 🎉"
  ];
  const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
  showSpeechBubble(randomReaction, 2000);

  // Increment and trigger achievements
  currentSettings.clickCount = (currentSettings.clickCount || 0) + 1;
  saveSettingsFile();

  if (currentSettings.clickCount === 1) {
    ipcRenderer.send('trigger-steam-achievement', 'ACH_WIN_ONE_GAME');
  }
  if (currentSettings.clickCount === 10) {
    ipcRenderer.send('trigger-steam-achievement', 'ACH_WIN_100_GAMES');
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function getAssetsPath() {
  const exeDir = path.dirname(process.execPath);
  const packagedAssetsPath = path.join(exeDir, 'assets');
  
  if (fs.existsSync(packagedAssetsPath)) {
    return packagedAssetsPath;
  }
  return path.join(process.cwd(), 'assets');
}

function scanForModels() {
  discoveredModels = [];
  const assetsDir = getAssetsPath();
  
  if (!fs.existsSync(assetsDir)) {
    try {
      fs.mkdirSync(assetsDir, { recursive: true });
    } catch (e) {
      console.warn("Could not create assets directory:", e);
    }
  }

  if (fs.existsSync(assetsDir)) {
    try {
      const files = fs.readdirSync(assetsDir);
      files.forEach(file => {
        if (file.endsWith('.glb') || file.endsWith('.gltf')) {
          discoveredModels.push(file);
        }
      });
    } catch (err) {
      console.error('Error scanning models:', err);
    }
  }
}

function detectAndLoadAsset() {
  scanForModels();
  
  if (currentSettings.activeModel === 'procedural') {
    console.log('Active mascot is procedural bunny.');
    createMascot();
    return;
  }
  
  if (currentSettings.activeModel && discoveredModels.includes(currentSettings.activeModel)) {
    const assetsDir = getAssetsPath();
    const fullPath = path.join(assetsDir, currentSettings.activeModel);
    console.log('Loading active model:', fullPath);
    loadCustomModel(fullPath);
    return;
  }
  
  // Fallback if activeModel doesn't exist
  if (discoveredModels.length > 0) {
    currentSettings.activeModel = discoveredModels[0];
    const assetsDir = getAssetsPath();
    const fullPath = path.join(assetsDir, currentSettings.activeModel);
    console.log('Active model not found. Defaulting to first discovered model:', fullPath);
    loadCustomModel(fullPath);
    return;
  }
  
  console.log('No custom asset found. Defaulting to procedural mascot.');
  currentSettings.activeModel = 'procedural';
  createMascot();
}

function fallbackToProcedural() {
  console.log('Falling back to procedural mascot.');
  customModelLoaded = false;
  currentSettings.activeModel = 'procedural';
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  idleAction = null;
  reactAction = null;
  loadedAnimations = [];
  availableAnimations = [];
  if (characterGroup) {
    scene.remove(characterGroup);
  }
  
  // Reset window viewport and camera settings back to defaults
  const defaultSize = 350;
  camera.aspect = 1.0;
  camera.updateProjectionMatrix();
  renderer.setSize(defaultSize, defaultSize);
  camera.position.set(0, 0, 5.5);
  ipcRenderer.send('resize-window', { width: defaultSize, height: defaultSize });
  
  createMascot();
}

function loadCustomModel(filePath) {
  let fileUrl = filePath;
  try {
    fileUrl = pathToFileURL(filePath).href;
  } catch (e) {
    console.warn("Could not convert path to file URL, using raw path:", e);
  }

  // Create an empty group temporarily so other scripts don't fail during loading
  characterGroup = new THREE.Group();
  scene.add(characterGroup);

  try {
    const loader = new GLTFLoader();
    loader.load(fileUrl, (gltf) => {
      // Clear the temporary empty group
      if (characterGroup) scene.remove(characterGroup);

      characterGroup = new THREE.Group();
      scene.add(characterGroup);

      const model = gltf.scene;

      // Center model geometry using bounding box
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Center model geometry relative to characterGroup pivot
      model.position.set(-center.x, -center.y, -center.z);
      
      // Load model at its original size scale (1, 1, 1) without resizing the asset
      const innerGroup = new THREE.Group();
      innerGroup.add(model);
      innerGroup.position.y = 0; // Vertically center inside our group
      
      characterGroup.add(innerGroup);
      innerModelGroup = innerGroup;

      // Create an invisible simplified box collision proxy matching custom model size bounds
      const proxyGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
      const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
      collisionProxy = new THREE.Mesh(proxyGeom, proxyMat);
      collisionProxy.position.set(0, 0, 0);
      innerModelGroup.add(collisionProxy);

      const padding = 1.35;
      const pixelsPerUnit = 175; // Scale mapping (175 screen pixels per Three.js unit)

      if (hasSettingsFile) {
        // Apply manual scaling from settings
        characterGroup.scale.set(currentSettings.scale, currentSettings.scale, currentSettings.scale);

        // Update WebGL viewports to match settings sizes
        camera.aspect = currentSettings.width / currentSettings.height;
        camera.updateProjectionMatrix();
        renderer.setSize(currentSettings.width, currentSettings.height);

        // Position camera Z so the custom scaled model fits comfortably
        const visibleHeight = size.y * currentSettings.scale * padding;
        const zPos = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(0, 0, zPos + ((size.z * currentSettings.scale) / 2));

        // Trigger IPC resize command to adjust the Electron frame
        ipcRenderer.send('resize-window', { width: currentSettings.width, height: currentSettings.height });
      } else {
        characterGroup.scale.set(1, 1, 1);

        // Dynamically calculate the ideal desktop window size in pixels
        let winWidth = Math.round(size.x * pixelsPerUnit * padding);
        let winHeight = Math.round(size.y * pixelsPerUnit * padding);
        
        // Limit bounds to keep it reasonable (min 150px, max 800px)
        winWidth = Math.max(150, Math.min(800, winWidth));
        winHeight = Math.max(150, Math.min(800, winHeight));
        
        // Update WebGL viewports
        camera.aspect = winWidth / winHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(winWidth, winHeight);
        
        // Position camera Z so the original model size fits comfortably
        const visibleHeight = size.y * padding;
        const zPos = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(0, 0, zPos + (size.z / 2));

        // Resize Electron window container
        ipcRenderer.send('resize-window', { width: winWidth, height: winHeight });
      }

      // Load animations
      loadedAnimations = gltf.animations || [];
      availableAnimations = loadedAnimations.map(clip => clip.name || '');
      
      idleAction = null;
      reactAction = null;
      if (loadedAnimations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        applySelectedAnimation();
      }
      
      customModelLoaded = true;
      console.log('Successfully loaded custom model at original scale:', filePath);
    }, undefined, (error) => {
      console.error('Failed to load custom GLB/GLTF model:', error);
      fallbackToProcedural();
    });
  } catch (err) {
    console.error('Synchronous loader crash:', err);
    fallbackToProcedural();
  }
}

function applySelectedAnimation() {
  if (!mixer) return;
  
  mixer.stopAllAction();
  idleAction = null;
  reactAction = null;
  
  if (currentSettings.activeAnimation === 'none') {
    console.log('Animation is set to none (static pose).');
    return;
  }
  
  let targetClip = null;
  
  // 1. Try to find clip by name
  if (currentSettings.activeAnimation !== 'default') {
    targetClip = loadedAnimations.find(clip => clip.name === currentSettings.activeAnimation);
  }
  
  // 2. Fall back to index 0 if not found, or if default
  if (!targetClip && loadedAnimations.length > 0) {
    targetClip = loadedAnimations[0];
  }
  
  if (targetClip) {
    console.log('Playing active animation loop:', targetClip.name);
    idleAction = mixer.clipAction(targetClip);
    idleAction.play();
  }
}

function readSettingsFile() {
  const assetsDir = getAssetsPath();
  const settingsFile = path.join(assetsDir, 'settings');
  const settingsTxtFile = path.join(assetsDir, 'settings.txt');
  
  let filePath = null;
  if (fs.existsSync(settingsFile)) filePath = settingsFile;
  else if (fs.existsSync(settingsTxtFile)) filePath = settingsTxtFile;
  
  // If no settings file exists anywhere on startup, automatically generate a default one
  if (!filePath) {
    filePath = settingsFile;
    if (!fs.existsSync(assetsDir)) {
      try {
        fs.mkdirSync(assetsDir, { recursive: true });
      } catch (e) {
        console.warn("Could not create assets directory:", e);
      }
    }
    try {
      const defaultContent = `width=350
height=350
scale=1.0
bobbing=true
spinX=false
spinY=false
spinZ=false
speedX=1.0
speedY=1.0
speedZ=1.0
gpuOptimize=true
mouseOptimize=true
settingsLeft=false`;
      fs.writeFileSync(filePath, defaultContent, 'utf8');
      console.log('Created default settings file at:', filePath);
    } catch (e) {
      console.error('Error creating default settings file:', e);
    }
  }
  
  if (filePath && fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const lines = data.split('\n');
      lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parts[1].trim();
          if (key === 'width') currentSettings.width = parseInt(val, 10) || 350;
          if (key === 'height') currentSettings.height = parseInt(val, 10) || 350;
          if (key === 'scale') currentSettings.scale = parseFloat(val) || 1.0;
          if (key === 'bobbing') currentSettings.bobbing = (val !== 'false');
          if (key === 'spinX') currentSettings.spinX = (val === 'true');
          if (key === 'spinY') currentSettings.spinY = (val === 'true');
          if (key === 'spinZ') currentSettings.spinZ = (val === 'true');
          if (key === 'speedX') currentSettings.speedX = parseFloat(val) || 1.0;
          if (key === 'speedY') currentSettings.speedY = parseFloat(val) || 1.0;
          if (key === 'speedZ') currentSettings.speedZ = parseFloat(val) || 1.0;
          if (key === 'gpuOptimize') currentSettings.gpuOptimize = (val !== 'false');
          if (key === 'mouseOptimize') currentSettings.mouseOptimize = (val !== 'false');
          if (key === 'settingsLeft') currentSettings.settingsLeft = (val === 'true');
          if (key === 'lockPosition') currentSettings.lockPosition = (val === 'true');
          if (key === 'activeModel') currentSettings.activeModel = val || 'procedural';
          if (key === 'activeAnimation') currentSettings.activeAnimation = val || 'default';
          if (key === 'clickCount') currentSettings.clickCount = parseInt(val, 10) || 0;
          if (key === 'fontSizeScale') currentSettings.fontSizeScale = parseFloat(val) || 1.0;
        }
      });
      return true;
    } catch (e) {
      console.error('Error reading settings file:', e);
    }
  }
  return false;
}

function saveSettingsFile() {
  const assetsDir = getAssetsPath();
  const settingsFile = path.join(assetsDir, 'settings');
  const settingsTxtFile = path.join(assetsDir, 'settings.txt');
  const filePath = fs.existsSync(settingsTxtFile) ? settingsTxtFile : settingsFile;
  
  const content = `width=${currentSettings.width}
height=${currentSettings.height}
scale=${currentSettings.scale}
bobbing=${currentSettings.bobbing}
spinX=${currentSettings.spinX}
spinY=${currentSettings.spinY}
spinZ=${currentSettings.spinZ}
speedX=${currentSettings.speedX}
speedY=${currentSettings.speedY}
speedZ=${currentSettings.speedZ}
gpuOptimize=${currentSettings.gpuOptimize}
mouseOptimize=${currentSettings.mouseOptimize}
settingsLeft=${currentSettings.settingsLeft}
lockPosition=${currentSettings.lockPosition}
activeModel=${currentSettings.activeModel}
activeAnimation=${currentSettings.activeAnimation}
clickCount=${currentSettings.clickCount}
fontSizeScale=${currentSettings.fontSizeScale}`;

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Saved settings to file:', filePath);
  } catch (e) {
    console.error('Error writing settings file:', e);
  }
}

function setupSettingsUI() {
  const gearBtn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  const widthSlider = document.getElementById('win-width');
  const heightSlider = document.getElementById('win-height');
  const scaleSlider = document.getElementById('model-scale');
  const bobbingCheck = document.getElementById('model-bobbing');
  
  const spinXCheck = document.getElementById('spin-x');
  const spinYCheck = document.getElementById('spin-y');
  const spinZCheck = document.getElementById('spin-z');
  
  const speedXSlider = document.getElementById('speed-x');
  const speedYSlider = document.getElementById('speed-y');
  const speedZSlider = document.getElementById('speed-z');
  
  const gpuOptimizeCheck = document.getElementById('gpu-optimize');
  const mouseOptimizeCheck = document.getElementById('mouse-optimize');
  const settingsLeftCheck = document.getElementById('settings-left');
  const lockPositionCheck = document.getElementById('lock-position');
  const modelSelect = document.getElementById('model-select');
  const animSelect = document.getElementById('anim-select');
  
  const valWidth = document.getElementById('val-width');
  const valHeight = document.getElementById('val-height');
  const valScale = document.getElementById('val-scale');
  
  const valSpeedX = document.getElementById('val-speed-x');
  const valSpeedY = document.getElementById('val-speed-y');
  const valSpeedZ = document.getElementById('val-speed-z');
  
  const fontScaleSlider = document.getElementById('font-scale');
  const valFontScale = document.getElementById('val-font-scale');

  // Make gear button visible
  gearBtn.style.display = 'flex';

  // Configure slider limits dynamically based on current screen size
  widthSlider.max = window.screen.width;
  heightSlider.max = window.screen.height;

  // Function to populate model select dropdown options
  const populateModelDropdown = () => {
    scanForModels();
    modelSelect.innerHTML = '<option value="procedural">Procedural Mascot (Pink Bunny)</option>';
    discoveredModels.forEach(modelFile => {
      const option = document.createElement('option');
      option.value = modelFile;
      option.textContent = modelFile;
      modelSelect.appendChild(option);
    });
  };

  const populateAnimationDropdown = () => {
    const container = document.getElementById('anim-select-container');
    if (!animSelect) return;
    
    if (modelSelect.value === 'procedural') {
      animSelect.innerHTML = '<option value="none">Procedural (Default Loop)</option>';
      animSelect.disabled = true;
      if (container) container.style.opacity = '0.5';
      return;
    }
    
    animSelect.disabled = false;
    if (container) container.style.opacity = '1.0';
    
    animSelect.innerHTML = '<option value="none">None (Static Pose)</option>';
    
    availableAnimations.forEach((clipName, idx) => {
      const option = document.createElement('option');
      const val = clipName || String(idx);
      option.value = val;
      option.textContent = clipName ? `${idx + 1}. ${clipName}` : `Animation ${idx + 1}`;
      animSelect.appendChild(option);
    });
    
    if (currentSettings.activeAnimation === 'default') {
      if (availableAnimations.length > 0) {
        animSelect.value = availableAnimations[0] || '0';
      } else {
        animSelect.value = 'none';
      }
    } else {
      const exists = availableAnimations.includes(currentSettings.activeAnimation);
      if (exists) {
        animSelect.value = currentSettings.activeAnimation;
      } else {
        animSelect.value = 'none';
      }
    }
  };

  populateModelDropdown();

  // Sync sliders UI with the saved settings
  const syncSlidersUI = () => {
    widthSlider.value = currentSettings.width;
    heightSlider.value = currentSettings.height;
    scaleSlider.value = currentSettings.scale;
    bobbingCheck.checked = currentSettings.bobbing;
    
    spinXCheck.checked = currentSettings.spinX;
    spinYCheck.checked = currentSettings.spinY;
    spinZCheck.checked = currentSettings.spinZ;

    speedXSlider.value = currentSettings.speedX;
    speedYSlider.value = currentSettings.speedY;
    speedZSlider.value = currentSettings.speedZ;
    
    gpuOptimizeCheck.checked = currentSettings.gpuOptimize;
    mouseOptimizeCheck.checked = currentSettings.mouseOptimize;
    settingsLeftCheck.checked = currentSettings.settingsLeft;
    lockPositionCheck.checked = currentSettings.lockPosition;
    modelSelect.value = currentSettings.activeModel;
    populateAnimationDropdown();

    valWidth.innerText = currentSettings.width;
    valHeight.innerText = currentSettings.height;
    valScale.innerText = currentSettings.scale.toFixed(2);
    
    valSpeedX.innerText = currentSettings.speedX.toFixed(1);
    valSpeedY.innerText = currentSettings.speedY.toFixed(1);
    valSpeedZ.innerText = currentSettings.speedZ.toFixed(1);

    if (fontScaleSlider) {
      fontScaleSlider.value = currentSettings.fontSizeScale;
      valFontScale.innerText = currentSettings.fontSizeScale.toFixed(2);
    }
    if (panel) {
      panel.style.setProperty('--panel-font-scale', currentSettings.fontSizeScale);
    }
  };

  syncSlidersUI();

  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === 'procedural') {
      populateAnimationDropdown();
    } else {
      animSelect.innerHTML = '<option value="default">Default (Load on Save)</option>';
      animSelect.disabled = true;
      const container = document.getElementById('anim-select-container');
      if (container) container.style.opacity = '0.7';
    }
  });

  // Listeners that only update the numerical labels live (does not resize window yet)
  widthSlider.addEventListener('input', () => {
    valWidth.innerText = widthSlider.value;
  });
  heightSlider.addEventListener('input', () => {
    valHeight.innerText = heightSlider.value;
  });
  scaleSlider.addEventListener('input', () => {
    valScale.innerText = parseFloat(scaleSlider.value).toFixed(2);
  });
  speedXSlider.addEventListener('input', () => {
    valSpeedX.innerText = parseFloat(speedXSlider.value).toFixed(1);
  });
  speedYSlider.addEventListener('input', () => {
    valSpeedY.innerText = parseFloat(speedYSlider.value).toFixed(1);
  });
  speedZSlider.addEventListener('input', () => {
    valSpeedZ.innerText = parseFloat(speedZSlider.value).toFixed(1);
  });
  
  if (fontScaleSlider) {
    fontScaleSlider.addEventListener('input', () => {
      const scale = parseFloat(fontScaleSlider.value);
      valFontScale.innerText = scale.toFixed(2);
      if (panel) {
        panel.style.setProperty('--panel-font-scale', scale);
      }
    });
  }

  // Toggle panel controls (expand or close) to prevent locked window loops
  gearBtn.addEventListener('click', () => {
    if (isSettingsOpen) {
      syncSlidersUI();
      closeSettings();
    } else {
      isSettingsOpen = true;
      populateModelDropdown();
      syncSlidersUI(); // Ensure sliders match actual current saved settings
      panel.classList.remove('hidden');
      ipcRenderer.send('set-ignore-mouse', false);
    }
  });

  const closeSettings = () => {
    isSettingsOpen = false;
    panel.classList.add('hidden');
    ipcRenderer.send('set-ignore-mouse', true);
  };

  // Revert back to original saved settings if closed without saving
  document.getElementById('close-btn').addEventListener('click', () => {
    syncSlidersUI();
    closeSettings();
  });

  // Apply changes only when user clicks "Save Settings"
  document.getElementById('save-btn').addEventListener('click', () => {
    // 1. Update saved settings state
    currentSettings.width = parseInt(widthSlider.value, 10);
    currentSettings.height = parseInt(heightSlider.value, 10);
    currentSettings.scale = parseFloat(scaleSlider.value);
    currentSettings.bobbing = bobbingCheck.checked;
    
    currentSettings.spinX = spinXCheck.checked;
    currentSettings.spinY = spinYCheck.checked;
    currentSettings.spinZ = spinZCheck.checked;
    
    currentSettings.speedX = parseFloat(speedXSlider.value);
    currentSettings.speedY = parseFloat(speedYSlider.value);
    currentSettings.speedZ = parseFloat(speedZSlider.value);
    
    currentSettings.gpuOptimize = gpuOptimizeCheck.checked;
    currentSettings.mouseOptimize = mouseOptimizeCheck.checked;
    currentSettings.settingsLeft = settingsLeftCheck.checked;
    currentSettings.lockPosition = lockPositionCheck.checked;

    const oldModel = currentSettings.activeModel;
    const newModel = modelSelect.value;
    const modelChanged = (oldModel !== newModel);
    currentSettings.activeModel = newModel;

    if (animSelect) {
      currentSettings.activeAnimation = animSelect.value;
    }

    if (fontScaleSlider) {
      currentSettings.fontSizeScale = parseFloat(fontScaleSlider.value);
    }

    // 2. Save settings to local configuration file
    saveSettingsFile();

    // Trigger settings configuration achievement
    ipcRenderer.send('trigger-steam-achievement', 'ACH_HEAVY_RADAR');

    // Handle model load when changed
    if (modelChanged) {
      if (mixer) {
        mixer.stopAllAction();
        mixer = null;
      }
      idleAction = null;
      reactAction = null;
      loadedAnimations = [];
      availableAnimations = [];
      if (characterGroup) {
        scene.remove(characterGroup);
      }
      customModelLoaded = false;
      
      if (newModel === 'procedural') {
        fallbackToProcedural();
      } else {
        const assetsDir = getAssetsPath();
        const fullPath = path.join(assetsDir, newModel);
        console.log('Swapping active mascot model to:', fullPath);
        loadCustomModel(fullPath);
      }
    } else {
      applySelectedAnimation();
    }

    // Apply position shift to the gear button
    updateGearPosition();

    // 3. Apply changes to WebGL viewport size and camera aspect
    camera.aspect = currentSettings.width / currentSettings.height;
    camera.updateProjectionMatrix();
    renderer.setSize(currentSettings.width, currentSettings.height);

    // 4. Update character scale
    if (characterGroup) {
      characterGroup.scale.set(currentSettings.scale, currentSettings.scale, currentSettings.scale);
      
      // Update camera distance Z for custom models so they still fit nicely in the resized window
      if (customModelLoaded) {
        // Query the loaded model's size
        const innerModel = characterGroup.children[0];
        if (innerModel) {
          const box = new THREE.Box3().setFromObject(innerModel);
          const size = box.getSize(new THREE.Vector3());
          
          const padding = 1.35;
          const visibleHeight = size.y * currentSettings.scale * padding;
          const zPos = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
          camera.position.set(0, 0, zPos + ((size.z * currentSettings.scale) / 2));
        }
      }
    }

    // 5. Apply the window resize to the Electron container
    ipcRenderer.send('resize-window', { width: currentSettings.width, height: currentSettings.height });

    closeSettings();
  });

  // Hover overrides to prevent mouse click-through when interacting with setting controls
  const disableClickThrough = () => {
    ipcRenderer.send('set-ignore-mouse', false);
  };

  gearBtn.addEventListener('mouseenter', disableClickThrough);
  panel.addEventListener('mouseenter', disableClickThrough);
}

const idleThoughts = [
  "Is it time for coffee yet? ☕",
  "Just floating around... ☁️",
  "You're doing amazing! Keep it up! ✨",
  "I love floating here with you! 😊",
  "Need a break soon? 🧘",
  "What a beautiful day! 🌸",
  "La la la~ 🎶",
  "Let's stay focused! 💻"
];

const breakReminders = [
  "Time for a quick water break! 💧 Stay hydrated!",
  "Posture check! Roll your shoulders and sit up straight! 🧘",
  "Give your eyes a 20-second break! Look 20 feet away! 👀",
  "Let's stand up and stretch for a minute! 🤸"
];

function checkIdleThoughts(now) {
  if (now - lastIdleThoughtTime > 75000) {
    lastIdleThoughtTime = now;
    if (!isSettingsOpen && animationState.type !== 'interact') {
      const thought = idleThoughts[Math.floor(Math.random() * idleThoughts.length)];
      showSpeechBubble(thought, 4500);
    }
  }
}

function checkBreakReminders(now) {
  if (now - lastBreakReminderTime > 1200 * 1000) {
    lastBreakReminderTime = now;
    if (!isSettingsOpen && animationState.type !== 'interact') {
      const reminder = breakReminders[Math.floor(Math.random() * breakReminders.length)];
      showSpeechBubble(reminder, 7000);
      ipcRenderer.send('trigger-steam-achievement', 'ACH_TRAVEL_FAR');
    }
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  const now = Date.now();

  checkIdleThoughts(now);
  checkBreakReminders(now);

  // Update skeletal animation if active
  if (mixer) {
    mixer.update(delta);
  }

  // Handle continuous axis spinning if enabled (applies to innerModelGroup)
  if (innerModelGroup) {
    if (currentSettings.spinX) {
      innerModelGroup.rotation.x += delta * currentSettings.speedX;
    }
    if (currentSettings.spinY) {
      innerModelGroup.rotation.y += delta * currentSettings.speedY;
    }
    if (currentSettings.spinZ) {
      innerModelGroup.rotation.z += delta * currentSettings.speedZ;
    }
  }

  if (animationState.type === 'interact') {
    const progress = (now - animationState.startTime) / animationState.duration;

    if (progress >= 1.0) {
      // Revert back to idle
      animationState.type = 'idle';
      characterGroup.position.set(0, 0, 0);
      characterGroup.rotation.set(0.08, 0, 0);
      const targetScale = hasSettingsFile ? currentSettings.scale : 1.0;
      characterGroup.scale.set(targetScale, targetScale, targetScale);

      if (mixer) {
        if (reactAction && idleAction) {
          idleAction.reset();
          reactAction.crossFadeTo(idleAction, 0.2, true);
          idleAction.play();
        } else if (idleAction) {
          idleAction.timeScale = 1.0; // reset single animation speed
        }
      }
    } else {
      if (customModelLoaded) {
        // Keep idle floating/bobbing up and down for custom model during interaction state
        if (currentSettings.bobbing) {
          characterGroup.position.y = Math.sin(elapsed * 1.5) * 0.12;
          characterGroup.rotation.z = Math.sin(elapsed * 0.8) * 0.025;
          characterGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.04;
        } else {
          characterGroup.position.y = 0;
          characterGroup.rotation.z = 0;
          characterGroup.rotation.y = 0;
        }
      } else {
        // Interaction Animation: High Jump & 360 Spin (Procedural Mascot Only)
        const height = Math.sin(progress * Math.PI) * 1.3;
        characterGroup.position.y = height;

        // 360-degree spin
        characterGroup.rotation.y = progress * Math.PI * 2;

        // Squash and stretch transitions relative to base scale
        const baseScale = hasSettingsFile ? currentSettings.scale : 1.0;
        if (progress < 0.2) {
          characterGroup.scale.set(baseScale * 1.15, baseScale * 0.8, baseScale * 1.15);
        } else if (progress < 0.8) {
          characterGroup.scale.set(baseScale * 0.9, baseScale * 1.2, baseScale * 0.9);
        } else {
          const factor = (progress - 0.8) / 0.2;
          const squashY = 0.75 + (factor * 0.25);
          const stretchXZ = 1.2 - (factor * 0.2);
          characterGroup.scale.set(baseScale * stretchXZ, baseScale * squashY, baseScale * stretchXZ);
        }
      }
    }
  } else {
    // --- Idle Animation ---
    if (!customModelLoaded) {
      // Smooth breathing for procedural mascot relative to base scale
      const baseScale = hasSettingsFile ? currentSettings.scale : 1.0;
      const breatheSpeed = 2.5;
      const breatheFactor = Math.sin(elapsed * breatheSpeed);
      characterGroup.scale.y = baseScale * (1.0 + breatheFactor * 0.04);
      characterGroup.scale.x = baseScale * (1.0 - breatheFactor * 0.02);
      characterGroup.scale.z = baseScale * (1.0 - breatheFactor * 0.02);
    }

    // Smooth floating/bobbing up and down (applies to both custom and procedural if enabled)
    if (currentSettings.bobbing) {
      characterGroup.position.y = Math.sin(elapsed * 1.5) * 0.12;
      characterGroup.rotation.z = Math.sin(elapsed * 0.8) * 0.025;
      characterGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.04;
    } else {
      characterGroup.position.y = 0;
      characterGroup.rotation.z = 0;
      characterGroup.rotation.y = 0;
    }
  }

  renderer.render(scene, camera);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
