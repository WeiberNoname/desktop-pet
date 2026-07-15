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
+. Installation(Local node_modules folder is missing or incomplete.):
   ```bash
   npm install
   ```
<img width="750" height="170" alt="Screenshot 2026-07-05 143120" src="https://github.com/user-attachments/assets/8bd55513-383d-454c-a276-17406037c749" />

   
3. Start the dev app:
   ```bash
   npm start
   ```
4. Recompile the production executable after modifying code:
   ```bash
   npm run build
   ## 🕹️ Controls & Interaction Guide

| Mouse / Key Action | Target | Description |
| :--- | :--- | :--- |
| **Hover** | Over character | Cursor changes to a pointer, enabling interaction. |
| **Left Click** | On character | Procedural mascot: plays jump and spin. Custom models: plays animation loop at accelerated speed (no jump). |
| **Left Click + Drag** | On character / Cog Button / Panel Background | Smoothly repositions the mascot window anywhere on your monitor(s). (Excludes sliders, buttons, or inputs). |
| **Alt + Left-Drag** (or MMB-Drag) | Anywhere | **Orbit View (3D Rotate):** Changes the 3D view perspective, rotating the pet. |
| **Shift + Left-Drag** | Anywhere | **Pan View (3D Translate):** Moves the pet model up/down and left/right inside the canvas boundaries. |
| **Scroll Wheel** (or Ctrl + Left-Drag) | Anywhere | **Zoom View (3D Scale/Depth):** Moves the pet model closer or further away (adjusts Z position). |
| **Alt + Double-Click** | On mascot | **Reset View:** Instantly centers and resets the model's 3D orientation back to default. |
| **Click** | Outside character | Passed through to the folders, IDE, or browser behind the window. |
| **Hover ➔ Click ⚙️** | Left or Right edge | Toggles (Opens or Closes) the glassmorphic Settings Panel (bypassed if button is dragged). |
| **Ctrl + V** | Globally | Toggles **View Only Mode** on/off (only active when not typing inside input fields). |

---

## 💡 Customize with Your Own 3D Models (Frictionless Import)

The app automatically detects, centers, and displays any 3D asset:

* **Drag-and-Drop Loader**: Simply drag any `.glb` or `.gltf` file directly from Windows Explorer and drop it onto the pet's window. The app will automatically copy the file into the `assets/` folder and load it immediately.
* **Auto-Grounding**: Bounding boxes are calculated automatically to scale the mascot and anchor its base/feet flush with the taskbar, preventing floating or clipping.
* **Auto-Animation Mapping**: Inspects animation clips and automatically maps idle tracks (containing `"idle"`, `"stay"`, `"breathe"`) and click reactions (containing `"jump"`, `"spin"`, `"click"`, `"react"`).

Alternatively, you can manually manage models:
1. Locate the **`assets/`** folder:
   - Development path: [assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/assets)
   - Executable path: [DesktopPet-win32-x64/assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet/DesktopPet-win32-x64/assets)
2. Drop any **`.glb`** or **`.gltf`** model file into this directory.
3. Reload or select it inside the Settings Panel.
4. **Fallback:** If you empty the `assets/` folder, the application immediately falls back to rendering the default pink bunny mascot.

---

## ⚙️ Interactive Settings Panel

You can enable an overlay settings panel by adding a configuration file:

1. **How to Enable:** Place a text file named **`settings`** (or `settings.txt`) in your `assets/` folder.
   - **Note:** If this file is missing, the application **automatically creates it** on startup with default values, meaning the settings panel is always active out-of-the-box!
2. **Accessing the Panel:** Hover your mouse cursor over the mascot. A gear icon `⚙️` will appear. Click it to toggle the Settings Panel open or closed.
3. **Editable Settings:**
   - **Active Mascot**: Select between the default procedural bunny and custom models dropped in the `assets/` folder.
   - **Active Animation**: Dynamically lists and plays the model's embedded animation clips, plus a **None (Static Pose)** option to freeze active loops. (Only active when a custom model is loaded).
   - **Window Width & Height:** Adjust the window dimensions from a minimal **30px** up to your **full computer screen size**.
   - **Model Scale:** Manually zoom/scale the 3D character from **0.10x** to **5.00x** with ultra-precise **0.01** step increments.
   - **Panel Text Size:** Scalable slider from **0.80x** to **2.00x** to dynamically resize settings panel typography.
   - **Enable Idle Bobbing:** Checkbox to toggle the slow floating vertical idle animation.
   - **View Only Mode**: Enable transparency on hover. When checked (or toggled with `Ctrl + V`), the pet smoothly fades to fully transparent (`opacity = 0.0`) when your mouse enters the area, allowing clicks to pass directly to applications underneath.
   - **Lock Mascot Position**: Freeze window coordinates to prevent accidental dragging.
   - **Force High-Performance GPU:** Toggle whether the app automatically requests discrete high-speed graphics. *(Requires restart to apply)*.
   - **Seamless Performance Mode:** Toggle between Seamless Mode (throttled proxy raycasting) and Precise Mode (full triangle raycasting).
   - **Place Settings Icon on Left:** Checkbox to shift the gear button `⚙️` position to the top-left margin.
   - **Axis Spinning (X, Y, and Z):** Enable continuous rotation spinning on the X, Y, and/or Z axes. Each axis has its own checkbox and speed slider.
4. **Resizing Sync & Revert Rules:**
   - Sliders and select options update only their numerical text labels/values in real-time while dragging/changing in the panel.
   - Changes are applied to the window and model **only when you click "Save & Refresh"**.
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

error message:
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system. For
more information, see about_Execution_Policies at https:/go.microsoft.com/fwlink/?LinkID=135170.
At line:1 char:1
+ npm run build
+ ~~~
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

> [!NOTE]
> fix command: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
