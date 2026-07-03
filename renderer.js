import * as THREE from './node_modules/three/build/three.module.js';

const { ipcRenderer } = window.require('electron');

let scene, camera, renderer, characterGroup;
let isMouseOverCharacter = false;
let isDragging = false;
let dragStartScreenX = 0;
let dragStartScreenY = 0;
let dragMoveDistance = 0;

// Animation state
let animationState = {
  type: 'idle', // 'idle' or 'interact'
  startTime: 0,
  duration: 1000 // ms
};

function init() {
  const container = document.getElementById('container');

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

  // 5. Build the Cute Procedural Mascot
  createMascot();

  // 6. Hook up Interaction & Window Dragging
  setupInteraction();

  // 7. Start Animation Loop
  animate();

  // Handle Resize
  window.addEventListener('resize', onWindowResize);
}

function createMascot() {
  characterGroup = new THREE.Group();

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
  characterGroup.add(bodyMesh);

  // --- Eyes & Highlights ---
  const eyeGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const highlightGeom = new THREE.SphereGeometry(0.04, 8, 8);

  // Left Eye
  const leftEye = new THREE.Mesh(eyeGeom, eyeMaterial);
  leftEye.position.set(-0.35, 0.05, 0.9);
  
  const leftEyeHighlight1 = new THREE.Mesh(highlightGeom, eyeHighlightMaterial);
  leftEyeHighlight1.position.set(-0.30, 0.11, 0.99);
  characterGroup.add(leftEye);
  characterGroup.add(leftEyeHighlight1);

  // Right Eye
  const rightEye = new THREE.Mesh(eyeGeom, eyeMaterial);
  rightEye.position.set(0.35, 0.05, 0.9);
  
  const rightEyeHighlight1 = new THREE.Mesh(highlightGeom, eyeHighlightMaterial);
  rightEyeHighlight1.position.set(0.40, 0.11, 0.99);
  characterGroup.add(rightEye);
  characterGroup.add(rightEyeHighlight1);

  // --- Blush Cheeks ---
  const blushGeom = new THREE.SphereGeometry(0.16, 16, 16);
  
  const leftBlush = new THREE.Mesh(blushGeom, blushMaterial);
  leftBlush.scale.set(1, 0.6, 0.2);
  leftBlush.position.set(-0.55, -0.12, 0.88);
  leftBlush.rotation.set(0.1, 0.3, -0.1);
  characterGroup.add(leftBlush);

  const rightBlush = new THREE.Mesh(blushGeom, blushMaterial);
  rightBlush.scale.set(1, 0.6, 0.2);
  rightBlush.position.set(0.55, -0.12, 0.88);
  rightBlush.rotation.set(0.1, -0.3, 0.1);
  characterGroup.add(rightBlush);

  // --- Cute Smile ---
  // Torus geometry cut in half to create an upward arc
  const smileGeom = new THREE.TorusGeometry(0.07, 0.02, 8, 24, Math.PI);
  const smileMesh = new THREE.Mesh(smileGeom, eyeMaterial);
  smileMesh.position.set(0, -0.06, 0.99);
  smileMesh.rotation.z = Math.PI; // Invert to make it curve upwards
  characterGroup.add(smileMesh);

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

  characterGroup.add(leftEarGroup);

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

  characterGroup.add(rightEarGroup);

  // --- Feet ---
  const footGeom = new THREE.SphereGeometry(0.22, 16, 16);

  const leftFoot = new THREE.Mesh(footGeom, footMaterial);
  leftFoot.scale.set(1.2, 0.7, 1.2);
  leftFoot.position.set(-0.4, -0.9, 0.2);
  characterGroup.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeom, footMaterial);
  rightFoot.scale.set(1.2, 0.7, 1.2);
  rightFoot.position.set(0.4, -0.9, 0.2);
  characterGroup.add(rightFoot);

  // Tilt character slightly forward towards camera
  characterGroup.rotation.x = 0.08;

  scene.add(characterGroup);
}

function setupInteraction() {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Track mouse movements to update window ignore-mouse states
  window.addEventListener('mousemove', (event) => {
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

    // Convert mouse client coordinates to Normalized Device Coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(characterGroup.children, true);

    if (intersects.length > 0) {
      if (!isMouseOverCharacter) {
        isMouseOverCharacter = true;
        document.body.style.cursor = 'pointer';
        // Tell main process NOT to ignore mouse events (allows clicks & drags)
        ipcRenderer.send('set-ignore-mouse', false);
      }
    } else {
      if (isMouseOverCharacter) {
        isMouseOverCharacter = false;
        document.body.style.cursor = 'default';
        // Tell main process to ignore mouse events (clicks pass through window)
        ipcRenderer.send('set-ignore-mouse', true);
      }
    }
  });

  window.addEventListener('mousedown', (event) => {
    if (isMouseOverCharacter && event.button === 0) { // Left click
      isDragging = true;
      dragStartScreenX = event.screenX;
      dragStartScreenY = event.screenY;
      dragMoveDistance = 0;
      document.body.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = isMouseOverCharacter ? 'pointer' : 'default';

      // Treat small drag movements as a simple click
      if (dragMoveDistance < 8) {
        triggerInteraction();
      }
    }
  });
}

function triggerInteraction() {
  if (animationState.type === 'interact') return;

  animationState.type = 'interact';
  animationState.startTime = Date.now();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  const now = Date.now();

  if (animationState.type === 'interact') {
    const progress = (now - animationState.startTime) / animationState.duration;

    if (progress >= 1.0) {
      // Revert back to idle
      animationState.type = 'idle';
      characterGroup.position.set(0, 0, 0);
      characterGroup.rotation.set(0.08, 0, 0);
      characterGroup.scale.set(1, 1, 1);
    } else {
      // Interaction Animation: High Jump & 360 Spin
      // Jump height follows a sine curve arching up then landing
      const height = Math.sin(progress * Math.PI) * 1.3;
      characterGroup.position.y = height;

      // 360-degree spin
      characterGroup.rotation.y = progress * Math.PI * 2;

      // Squash and stretch transitions
      if (progress < 0.2) {
        // Squash down preparing for jump
        const factor = progress / 0.2;
        characterGroup.scale.set(1.15, 0.8, 1.15);
      } else if (progress < 0.8) {
        // Stretch in mid-air
        characterGroup.scale.set(0.9, 1.2, 0.9);
      } else {
        // Land with squash, scaling back up to normal
        const factor = (progress - 0.8) / 0.2;
        const squashY = 0.75 + (factor * 0.25);
        const stretchXZ = 1.2 - (factor * 0.2);
        characterGroup.scale.set(stretchXZ, squashY, stretchXZ);
      }
    }
  } else {
    // --- Idle Animation (Breathing Squash & Bobbing) ---
    // Smooth breathing (vertical scale oscillates)
    const breatheSpeed = 2.5;
    const breatheFactor = Math.sin(elapsed * breatheSpeed);

    characterGroup.scale.y = 1.0 + breatheFactor * 0.04;
    characterGroup.scale.x = 1.0 - breatheFactor * 0.02;
    characterGroup.scale.z = 1.0 - breatheFactor * 0.02;

    // Smooth floating/bobbing up and down
    characterGroup.position.y = Math.sin(elapsed * 1.5) * 0.12;

    // Subtle side-to-side wobbling
    characterGroup.rotation.z = Math.sin(elapsed * 0.8) * 0.025;
    characterGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.04; // Looking around slightly
  }

  renderer.render(scene, camera);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
