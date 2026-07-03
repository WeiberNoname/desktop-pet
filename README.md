<img width="400" height="236" alt="Recording 2026-07-04 002226" src="https://github.com/user-attachments/assets/ec017b5e-f488-409f-ae98-e225e1fadb53" />


# 3D Transparent Desktop Mascot Pet 🐰

A floating, borderless, fully transparent (RGBA 0,0,0,0) 3D interactive companion pet application for Windows, powered by **Electron** and **Three.js (WebGL)**.

The mascot floats on top of your working windows, bobbing gently. It captures clicks and drags when hovered directly, and passes clicks straight through to the applications underneath when clicking in transparent areas.

---

## 🚀 How to Run the App

### Option A: Standalone Executable (No Setup Required)
Perfect for instant use without running terminal commands.

1. Open **File Explorer** and navigate to:
   [DesktopPet-win32-x64](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/DesktopPet-win32-x64)
2. Double-click **`DesktopPet.exe`** to start your pet mascot.

> [!TIP]
> Right-click `DesktopPet.exe` ➔ *Send to* ➔ *Desktop (create shortcut)* to launch it directly from your desktop.

---

### Option B: Local Node.js Development
Ideal if you want to inspect, debug, or extend the JavaScript source files.

1. Ensure [Node.js](https://nodejs.org) is installed.
2. Open terminal and navigate to the project directory:
   ```bash
   cd C:\Users\space\.gemini\antigravity-ide\scratch\desktop-pet
   ```
3. Start the dev app:
   ```bash
   npm start
   ```
4. Recompile the production executable after modifying code:
   ```bash
   npm run build
   ```

---

## 🕹️ Controls & Interaction Guide

| Mouse Action | Target | Description |
| :--- | :--- | :--- |
| **Hover** | Over character | Cursor changes to a pointer, enabling interaction. |
| **Left Click** | On character | Plays a squash-and-stretch windup, a high jump, and a 360° spin animation. |
| **Left Click + Drag** | On character | Smoothly repositions the mascot anywhere on your monitor(s). |
| **Click** | Outside character | Passed through to the folders, IDE, or browser behind the window. |
| **Hover ➔ Click ⚙️** | Left or Right edge | Toggles (Opens or Closes) the glassmorphic Settings Panel. |

---

## 💡 Customize with Your Own 3D Models (Zero-Code Customization)

The app automatically detects, centers, and displays any 3D asset you drop in:

1. Locate the **`assets/`** folder:
   - Development path: [assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/assets)
   - Executable path: [DesktopPet-win32-x64/assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/DesktopPet-win32-x64/assets)
2. Drop any **`.glb`** or **`.gltf`** model file (e.g. your favorite Pokémon) into this directory.
3. Launch the app. The engine will:
   - **Scan** and read your 3D asset.
   - **Auto-center and load** the geometry at its original modeled size `(scale: 1, 1, 1)`.
   - **Auto-fit viewport:** If settings are disabled, the window automatically resizes and the camera repositions itself so the model fits the window perfectly.
   - **Auto-play** the first embedded skeletal animation track (e.g., Idle/Walk).
4. **Fallback:** If you empty the `assets/` folder, the application immediately falls back to rendering the default pink bunny mascot.

---

## ⚙️ Interactive Settings Panel

You can enable an overlay settings panel by adding a configuration file:

1. **How to Enable:** Place a text file named **`settings`** (or `settings.txt`) in your `assets/` folder.
   - **Note:** If this file is missing, the application **automatically creates it** on startup with default values, meaning the settings panel is always active out-of-the-box!
2. **Accessing the Panel:** Hover your mouse cursor over the mascot. A gear icon `⚙️` will appear. Click it to toggle the Settings Panel open or closed.
3. **Editable Settings:**
   - **Window Width & Height:** Adjust the window dimensions from a minimal **30px** up to your **full computer screen size**.
   - **Model Scale:** Manually zoom/scale the 3D character from **0.10x** to **5.00x** with ultra-precise **0.01** step increments (10x finer settings precision).
   - **Enable Idle Bobbing:** Checkbox to toggle the slow floating vertical idle animation on or off.
   - **Force High-Performance GPU:** Toggle whether the app automatically requests discrete high-speed graphics (NVIDIA/AMD) or stays on integrated defaults (Intel). *(Requires restart to apply)*.
   - **Seamless Performance Mode:** Toggle between Seamless Mode (60Hz raycast throttling and simple bounding boxes) and Precise Mode (full recursive triangle raycasting at raw mouse coordinates).
   - **Place Settings Icon on Left:** Checkbox to shift the gear button `⚙️` position to the top-left margin instead of the top-right margin.
   - **Axis Spinning (X, Y, and Z):** Enable continuous rotation spinning on the X, Y, and/or Z axes. Each axis has its own checkbox and a speed slider range from **-5.0 to 5.0**.
     - *Positive values (0.1 to 5.0):* Spin the mascot clockwise.
     - *Negative values (-0.1 to -5.0):* Spin the mascot counter-clockwise (reverses direction).
     - *Zero (0.0):* Halts rotation on that axis.
4. **Resizing Sync & Revert Rules:**
   - Sliders update only their numerical text labels in real-time while dragging.
   - Changes are applied to the window and model **only when you click "Save Settings"**.
   - Clicking **"Close"** or clicking the **Gear Button** again cancels changes and reverts parameters to last saved states.

---

## ⚡ Performance Optimization & GPU Troubleshooting (Dual-GPU Laptops)

On Windows laptops equipped with both integrated (Intel) and dedicated (NVIDIA/AMD) graphics cards, the OS may default the mascot to run on the low-power integrated chip, which can cause frame stuttering. 

While the application code automatically requests high-performance discrete graphics internally, certain Windows battery-saving profiles can override this. If you experience lags, apply one of the following overrides:

### Override A: Windows OS Graphics Settings (Recommended)
1. Open the Windows **Start Menu**, search for **Graphics Settings**, and press Enter.
2. Under "Graphics performance preference", set the dropdown to **Desktop app** and click **Browse**.
3. Select **`DesktopPet.exe`** from your compiled output directory.
4. Click on the newly added "DesktopPet" app listing, and click the **Options** button.
5. Select **High performance** (your dedicated NVIDIA/AMD graphics card will be listed here) and click **Save**.

### Override B: NVIDIA Control Panel Setup
1. Right-click on your Windows desktop and select **NVIDIA Control Panel**.
2. Select **Manage 3D Settings** in the left navigation sidebar.
3. Open the **Program Settings** tab and click the **Add** button.
4. Select **`DesktopPet.exe`** from the browser options.
5. Change the preferred graphics processor choice to **High-performance NVIDIA processor** and click **Apply**.

---

> [!NOTE]
> To modify the source scripts, open the project inside your editor and make changes directly in [renderer.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/renderer.js) or [main.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/main.js).
