

https://github.com/user-attachments/assets/51b7a1df-c22e-433f-813f-2610c0b7bef4


# 3D Transparent Desktop Mascot Pet 🐰

A floating, borderless, fully transparent (RGBA 0, 0, 0, 0) 3D interactive mascot desktop application for Windows built using **Electron** and **Three.js**.

The mascot floats gently on top of your windows while you work. It supports click-through physics (only interacting when the mouse is directly over the character) and can be dragged around the screen or clicked to perform dynamic physics animations.

---

## 🚀 How to Run the App

### Option A: Standalone Executable (No Setup Required)
We have compiled the app into a standalone folder. You can run it instantly without installing Node.js:

1. Open File Explorer.
2. Navigate to:
   `C:\Users\space\.gemini\antigravity-ide\scratch\desktop-pet\DesktopPet-win32-x64\`
3. Double-click **`DesktopPet.exe`** to launch the mascot.
   * *Tip: Right-click `DesktopPet.exe` -> "Send to" -> "Desktop (create shortcut)" to add a launch icon to your desktop.*

---

### Option B: Local Node.js Development
If you want to edit the files, inspect code, or modify animations/assets:

1. Ensure [Node.js](https://nodejs.org) is installed on your computer.
2. Open a command prompt or terminal.
3. Navigate to the project root directory:
   ```bash
   cd C:\Users\space\.gemini\antigravity-ide\scratch\desktop-pet
   ```
4. Run the application:
   ```bash
   npm start
   ```
5. If you make edits to `renderer.js` or `main.js` and want to compile a new `.exe` bundle, run:
   ```bash
   npm run build
   ```

---

## 🕹️ Controls & Interaction Guide

* **Idle Float:** By default, the pet floats gently up and down and performs soft breathing squash-and-stretch scale transitions.
* **Interact (Click):** Single click on the mascot to watch it perform a wind-up squash, a high jump with a 360-degree spin, and a landing compression reaction before returning to idle.
* **Move (Drag):** Left-click and hold your mouse button on the mascot to drag it to any location or screen.
* **Click-Through:** Hovering over empty space around the mascot is fully transparent. Any clicks in the empty margins will interact directly with the windows, IDE, or desktop background behind the app.

---

## 💡 Customize with Your Own 3D Models (e.g. Pokémon)

To replace the procedural character with your own custom 3D model (such as a Pokémon `.gltf` or `.glb` model):

1. Put your 3D model into an `assets` folder inside the project (e.g., `assets/pokemon.glb`).
2. Open `renderer.js` and replace the procedural `createMascot()` function code using `GLTFLoader`:

```javascript
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';

function loadCustomModel() {
  const loader = new GLTFLoader();
  loader.load('assets/pokemon.glb', (gltf) => {
    const model = gltf.scene;
    
    // Scale and position adjustment to center it in our 350x350 window
    model.scale.set(1.5, 1.5, 1.5);
    model.position.y = -0.8;
    
    characterGroup.add(model);
    
    // If your GLB file has built-in skeletal animations:
    const mixer = new THREE.AnimationMixer(model);
    const idleAction = mixer.clipAction(gltf.animations[0]);
    idleAction.play();
    
    // update mixer in the animate() loop: mixer.update(clock.getDelta());
  });
}
```
3. Re-run `npm start` or rebuild with `npm run build` to see your custom model floating on your desktop!
