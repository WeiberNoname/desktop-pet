import * as THREE from 'three';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { initI18n, t, changeLanguage, getCurrentLanguage } from './i18nManager.js';

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
  viewOnly: false,
  activeModel: 'procedural',
  activeAnimation: 'default',
  clickCount: 0,
  fontSizeScale: 1.0,
  language: 'en'
};

let discoveredModels = [];

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
let wasConfigHealed = false;
let isSettingsOpen = false;
let isMouseOverCharacter = false;
let isMouseOverUI = false;
let isDragging = false;
let dragStartedOnMascot = false;
let isDraggingGear = false;
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

async function init() {
  const container = document.getElementById('container');

  // Query if application is running in developer mode
  const isDevMode = ipcRenderer.sendSync('is-dev-mode');
  if (isDevMode) {
    document.body.classList.add('dev-mode');
  }
  
  // Load settings configuration file if it exists in assets/
  hasSettingsFile = readSettingsFile();

  // Initialize i18next multi-language framework
  await initI18n(currentSettings.language);

  const settingsPanel = document.getElementById('settings-panel');
  if (settingsPanel && currentSettings.fontSizeScale) {
    settingsPanel.style.setProperty('--panel-font-scale', currentSettings.fontSizeScale);
  }

  // 1. Create Scene
  scene = new THREE.Scene();

  // 2. Create Camera
  // Using PerspectiveCamera, centered on origin
  const initialWidth = container.clientWidth || (window.innerWidth - 20);
  const initialHeight = container.clientHeight || (window.innerHeight - 20);
  camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 100);
  camera.position.set(0, 0, 5.5);

  // 3. Create Renderer with full transparency
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(initialWidth, initialHeight);
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

  // 6.7. Start background generator for missing previews
  startBackgroundPreviewGenerator();

  // 7. Start Animation Loop
  animate();

  if (wasConfigHealed) {
    ipcRenderer.send('log-diagnostic', '[Config Recovery] Default settings restored due to config file issue.');
  }

  // Handle Resize
  window.addEventListener('resize', onWindowResize);

  // Listen for Steam achievement updates from main process
  ipcRenderer.on('steam-achievement-unlocked', (event, result) => {
    if (result.success) {
      const achievementsInfo = {
        'NEW_ACHIEVEMENT_1_0': 'Rookie (L1) 🏅',
        'ACH_WIN_ONE_GAME': 'First Pet! 🐹',
        'ACH_WIN_100_GAMES': 'Hyperactive Petting! 🚀',
        'ACH_HEAVY_RADAR': 'Configured Companion! ⚙️',
        'ACH_TRAVEL_FAR': 'Healthy Break! 🧘',
        'ACH_FIRST_STEPS': 'First Steps! 🐾'
      };
      const friendlyName = achievementsInfo[result.name] || result.name;
      showSpeechBubble(`🏆 Steam Achievement Unlocked:\n${friendlyName}`, 5000);
    } else if (result.alreadyUnlocked) {
      console.log(`Achievement already active on Steam: ${result.name}`);
    } else if (!result.isSteamOnline) {
      // Offline mode fallback: show the mock achievement toast
      const achievementsInfo = {
        'NEW_ACHIEVEMENT_1_0': 'Rookie (L1) 🏅',
        'ACH_WIN_ONE_GAME': 'First Pet! 🐹',
        'ACH_WIN_100_GAMES': 'Hyperactive Petting! 🚀',
        'ACH_HEAVY_RADAR': 'Configured Companion! ⚙️',
        'ACH_TRAVEL_FAR': 'Healthy Break! 🧘',
        'ACH_FIRST_STEPS': 'First Steps! 🐾'
      };
      const friendlyName = achievementsInfo[result.name] || result.name;
      showSpeechBubble(`🏆 Achievement Unlocked (Offline):\n${friendlyName}`, 5000);
    }
  });

  // Listen for Steam overlay activation from main process
  ipcRenderer.on('steam-overlay-active', (event, active) => {
    if (active) {
      document.body.classList.add('steam-overlay-active');
    } else {
      document.body.classList.remove('steam-overlay-active');
    }
  });

  // Listen for forced hover exit requests from main process (active polling boundary safety)
  ipcRenderer.on('force-hover-exit', () => {
    if (isMouseOverCharacter) {
      isMouseOverCharacter = false;
      document.body.style.cursor = 'default';
      updateIgnoreMouseState();
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

  // Generate preview thumbnail if missing
  setTimeout(() => {
    generateModelPreview('procedural');
  }, 150);
}

function setupInteraction() {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let lastRaycastTime = 0;

  function updateIgnoreMouseState() {
    const isHoveringMascot = isMouseOverCharacter && !isSettingsOpen;
    const isViewOnlyActive = currentSettings.viewOnly && isHoveringMascot;

    // Apply smooth hover transparency transition if view-only is enabled
    const container = document.getElementById('container');
    if (container) {
      if (isViewOnlyActive) {
        container.style.opacity = '0.0';
        container.style.transition = 'opacity 0.2s ease';
      } else {
        container.style.opacity = '1.0';
        container.style.transition = 'opacity 0.2s ease';
      }
    }

    const bubble = document.getElementById('speech-bubble');
    if (bubble) {
      if (isViewOnlyActive) {
        bubble.style.opacity = '0.0';
        bubble.style.transition = 'opacity 0.2s ease';
      } else {
        bubble.style.opacity = '1.0';
        bubble.style.transition = 'opacity 0.2s ease';
      }
    }

    // When View-Only Mode is active on hover, ignore mouse focus so clicks pass through
    const effectiveHover = isMouseOverCharacter && !isViewOnlyActive;

    const shouldFocus = isSettingsOpen || 
                        effectiveHover || 
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

    // If the event target is not the rendering canvas, treat it as a hover exit.
    // This handles both out-of-bounds coordinates and the 10px transparent container padding zone.
    if (event.target.tagName !== 'CANVAS') {
      if (isMouseOverCharacter) {
        isMouseOverCharacter = false;
        document.body.style.cursor = 'default';
        updateIgnoreMouseState();
      }
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

  // Reset character hover state and restore window interactivity when the cursor leaves the viewport
  window.addEventListener('mouseleave', () => {
    if (isMouseOverCharacter) {
      isMouseOverCharacter = false;
      document.body.style.cursor = 'default';
      updateIgnoreMouseState();
    }
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
    if (event.button === 0) { // Left click
      const gearBtn = document.getElementById('settings-btn');
      const settingsPanel = document.getElementById('settings-panel');
      
      const isClickOnGear = gearBtn && gearBtn.contains(event.target);
      const isClickOnPanel = settingsPanel && settingsPanel.contains(event.target);
      const isClickOnInteractive = event.target.closest('input, select, button, textarea');
      
      const shouldDrag = isMouseOverCharacter || 
                         isClickOnGear || 
                         (isClickOnPanel && !isClickOnInteractive);
                         
      if (shouldDrag) {
        isDragging = true;
        dragStartScreenX = event.screenX;
        dragStartScreenY = event.screenY;
        dragMoveDistance = 0;
        document.body.style.cursor = 'grabbing';
        
        dragStartedOnMascot = isMouseOverCharacter;
        isDraggingGear = isClickOnGear;
        
        updateIgnoreMouseState();
      }
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

      // Treat small drag movements as a simple click on the mascot
      if (dragMoveDistance < 8 && dragStartedOnMascot) {
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

    // Ctrl + V shortcut to toggle View Only Mode
    const isCtrlV = event.ctrlKey && (event.key === 'v' || event.key === 'V');
    if (isCtrlV) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (!isTyping) {
        event.preventDefault();
        currentSettings.viewOnly = !currentSettings.viewOnly;
        
        // Sync setting checkbox in UI
        const viewOnlyCheck = document.getElementById('view-only');
        if (viewOnlyCheck) {
          viewOnlyCheck.checked = currentSettings.viewOnly;
        }
        
        saveSettingsFile();
        updateIgnoreMouseState();
        
        showSpeechBubble(currentSettings.viewOnly ? "View Only Mode: Enabled 👁️" : "View Only Mode: Disabled 🐰", 2500);
      }
    }

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

  // Handle file drag-and-drop over the Electron window
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    // Temporarily disable click-through when dragging a file over the window so drop works anywhere
    ipcRenderer.send('set-ignore-mouse', false);
  });

  window.addEventListener('dragleave', () => {
    // Restore normal ignore-mouse status when drag leaves
    updateIgnoreMouseState();
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    updateIgnoreMouseState();

    const files = event.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const isGlb = file.name.endsWith('.glb');
    const isGltf = file.name.endsWith('.gltf');
    if (!isGlb && !isGltf) {
      showSpeechBubble("Please drop a .glb or .gltf model file! 🐹", 3000);
      return;
    }

    const localFilePath = file.path;
    if (!localFilePath) {
      showSpeechBubble("Could not read file path 😢", 3000);
      return;
    }

    const assetsDir = getAssetsPath();
    const fileName = path.basename(localFilePath);
    const destPath = path.join(assetsDir, fileName);

    try {
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      fs.copyFileSync(localFilePath, destPath);
    } catch (e) {
      console.error("Failed to copy dropped file:", e);
      showSpeechBubble("Failed to import model 😢", 3000);
      return;
    }

    showSpeechBubble(`Imported mascot:\n${fileName} 🎉`, 4000);
    ipcRenderer.send('trigger-steam-achievement', 'ACH_FIRST_STEPS');

    // Load the dropped mascot model
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

    currentSettings.activeModel = fileName;
    currentSettings.activeAnimation = 'default';
    saveSettingsFile();

    const modelSelect = document.getElementById('model-select');
    if (modelSelect) {
      populateModelDropdown();
      modelSelect.value = fileName;
    }

    loadCustomModel(destPath);
  });
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
  const container = document.getElementById('container');
  if (container) {
    const w = container.clientWidth || (window.innerWidth - 20);
    const h = container.clientHeight || (window.innerHeight - 20);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
}

function getAssetsPath() {
  return ipcRenderer.sendSync('get-assets-path');
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
      
      const padding = 1.35;

      // Load model at its original size scale (1, 1, 1) without resizing the asset
      const innerGroup = new THREE.Group();
      innerGroup.add(model);
      
      // Auto-grounding: align model base/feet to the bottom viewport boundary
      innerGroup.position.y = - size.y * (padding - 1) / 2;
      
      characterGroup.add(innerGroup);
      innerModelGroup = innerGroup;

      // Create an invisible simplified box collision proxy matching custom model size bounds
      const proxyGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
      const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
      collisionProxy = new THREE.Mesh(proxyGeom, proxyMat);
      collisionProxy.position.set(0, 0, 0);
      innerModelGroup.add(collisionProxy);

      const pixelsPerUnit = 175; // Scale mapping (175 screen pixels per Three.js unit)

      if (hasSettingsFile) {
        // Apply manual scaling from settings
        characterGroup.scale.set(currentSettings.scale, currentSettings.scale, currentSettings.scale);

        // Update WebGL viewports to match settings sizes
        const targetW = currentSettings.width - 20;
        const targetH = currentSettings.height - 20;
        camera.aspect = targetW / targetH;
        camera.updateProjectionMatrix();
        renderer.setSize(targetW, targetH);

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
        const targetW = winWidth - 20;
        const targetH = winHeight - 20;
        camera.aspect = targetW / targetH;
        camera.updateProjectionMatrix();
        renderer.setSize(targetW, targetH);
        
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

      // Generate thumbnail preview of the custom model
      const fileName = path.basename(filePath);
      setTimeout(() => {
        generateModelPreview(fileName);
      }, 150);
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
  
  // 2. Auto-detect/identify if "default" is selected or targetClip not found
  if (!targetClip && loadedAnimations.length > 0) {
    // Find idle clip using keyword matching
    const idleKeywords = ['idle', 'stay', 'breathe', 'stand', 'look', 'loop', 'default'];
    targetClip = loadedAnimations.find(clip => {
      const name = clip.name.toLowerCase();
      return idleKeywords.some(keyword => name.includes(keyword));
    });
    // Fallback to first clip if no idle keyword matched
    if (!targetClip) {
      targetClip = loadedAnimations[0];
    }
  }
  
  // Auto-detect reaction/interact clip using keyword matching
  if (loadedAnimations.length > 1) {
    const reactKeywords = ['jump', 'spin', 'click', 'react', 'interact', 'pet', 'wave', 'dance', 'happy'];
    const reactClip = loadedAnimations.find(clip => {
      const name = clip.name.toLowerCase();
      return reactKeywords.some(keyword => name.includes(keyword)) && clip !== targetClip;
    });
    if (reactClip) {
      reactAction = mixer.clipAction(reactClip);
      reactAction.setLoop(THREE.LoopOnce);
      reactAction.clampWhenFinished = true;
      console.log('Auto-detected reaction animation:', reactClip.name);
    }
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
settingsLeft=false
lockPosition=false
viewOnly=false
activeModel=procedural
activeAnimation=default
clickCount=0
fontSizeScale=1.0
language=en`;

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
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, defaultContent, 'utf8');
      fs.renameSync(tmpPath, filePath);
      console.log('Created default settings file at:', filePath);
    } catch (e) {
      console.error('Error creating default settings file:', e);
    }
  }
  
  if (filePath && fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      if (!data || data.trim() === '') {
        throw new Error('Settings file is empty');
      }
      const lines = data.split('\n');
      let validKeysParsed = 0;
      lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parts[1].trim();
          if (key === 'width') { currentSettings.width = parseInt(val, 10) || 350; validKeysParsed++; }
          if (key === 'height') { currentSettings.height = parseInt(val, 10) || 350; validKeysParsed++; }
          if (key === 'scale') { currentSettings.scale = parseFloat(val) || 1.0; validKeysParsed++; }
          if (key === 'bobbing') { currentSettings.bobbing = (val !== 'false'); validKeysParsed++; }
          if (key === 'spinX') { currentSettings.spinX = (val === 'true'); validKeysParsed++; }
          if (key === 'spinY') { currentSettings.spinY = (val === 'true'); validKeysParsed++; }
          if (key === 'spinZ') { currentSettings.spinZ = (val === 'true'); validKeysParsed++; }
          if (key === 'speedX') { currentSettings.speedX = parseFloat(val) || 1.0; validKeysParsed++; }
          if (key === 'speedY') { currentSettings.speedY = parseFloat(val) || 1.0; validKeysParsed++; }
          if (key === 'speedZ') { currentSettings.speedZ = parseFloat(val) || 1.0; validKeysParsed++; }
          if (key === 'gpuOptimize') { currentSettings.gpuOptimize = (val !== 'false'); validKeysParsed++; }
          if (key === 'mouseOptimize') { currentSettings.mouseOptimize = (val !== 'false'); validKeysParsed++; }
          if (key === 'settingsLeft') { currentSettings.settingsLeft = (val === 'true'); validKeysParsed++; }
          if (key === 'lockPosition') { currentSettings.lockPosition = (val === 'true'); validKeysParsed++; }
          if (key === 'viewOnly') { currentSettings.viewOnly = (val === 'true'); validKeysParsed++; }
          if (key === 'activeModel') { currentSettings.activeModel = val || 'procedural'; validKeysParsed++; }
          if (key === 'activeAnimation') { currentSettings.activeAnimation = val || 'default'; validKeysParsed++; }
          if (key === 'clickCount') { currentSettings.clickCount = parseInt(val, 10) || 0; validKeysParsed++; }
          if (key === 'fontSizeScale') { currentSettings.fontSizeScale = parseFloat(val) || 1.0; validKeysParsed++; }
          if (key === 'language') { currentSettings.language = val || 'en'; validKeysParsed++; }
        }
      });
      if (validKeysParsed === 0) {
        throw new Error('No valid keys could be parsed from settings file');
      }
      return true;
    } catch (e) {
      console.error('Error reading/parsing settings file. Resetting to defaults:', e);
      wasConfigHealed = true;
      ipcRenderer.send('log-diagnostic', `[Config Recovery] Settings file corrupted/empty: ${e.message || e}. Restoring factory defaults and rewriting file.`);
      
      // Reset to safe default settings in memory
      currentSettings.width = 350;
      currentSettings.height = 350;
      currentSettings.scale = 1.0;
      currentSettings.bobbing = true;
      currentSettings.spinX = false;
      currentSettings.spinY = false;
      currentSettings.spinZ = false;
      currentSettings.speedX = 1.0;
      currentSettings.speedY = 1.0;
      currentSettings.speedZ = 1.0;
      currentSettings.gpuOptimize = true;
      currentSettings.mouseOptimize = true;
      currentSettings.settingsLeft = false;
      currentSettings.lockPosition = false;
      currentSettings.viewOnly = false;
      currentSettings.activeModel = 'procedural';
      currentSettings.activeAnimation = 'default';
      currentSettings.clickCount = 0;
      currentSettings.fontSizeScale = 1.0;
      currentSettings.language = 'en';
      
      // Attempt recovery write
      try {
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, defaultContent, 'utf8');
        fs.renameSync(tmpPath, filePath);
        console.log('Successfully recovered and rewrote settings file from defaults');
      } catch (err) {
        console.error('Failed to write recovery settings file:', err);
      }
      return true;
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
viewOnly=${currentSettings.viewOnly}
activeModel=${currentSettings.activeModel}
activeAnimation=${currentSettings.activeAnimation}
clickCount=${currentSettings.clickCount}
fontSizeScale=${currentSettings.fontSizeScale}
language=${currentSettings.language}`;

  try {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
    console.log('Saved settings atomically to file:', filePath);
  } catch (e) {
    console.error('Error writing settings file atomically:', e);
  }
}

function generateModelPreview(modelKey) {
  const assetsDir = getAssetsPath();
  const previewsDir = path.join(assetsDir, '.previews');
  if (!fs.existsSync(previewsDir)) {
    try {
      fs.mkdirSync(previewsDir, { recursive: true });
    } catch (e) {
      console.warn("Could not create previews directory:", e);
    }
  }
  const previewPath = path.join(previewsDir, `${modelKey}.png`);
  
  if (fs.existsSync(previewPath)) return;

  // Render a frame synchronously onto the canvas back buffer so it's fully painted
  renderer.render(scene, camera);
  
  try {
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(previewPath, base64Data, 'base64');
    console.log(`Generated thumbnail preview for: ${modelKey}`);
    
    // Refresh settings grid view if open
    populateModelDropdown();
  } catch (e) {
    console.warn("Failed to save model preview thumbnail:", e);
  }
}

function populateModelDropdown() {
  scanForModels();
  const gridContainer = document.getElementById('model-select-grid');
  const modelSelect = document.getElementById('model-select');
  if (!gridContainer || !modelSelect) return;
  
  gridContainer.innerHTML = '';
  
  const options = ['procedural', ...discoveredModels];
  const assetsDir = getAssetsPath();
  
  options.forEach(modelKey => {
    const card = document.createElement('div');
    card.className = 'mascot-card';
    if (currentSettings.activeModel === modelKey) {
      card.classList.add('selected');
    }
    
    const img = document.createElement('img');
    img.className = 'mascot-thumbnail';
    img.dataset.mascot = modelKey; // Bind dataset key for targeted dynamic updates
    
    const previewPath = path.join(assetsDir, '.previews', `${modelKey}.png`);
    if (fs.existsSync(previewPath)) {
      img.src = pathToFileURL(previewPath).href + "?t=" + Date.now();
    } else {
      img.src = './assets/bunny_icon.png';
    }
    
    const label = document.createElement('div');
    label.className = 'mascot-card-label';
    label.textContent = modelKey === 'procedural' ? 'Pink Bunny' : modelKey.replace(/\.(glb|gltf)$/i, '');
    
    card.appendChild(img);
    card.appendChild(label);
    
    card.addEventListener('click', () => {
      gridContainer.querySelectorAll('.mascot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      modelSelect.value = modelKey;
      modelSelect.dispatchEvent(new Event('change'));
    });
    
    gridContainer.appendChild(card);
  });
}

function startBackgroundPreviewGenerator() {
  scanForModels();
  const assetsDir = getAssetsPath();
  const previewsDir = path.join(assetsDir, '.previews');
  
  if (!fs.existsSync(previewsDir)) {
    try {
      fs.mkdirSync(previewsDir, { recursive: true });
    } catch (e) {
      return;
    }
  }
  
  const allModels = ['procedural', ...discoveredModels];
  const queue = allModels.filter(modelKey => {
    const previewPath = path.join(previewsDir, `${modelKey}.png`);
    return !fs.existsSync(previewPath);
  });
  
  if (queue.length > 0) {
    console.log(`Starting background preview generator for ${queue.length} models:`, queue);
    const intervalId = setInterval(() => {
      if (queue.length === 0) {
        clearInterval(intervalId);
        return;
      }
      
      const nextModel = queue.shift();
      generateMascotPreviewInBackground(nextModel);
    }, 2000);
  }
}

function generateMascotPreviewInBackground(modelKey) {
  const assetsDir = getAssetsPath();
  const previewsDir = path.join(assetsDir, '.previews');
  const previewPath = path.join(previewsDir, `${modelKey}.png`);
  
  if (fs.existsSync(previewPath)) return;
  
  const originalVisible = characterGroup ? characterGroup.visible : true;
  
  if (modelKey === 'procedural') {
    // Hide active character
    if (characterGroup) characterGroup.visible = false;
    
    const tempGroup = new THREE.Group();
    scene.add(tempGroup);
    
    // Recreate procedural bunny meshes locally
    const bodyGeom = new THREE.SphereGeometry(0.7, 32, 32);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff7597 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    tempGroup.add(body);
    
    const eyeGeom = new THREE.SphereGeometry(0.08, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(0.2, 0.25, 0.55);
    tempGroup.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = -0.2;
    tempGroup.add(rightEye);
    
    const earGeom = new THREE.BoxGeometry(0.18, 0.9, 0.12);
    const leftEar = new THREE.Mesh(earGeom, bodyMat);
    leftEar.position.set(0.3, 0.9, 0);
    leftEar.rotation.z = -0.15;
    tempGroup.add(leftEar);
    const rightEar = leftEar.clone();
    rightEar.position.x = -0.3;
    rightEar.rotation.z = 0.15;
    tempGroup.add(rightEar);
    
    const noseGeom = new THREE.ConeGeometry(0.06, 0.08, 4);
    const noseMat = new THREE.MeshBasicMaterial({ color: 0xffb7c5 });
    const nose = new THREE.Mesh(noseGeom, noseMat);
    nose.position.set(0, 0.08, 0.68);
    nose.rotation.x = Math.PI;
    tempGroup.add(nose);
    
    const cheekGeom = new THREE.SphereGeometry(0.09, 16, 16);
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xffa3b1 });
    const leftCheek = new THREE.Mesh(cheekGeom, cheekMat);
    leftCheek.position.set(0.35, 0.05, 0.55);
    tempGroup.add(leftCheek);
    const rightCheek = leftCheek.clone();
    rightCheek.position.x = -0.35;
    tempGroup.add(rightCheek);
    
    tempGroup.rotation.y = 0.4;
    tempGroup.rotation.x = 0.08;
    
    // Synchronously render to paint buffer
    renderer.render(scene, camera);
    
    try {
      const dataUrl = renderer.domElement.toDataURL("image/png");
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(previewPath, base64Data, 'base64');
      console.log(`Generated background preview for: procedural`);
      
      const imgEl = document.querySelector(`.mascot-thumbnail[data-mascot="procedural"]`);
      if (imgEl) {
        imgEl.src = pathToFileURL(previewPath).href + "?t=" + Date.now();
      }
    } catch (e) {
      console.warn("Failed background capture for procedural bunny:", e);
    }
    
    scene.remove(tempGroup);
    if (characterGroup) characterGroup.visible = originalVisible;
    
  } else {
    // Load custom GLB/GLTF model in background
    const filePath = path.join(assetsDir, modelKey);
    let fileUrl = filePath;
    try {
      fileUrl = pathToFileURL(filePath).href;
    } catch (e) {}
    
    const loader = new GLTFLoader();
    loader.load(fileUrl, (gltf) => {
      const tempModel = gltf.scene;
      
      // Hide active character
      if (characterGroup) characterGroup.visible = false;
      
      const tempGroup = new THREE.Group();
      scene.add(tempGroup);
      
      // Center and scale model
      const box = new THREE.Box3().setFromObject(tempModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      tempModel.position.set(-center.x, -center.y, -center.z);
      
      const padding = 1.35;
      const innerGroup = new THREE.Group();
      innerGroup.add(tempModel);
      innerGroup.position.y = - size.y * (padding - 1) / 2;
      tempGroup.add(innerGroup);
      
      // Save original camera configuration
      const origAspect = camera.aspect;
      const origPos = camera.position.clone();
      
      // Set temporary framing camera coordinates
      const visibleHeight = size.y * padding;
      const zPos = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.position.set(0, 0, zPos + (size.z / 2));
      
      // Render frame
      renderer.render(scene, camera);
      
      try {
        const dataUrl = renderer.domElement.toDataURL("image/png");
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(previewPath, base64Data, 'base64');
        console.log(`Generated background preview for custom model: ${modelKey}`);
        
        const imgEl = document.querySelector(`.mascot-thumbnail[data-mascot="${modelKey}"]`);
        if (imgEl) {
          imgEl.src = pathToFileURL(previewPath).href + "?t=" + Date.now();
        }
      } catch (e) {
        console.warn(`Failed background capture for custom model: ${modelKey}`, e);
      }
      
      // Clean up & Restore
      scene.remove(tempGroup);
      camera.aspect = origAspect;
      camera.position.copy(origPos);
      camera.updateProjectionMatrix();
      if (characterGroup) characterGroup.visible = originalVisible;
      
    }, undefined, (err) => {
      console.warn(`Failed to load ${modelKey} for background preview:`, err);
    });
  }
}

function forceRefreshAllPreviews() {
  const assetsDir = getAssetsPath();
  const previewsDir = path.join(assetsDir, '.previews');
  if (fs.existsSync(previewsDir)) {
    try {
      const files = fs.readdirSync(previewsDir);
      files.forEach(file => {
        const filePath = path.join(previewsDir, file);
        fs.unlinkSync(filePath);
      });
    } catch (e) {
      console.warn("Could not clear previews folder:", e);
    }
  }
  
  // Set all grid card images back to the default fallback icon
  const thumbnails = document.querySelectorAll('.mascot-thumbnail');
  thumbnails.forEach(img => {
    img.src = './assets/bunny_icon.png';
  });
  
  // Trigger background preview generator queue to recreate previews offscreen
  startBackgroundPreviewGenerator();
  
  ipcRenderer.send('log-diagnostic', '[Preview Refresh] All mascot thumbnail previews refreshed.');
}

function setupSettingsUI() {
  const gearBtn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  const langSelect = document.getElementById('lang-select');
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
  const viewOnlyCheck = document.getElementById('view-only');
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
  
  const refreshPreviewsBtn = document.getElementById('refresh-previews-btn');
  if (refreshPreviewsBtn) {
    refreshPreviewsBtn.addEventListener('click', () => {
      forceRefreshAllPreviews();
    });
  }

  // Make gear button visible
  gearBtn.style.display = 'flex';

  // Configure slider limits dynamically based on current screen size
  widthSlider.max = window.screen.width;
  heightSlider.max = window.screen.height;

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
    if (langSelect) {
      langSelect.value = currentSettings.language || 'en';
    }
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
    viewOnlyCheck.checked = currentSettings.viewOnly;
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
    // If the button was dragged to move the window, do not trigger the click action
    if (dragMoveDistance >= 8) {
      return;
    }
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
  document.getElementById('save-btn').addEventListener('click', async () => {
    // 1. Update saved settings state
    if (langSelect && langSelect.value !== currentSettings.language) {
      currentSettings.language = langSelect.value;
      await changeLanguage(currentSettings.language);
    }

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
    currentSettings.viewOnly = viewOnlyCheck.checked;

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

  // Diagnostics & Logs Console handlers
  const diagnosticsOutput = document.getElementById('diagnostics-log-output');
  const diagnosticsDetails = document.querySelector('.diagnostics-details');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');
  const clearLogsBtn = document.getElementById('clear-logs-btn');

  const loadDiagnosticsLogs = () => {
    if (diagnosticsOutput) {
      const logs = ipcRenderer.sendSync('get-diagnostic-logs');
      diagnosticsOutput.textContent = logs;
      diagnosticsOutput.scrollTop = diagnosticsOutput.scrollHeight;
    }
  };

  if (diagnosticsDetails) {
    diagnosticsDetails.addEventListener('toggle', () => {
      if (diagnosticsDetails.open) {
        loadDiagnosticsLogs();
      }
    });
  }

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      loadDiagnosticsLogs();
    });
  }

  const openOverlayBtn = document.getElementById('open-overlay-btn');
  if (openOverlayBtn) {
    openOverlayBtn.addEventListener('click', (event) => {
      event.preventDefault();
      ipcRenderer.send('open-steam-overlay', 'Friends');
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const cleared = ipcRenderer.sendSync('clear-diagnostic-logs');
      if (cleared) {
        loadDiagnosticsLogs();
      }
    });
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  const now = Date.now();

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
