<img width="400" height="236" alt="Recording 2026-07-04 002226" src="https://github.com/user-attachments/assets/ec017b5e-f488-409f-ae98-e225e1fadb53" />


# 3D Transparent Desktop Mascot Pet 🐰 (V4)

A floating, borderless, fully transparent (RGBA 0,0,0,0) 3D interactive companion pet application for Windows, powered by **Electron**, **Three.js (WebGL)**, and **i18next**.

The mascot floats on top of your working windows, bobbing gently. It captures clicks and drags when hovered directly, and passes clicks straight through to the applications underneath when clicking in transparent areas.

---

## 🚀 How to Run the App

> [!IMPORTANT]
> If the Steam app is not logged in yet, the Steam overlay will not appear on the screen (the app automatically operates using the offline fallback mode).

### Option A: Standalone Executable (No Setup Required)
Perfect for instant use without running terminal commands.

1. Open **File Explorer** and navigate to:
   [DesktopPet-win32-x64](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/DesktopPet-win32-x64)
2. Double-click **`DesktopPet.exe`** to start your pet mascot.

> [!TIP]
> Right-click `DesktopPet.exe` ➔ *Send to* ➔ *Desktop (create shortcut)* to launch it directly from your desktop.

---

### Option B: Local Development & GitHub Reproduction
Ideal if you download the source code from GitHub to inspect, debug, or extend the app.

1. Ensure [Node.js](https://nodejs.org) is installed.
2. Open terminal and navigate to the project directory:
   ```bash
   cd "C:\Users\space\.gemini\antigravity-ide\scratch\desktop-pet v4"
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. **Generate multi-language (i18n) dictionaries (Crucial Step):**
   ```bash
   node scratch_create_locales.js
   ```
   > [!IMPORTANT]
   > Running `node scratch_create_locales.js` populates all 31 language folders inside [locales/](file:///c:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/locales) (e.g., `locales/en/translation.json`). Running `npm install` alone is not enough; this step is required for language switching to work.

5. Start the dev app:
   ```bash
   npm start
   ```
6. Recompile the production executable after modifying code:
   ```bash
   npm run build
   ```

### ⚠️ PowerShell Build Troubleshooting
If running `npm run build` in PowerShell returns an execution policy restriction error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```
Or build directly using standard Windows Command Prompt (`cmd`).

---

## 🌍 Multi-Language (i18n) Support (31 Languages)

Desktop Pet V4 includes an enterprise-grade internationalization system built on the **i18next framework**. The application automatically detects your operating system locale or allows you to select any of the **31 supported languages** directly from the Settings Panel:

| Region / Scope | Supported Languages & Locales |
| :--- | :--- |
| **Americas & Europe** | English (`en`), French (`fr`), Italian (`it`), German (`de`), Spanish - Spain (`es`), Spanish - Latin America (`es-419`), Portuguese - Brazil (`pt-BR`), Portuguese - Portugal (`pt-PT`), Dutch (`nl`), Danish (`da`), Finnish (`fi`), Norwegian (`no`), Swedish (`sv`) |
| **Eastern Europe & Eurasia** | Russian (`ru`), Ukrainian (`uk`), Polish (`pl`), Czech (`cs`), Hungarian (`hu`), Bulgarian (`bg`), Romanian (`ro`), Greek (`el`), Turkish (`tr`) |
| **Asia & Middle East** | Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-TW`), Japanese (`ja`), Korean (`ko`), Vietnamese (`vi`), Thai (`th`), Bahasa Indonesia (`id`), Bahasa Melayu (`ms`), Arabic (`ar`) |

* **Dynamic Locale Switching**: Changing the language instantly updates all panel headers, labels, view control guides, and diagnostics buttons without restarting.
* **Global Typography Fallbacks**: Integrated CJK font stacks (`PingFang SC`, `Hiragino Sans`, `Meiryo`, `Malgun Gothic`, `Noto Sans CJK`) and RTL styling for seamless international text rendering.
* **Editing & Adding Languages**: Edit JSON dictionary files directly in [locales/](file:///c:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/locales) and register new locale codes in `SUPPORTED_LANGUAGES` inside [i18nManager.js](file:///c:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/i18nManager.js).




---

## 🕹️ Controls & Interaction Guide

| Mouse / Key Action | Target | Description |
| :--- | :--- | :--- |
| **Hover** | Over character | Cursor changes to a pointer, enabling interaction. |
| **Left Click** | On character | Procedural mascot: plays jump and spin. Custom models: plays animation loop at accelerated speed. |
| **Left Click + Drag** | On character / Cog Button / Panel Background | Smoothly repositions the mascot window anywhere on your monitor(s). |
| **Alt + Left-Drag** (or MMB-Drag) | Anywhere | **Orbit View (3D Rotate):** Changes the 3D view perspective, rotating the pet. |
| **Shift + Left-Drag** | Anywhere | **Pan View (3D Translate):** Moves the pet model up/down and left/right inside the canvas boundaries. |
| **Scroll Wheel** (or Ctrl + Left-Drag) | Anywhere | **Zoom View (3D Scale/Depth):** Moves the pet model closer or further away. |
| **Alt + Double-Click** | On mascot | **Reset View:** Instantly centers and resets the model's 3D orientation back to default. |
| **Click** | Outside character | Passed through to the folders, IDE, or browser behind the window. |
| **Hover ➔ Click ⚙️** | Left or Right edge | Toggles (Opens or Closes) the glassmorphic Settings Panel. |
| **Ctrl + V** | Globally | Toggles **View Only Mode** on/off (only active when not typing inside input fields). |

---

## 💡 Customize with Your Own 3D Models (Frictionless Import)

The app automatically detects, centers, and displays any 3D asset:

* **Drag-and-Drop Loader**: Simply drag any `.glb` or `.gltf` file directly from Windows Explorer and drop it onto the pet's window. The app will automatically copy the file into the `assets/` folder and load it immediately.
* **Auto-Grounding**: Bounding boxes are calculated automatically to scale the mascot and anchor its feet flush with the taskbar, preventing floating or clipping.
* **Auto-Animation Mapping**: Inspects animation clips and automatically maps idle tracks (`"idle"`, `"stay"`, `"breathe"`) and click reactions (`"jump"`, `"spin"`, `"click"`, `"react"`).

Alternatively, you can manually manage models:
1. Locate the **`assets/`** folder:
   - Development path: [assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/assets)
   - Executable path: [DesktopPet-win32-x64/assets/](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/DesktopPet-win32-x64/assets)
2. Drop any **`.glb`** or **`.gltf`** model file into this directory.
3. Reload or select it inside the Settings Panel.
4. **Fallback:** If you empty the `assets/` folder, the application immediately falls back to rendering the default pink bunny mascot.

---

## ⚙️ Interactive Settings Panel

1. **How to Enable:** Place a text file named **`settings`** (or `settings.txt`) in your `assets/` folder. (Automatically created on first launch).
2. **Accessing the Panel:** Hover your mouse cursor over the mascot. A gear icon `⚙️` will appear. Click it to toggle the Settings Panel open or closed.
3. **Editable Settings:**
   - **Language**: Select your preferred interface language from **31 international options**.
   - **Active Mascot**: Select between the default procedural bunny and custom models dropped in the `assets/` folder.
   - **Active Animation**: Lists and plays the model's embedded animation clips, plus a **None (Static Pose)** option.
   - **Window Width & Height:** Adjust window dimensions from **30px** up to full monitor resolution.
   - **Model Scale:** Zoom/scale the 3D character from **0.10x** to **5.00x** with **0.01** step precision.
   - **Panel Text Size:** Scalable slider from **0.80x** to **2.00x** to dynamically resize settings panel typography.
   - **Enable Idle Bobbing:** Toggle the slow floating vertical idle animation.
   - **View Only Mode**: Enable transparency on hover (`Ctrl + V`). The pet fades to fully transparent when your mouse enters the area.
   - **Lock Mascot Position**: Freeze window coordinates to prevent accidental dragging.
   - **Force High-Performance GPU:** Request discrete high-speed graphics card. *(Requires restart)*.
   - **Seamless Performance Mode:** Toggle between Seamless Mode (throttled proxy raycasting) and Precise Mode.
   - **Place Settings Icon on Left:** Shift gear button `⚙️` position to the top-left margin.
   - **Axis Spinning (X, Y, and Z):** Enable continuous rotation spinning on X, Y, and Z axes with independent speed sliders.

---

## ⚡ Performance & Clean Architecture Notes (V4 Refactoring)

* **Dialogue System Purge (Approach C)**: Speech bubble popups and idle text timers were purged in V3/V4 to maximize render loop performance (`60 FPS`) and keep runtime code lean.
* **Central Diagnostics Console**: System alerts and config recovery messages are now output directly to the collapsible Diagnostics Console (`assets/diagnostics.log`), keeping the visual canvas unobstructed.
* **Decoupled Steam Achievements**: Uptime achievements (`ACH_TRAVEL_FAR`) operate via an independent background monitor in [main.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/main.js), completely decoupled from UI popups.

---

## 🛡️ Robustness & Troubleshooting

* **Sub-Viewport Canvas Margins**: 10px padding constraint on HTML container with DOM target validation (`event.target.tagName !== 'CANVAS'`) in [renderer.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/renderer.js) to instantly reset hover states and clear click-through.
* **Main Process Edge Check Polling**: 100ms interval query in [main.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/main.js) checking cursor positions and forcing hover exits when crossing boundaries.
* **Atomic Settings Staging**: Atomic writes via temporary file staging and synchronous renaming in [renderer.js](file:///C:/Users/space/.gemini/antigravity-ide/scratch/desktop-pet%20v4/renderer.js) to prevent settings file corruption during unexpected shutdowns.
* **Offline Steamworks Mock**: Built-in `MockSteamClient` fallback when Steam is offline, allowing in-app achievements to trigger smoothly.

---


