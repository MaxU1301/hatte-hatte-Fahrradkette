---
hide:
  - toc
---

# Hammerspoon: Quantum & REAPER Automation

This document details the `init.lua` script for Hammerspoon that provides the core automation for the studio workflow. Its primary purpose is to link the power state of the studio peripherals to the operational state of REAPER and the computer itself.

## Overview

The script constantly monitors the presence of the **PreSonus Quantum 2626** audio interface. This connection status acts as a trigger for a chain of automated events, simplifying the startup and shutdown procedures of the entire studio.

### Core Features

- **Automatic Sleep:** When the Quantum 2626 is disconnected (e.g., by turning off the Furman power conditioner), a configurable countdown begins.
- **Graceful Exit:** Before sleeping the computer, the script focuses REAPER, saves the current project, and then quits the application.
- **User Prompt:** A popup window appears during the countdown, showing the time remaining and allowing the user to either proceed immediately or cancel the shutdown.
- **Automatic Startup:** Upon waking the computer and detecting the Quantum 2626 has reconnected, the script automatically launches REAPER.
- **Robustness:** Includes retry logic for launching REAPER on wake and fallback detection to ensure reliability.

## Installation

1.  **Prerequisite:** Ensure [Hammerspoon](https://www.hammerspoon.org/) is installed.
2.  Navigate to your Hammerspoon configuration directory, which is located at `~/.hammerspoon/`.
3.  Place the code below into a file named `init.lua` inside this directory. If you already have an `init.lua` file, you will need to merge this script's contents with your existing configuration.
4.  Open the Hammerspoon application and select "Reload Config" from its menu bar icon to activate the script.

## Configuration

The script includes several variables at the top of the file that can be easily modified to suit your needs.

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `REAPER_APP` | `"REAPER"` | The name of the REAPER application. |
| `REAPER_BUNDLE_ID` | `"com.cockos.reaper"` | The macOS bundle ID for REAPER, used for reliable launching. |
| `COUNTDOWN_SECONDS`| `300` | The duration in seconds (5 minutes) before the script automatically saves REAPER and sleeps the computer. |
| `POLL_INTERVAL` | `2` | The interval in seconds at which the script checks if the audio interface is connected. |
| `WAKE_LAUNCH_DELAY` | `7` | The delay in seconds after the system wakes before the first attempt to launch REAPER. |
| `TARGET_DEVICE_NAME_MATCHERS`| `{ "quantum 2626", ... }` | A list of case-insensitive text fragments to identify your audio interface by name. Add or change these if your device name is different. |

## Complete `init.lua` Script

```lua
-- init.lua (Hammerspoon)
hs.console.clearConsole()

-- ========================================
-- REAPER + Quantum 2626 automation (v4)
-- - Save + Quit REAPER on disconnect; sleep only after REAPER is gone
-- - Only act on REAPER if already running (do NOT launch during save/quit)
-- - Launch REAPER after wake with delayed retries
-- - Fallback autolaunch on device reconnect after sleep
-- - Wake window so reconnects shortly after wake trigger launch
-- - Poll-based device detection with post-wake reinit
-- ========================================

-- ---------- Config ----------
local REAPER_APP = "REAPER"
local REAPER_BUNDLE_ID = "com.cockos.reaper"

local COUNTDOWN_SECONDS = 300 -- 5 minutes
local POLL_INTERVAL = 2 -- seconds
local SLEEP_AFTER_ACTION = true

-- Launch-on-wake behavior
local WAKE_LAUNCH_DELAY = 7 -- seconds before first launch attempt
local WAKE_LAUNCH_RETRY_DELAYS = { 14, 24 } -- seconds after wake for retries
local LAUNCH_ONLY_IF_DEVICE_PRESENT = true -- launch only when Quantum is visible
local RECONNECT_LAUNCH_WINDOW = 90 -- s; reconnects within this window after wake trigger launch
local LAUNCH_ON_WAKE = true -- keep true to enable wake autolaunch

-- Device matching by name substring (case-insensitive)
local TARGET_DEVICE_NAME_MATCHERS = {
  "quantum 2626",
  "presonus quantum 2626",
}

-- Optional UID hints (case-insensitive substrings)
local TARGET_UID_HINTS = {
  -- "qt4h20040939",
}

-- ---------- State ----------
local isConnected = false
local popupWV = nil
local popupTimer = nil
local remaining = COUNTDOWN_SECONDS
local ucc = nil
local popupActive = false
local dismissedUntilReconnect = false

local pollTimer = nil
local debounceTimer = nil

-- Wake/autolaunch state
local pendingReconnectAutolaunch = false
local wakeHintUntil = 0

local function now()
  return hs.timer.secondsSinceEpoch()
end

-- ---------- Logging ----------
local function log(fmt, ...)
  hs.printf("Quantum2626: " .. fmt, ...)
end

-- ---------- Device helpers ----------
local function nameMatches(name)
  local n = (name or ""):lower()
  for _, pat in ipairs(TARGET_DEVICE_NAME_MATCHERS) do
    if n:find(pat, 1, true) then
      return true
    end
  end
  return false
end

local function uidMatches(uid)
  if not TARGET_UID_HINTS or #TARGET_UID_HINTS == 0 then
    return false
  end
  local u = (uid or ""):lower()
  for _, hint in ipairs(TARGET_UID_HINTS) do
    hint = (hint or ""):lower()
    if hint ~= "" and u:find(hint, 1, true) then
      return true
    end
  end
  return false
end

local function devicePresentNow()
  local ok, devices = pcall(hs.audiodevice.allDevices)
  if not ok or not devices then
    return false
  end
  for _, dev in ipairs(devices) do
    local okN, n = pcall(function()
      return dev:name()
    end)
    local okU, u = pcall(function()
      return dev:uid()
    end)
    if (okN and nameMatches(n)) or (okU and uidMatches(u)) then
      return true
    end
  end
  return false
end

local function listAudioDevices()
  local ok, devices = pcall(hs.audiodevice.allDevices)
  if not ok or not devices then
    log("allDevices() failed or nil")
    return
  end
  log("--- Audio devices (%d) ---", #devices)
  for _, d in ipairs(devices) do
    local n, u = "", ""
    pcall(function()
      n = d:name() or ""
    end)
    pcall(function()
      u = d:uid() or ""
    end)
    log("  name='%s' uid='%s'", n, u)
  end
  log("--------------------------")
end

-- ---------- Webview/popup ----------
local function cleanupUCC()
  if ucc then
    pcall(function()
      ucc:delete()
    end)
    ucc = nil
  end
end

local function destroyPopup()
  log("Destroying popup")
  if popupTimer then
    popupTimer:stop()
    popupTimer = nil
  end
  if popupWV then
    pcall(function()
      popupWV:hide()
    end)
    pcall(function()
      popupWV:delete()
    end)
    popupWV = nil
  end
  cleanupUCC()
  popupActive = false
  remaining = COUNTDOWN_SECONDS
end

local function centerFrame(width, height)
  local screen = hs.screen.primaryScreen()
  local f = screen:frame()
  local x = f.x + (f.w - width) / 2
  local y = f.y + (f.h - height) / 2
  return hs.geometry.rect(x, y, width, height)
end

local function popupHTML(initialTime)
  return [[
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>REAPER Automation</title>
<style>
  html, body { margin:0; padding:0; background:#1e1e1e; color:#fff;
    font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                  Helvetica, Arial, sans-serif; height:100vh; overflow:hidden; }
  .wrap { box-sizing:border-box; width:100%; height:100%;
          display:flex; align-items:center; justify-content:center;
          padding:20px; }
  .panel { width:100%; max-width:320px; border-radius:12px; background:#1f1f1f;
           box-shadow:0 15px 35px rgba(0,0,0,0.4); padding:24px; text-align:center; }
  .title { font-size:18px; font-weight:600; margin-bottom:8px; color:#fff; }
  .msg { font-size:14px; line-height:1.4; opacity:0.9; margin:12px 0; }
  .time { font-size:24px; font-weight:700; color:#4bd763; margin:16px 0;
          font-family:monospace; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
  .btnrow { display:flex; gap:12px; justify-content:center; margin-top:20px; }
  .btn { appearance:none; border:none; border-radius:8px; padding:10px 20px;
         font-size:14px; font-weight:500; cursor:pointer; flex:1;
         transition: all 0.2s ease; }
  .continue { background:#0a84ff; color:#fff; }
  .continue:hover { background:#007aff; }
  .cancel { background:#3c3c43; color:#fff; }
  .cancel:hover { background:#2c2c2e; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <div class="title">Quantum 2626 Disconnected</div>
      <div class="msg">REAPER will be saved and closed:</div>
      <div class="time" id="timeLeft">]] .. initialTime .. [[</div>
      <div class="msg">Continue now, or Cancel to abort.</div>
      <div class="btnrow">
        <button class="btn continue" id="continueBtn">Continue</button>
        <button class="btn cancel" id="cancelBtn">Cancel</button>
      </div>
    </div>
  </div>
<script>
  function init() {
    const post = (action) => {
      try {
        if (window.webkit && window.webkit.messageHandlers &&
            window.webkit.messageHandlers.reaperPopup) {
          window.webkit.messageHandlers.reaperPopup.postMessage({ action });
        }
      } catch(e) { /* no-op */ }
    };
    const c = document.getElementById('continueBtn');
    const k = document.getElementById('cancelBtn');
    if (c) c.addEventListener('click', (e) => { e.preventDefault(); post('continue'); });
    if (k) k.addEventListener('click', (e) => { e.preventDefault(); post('cancel'); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && c) c.click();
      if (e.key === 'Escape' && k) k.click();
    });
    if (c) c.focus();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();
</script>
</body>
</html>
  ]]
end

local function updateTimeLabel()
  if not popupWV then
    return
  end
  local m = math.floor(remaining / 60)
  local s = remaining % 60
  local t = string.format("%d:%02d", m, s)
  local color = remaining <= 30 and "#ff6b6b" or "#4bd763"
  local js = [[
    (function(){
      var el = document.getElementById('timeLeft');
      if (!el) return;
      el.textContent = ']] .. t .. [[';
      el.style.color = ']] .. color .. [[';
    })();
  ]]
  pcall(function()
    popupWV:evaluateJavaScript(js)
  end)
end

-- forward decl
local saveQuitThenMaybeSleep

local function startPopupTimer()
  hs.timer.doAfter(0.5, updateTimeLabel)
  popupTimer = hs.timer.new(1, function()
    remaining = remaining - 1
    if remaining <= 0 then
      destroyPopup()
      hs.timer.doAfter(0.05, function()
        saveQuitThenMaybeSleep()
      end)
      return
    end
    updateTimeLabel()
  end)
  popupTimer:start()
end

local function showCountdownPopup()
  if popupActive then
    destroyPopup()
  end
  popupActive = true
  remaining = COUNTDOWN_SECONDS

  cleanupUCC()
  ucc = hs.webview.usercontent.new("reaperPopup")
  ucc:setCallback(function(msg)
    local action = msg and msg.body
    if type(action) == "table" then
      action = action.action
    end
    if action == "continue" then
      destroyPopup()
      saveQuitThenMaybeSleep()
    elseif action == "cancel" then
      destroyPopup()
      dismissedUntilReconnect = true
      hs.alert.show(
        "Countdown canceled. Will not prompt again until Quantum reconnects."
      )
    end
  end)

  local frame = centerFrame(380, 260)
  popupWV = hs.webview.new(
    frame,
    { developerExtrasEnabled = false, automaticallyShowsMenuBar = false },
    ucc
  )
  local initialTime = string.format(
    "%d:%02d",
    math.floor(remaining / 60),
    remaining % 60
  )
  popupWV:html(popupHTML(initialTime))
  pcall(function()
    popupWV:level(hs.drawing.windowLevels.modalPanel)
  end)
  pcall(function()
    popupWV:bringToFront(true)
  end)
  pcall(function()
    popupWV:allowTextEntry(true)
  end)
  pcall(function()
    popupWV:closeOnEscape(false)
  end)
  hs.timer.doAfter(0.1, function()
    if popupWV then
      popupWV:show()
      hs.timer.doAfter(0.3, updateTimeLabel)
    end
  end)

  startPopupTimer()
  hs.alert.show("Quantum 2626 disconnected. 5-minute countdown started.")
  log("Popup shown (countdown started)")
end

-- ---------- Frontmost/Save/Quit helpers ----------
local function frontIsReaper(app)
  local front = hs.application.frontmostApplication()
  if not front or not app then
    return false
  end
  local fb, rb = nil, nil
  pcall(function()
    fb = front:bundleID()
  end)
  pcall(function()
    rb = app:bundleID()
  end)
  return (fb and rb and fb == rb) or app:isFrontmost()
end

local function getReaperApp()
  -- Only return if already running; do NOT launch
  return hs.application.get(REAPER_APP)
end

local function focusReaperIfRunning(timeout)
  timeout = timeout or 2.0
  local app = getReaperApp()
  if not app then
    log("REAPER not running; skip focus")
    return nil, false
  end
  app:activate(true)
  local elapsed, step = 0.0, 0.1
  while elapsed < timeout do
    if frontIsReaper(app) then
      log("Focus OK (%.1fs)", elapsed)
      return app, true
    end
    hs.timer.usleep(step * 1e6)
    elapsed = elapsed + step
  end
  log("Focus not confirmed (%.1fs)", timeout)
  return app, false
end

local function menuSaveOrKeystroke(app)
  if not app then
    return
  end
  local did = false
  local function try(path)
    local ok = false
    pcall(function()
      ok = app:selectMenuItem(path)
    end)
    return ok
  end
  did = try({ "File", "Save project" }) or did
  did = try({ "File", "Save" }) or did
  if not did then
    pcall(function()
      hs.eventtap.keyStroke({ "cmd" }, "s", 0)
    end)
  end
end

local function menuQuitOrKeystroke(app)
  if not app then
    return
  end
  local did = false
  local function try(path)
    local ok = false
    pcall(function()
      ok = app:selectMenuItem(path)
    end)
    return ok
  end
  did = try({ "REAPER", "Quit REAPER" }) or did
  did = try({ "Reaper", "Quit REAPER" }) or did
  did = try({ "REAPER", "Quit" }) or did
  if not did then
    pcall(function()
      hs.eventtap.keyStroke({ "cmd" }, "q", 0)
    end)
  end
end

-- ---------- Save → Quit → Verify → Sleep ----------
function saveQuitThenMaybeSleep(opts)
  opts = opts or {}
  local focusTimeout = opts.focusTimeout or 2.0
  local quitGrace = opts.quitGrace or 20.0 -- total time to wait for exit
  local killAfter = opts.killAfter or 6.0 -- when to force kill if still up
  local pollInterval = opts.pollInterval or 0.2
  local doSleep = opts.sleepAfter ~= false and SLEEP_AFTER_ACTION

  log("Save/Quit pipeline start")

  -- 1) Only act if REAPER is already running (do NOT launch here)
  local app, focused = focusReaperIfRunning(focusTimeout)
  local hadApp = app ~= nil
  if hadApp then
    if not focused then
      log("Proceeding without confirmed focus")
    end
    menuSaveOrKeystroke(app)
  else
    log("REAPER not running; nothing to save/quit")
  end

  -- 2) Request quit, then poll until gone (force-kill if needed)
  hs.timer.doAfter(0.6, function()
    if not hadApp then
      if doSleep then
        log("No REAPER running; sleeping now")
        pendingReconnectAutolaunch = true
        hs.timer.doAfter(0.5, function()
          log("Invoking system sleep")
          hs.caffeinate.systemSleep()
        end)
      end
      return
    end

    local a = getReaperApp()
    if a then
      menuQuitOrKeystroke(a)
    end

    local elapsed, killed = 0.0, false
    local waiter = nil
    waiter = hs.timer.new(pollInterval, function()
      elapsed = elapsed + pollInterval
      local still = getReaperApp()

      if not still then
        if waiter then
          waiter:stop()
          waiter = nil
        end
        hs.alert.show("REAPER saved and quit.")
        log("REAPER exit verified (%.1fs); sleep=%s", elapsed, tostring(doSleep))
        if doSleep then
          hs.timer.doAfter(0.5, function()
            log("Invoking system sleep")
            pendingReconnectAutolaunch = true
            hs.caffeinate.systemSleep()
          end)
        end
        return
      end

      if elapsed >= killAfter and not killed then
        killed = true
        log("Force-killing REAPER at %.1fs", elapsed)
        hs.alert.show("REAPER didn't quit; forcing kill.")
        pcall(function()
          still:kill()
        end)
      end

      if killed and elapsed >= (killAfter + 5.0) then
        local pid = still:pid()
        if pid then
          log("Escalating kill -9 to pid %d", pid)
          hs.execute(string.format("/bin/kill -9 %d", pid))
        end
      end

      if elapsed >= quitGrace then
        if waiter then
          waiter:stop()
          waiter = nil
        end
        local alive = getReaperApp() ~= nil
        log(
          "Quit wait timeout (alive=%s); sleep=%s",
          tostring(alive),
          tostring(doSleep)
        )
        if doSleep then
          hs.timer.doAfter(0.5, function()
            log("Invoking system sleep (timeout path)")
            pendingReconnectAutolaunch = true
            hs.caffeinate.systemSleep()
          end)
        end
      end
    end)
    if waiter then
      waiter:start()
    end
  end)
end

-- ---------- State machine ----------
local function applyState(nowConnected)
  if nowConnected and not isConnected then
    isConnected = true
    dismissedUntilReconnect = false
    if popupActive then
      destroyPopup()
    end
    log("Reconnected (state change)")
    hs.alert.show("Quantum 2626 reconnected. Countdown canceled.")
    -- Fallback autolaunch: if we recently initiated sleep (or within wake window),
    -- launch REAPER once when the device reconnects.
    if pendingReconnectAutolaunch then
      pendingReconnectAutolaunch = false
      hs.timer.doAfter(2.0, function()
        launchReaperIfWanted("autolaunch-on-reconnect")
      end)
    elseif LAUNCH_ON_WAKE and now() < wakeHintUntil then
      hs.timer.doAfter(2.0, function()
        launchReaperIfWanted("reconnectWithinWakeWindow")
      end)
    end
  elseif (not nowConnected) and isConnected then
    isConnected = false
    log("Disconnected (state change)")
    if not dismissedUntilReconnect and not popupActive then
      showCountdownPopup()
    else
      log(
        "Popup suppressed (dismissedUntilReconnect=%s)",
        tostring(dismissedUntilReconnect)
      )
    end
  end
end

local function debouncedCheck()
  if debounceTimer then
    pcall(function()
      debounceTimer:stop()
    end)
    debounceTimer = nil
  end
  debounceTimer = hs.timer.doAfter(0.25, function()
    debounceTimer = nil
    applyState(devicePresentNow())
  end)
end

-- ---------- Detection setup/restart ----------
local function startPoller()
  if pollTimer then
    pollTimer:stop()
    pollTimer = nil
  end
  pollTimer = hs.timer.doEvery(POLL_INTERVAL, debouncedCheck)
  log("Poller running every %ds", POLL_INTERVAL)
end

local function restartDetection(reason)
  log("Restarting detection (%s)", reason or "unknown")
  if pollTimer then
    pollTimer:stop()
    pollTimer = nil
  end
  debounceTimer = nil
  startPoller()
  isConnected = devicePresentNow()
  log("Current device state: %s", isConnected and "connected" or "disconnected")
end

-- ---------- Wake handling & REAPER launch ----------
function launchReaperIfWanted(tag)
  tag = tag or "wake"
  if LAUNCH_ONLY_IF_DEVICE_PRESENT and not devicePresentNow() then
    log("[%s] Not launching: device not present", tag)
    return
  end
  if hs.application.get(REAPER_APP) then
    log("[%s] REAPER already running", tag)
    return
  end
  local ok = hs.application.launchOrFocusByBundleID(REAPER_BUNDLE_ID)
  if not ok then
    hs.execute("/usr/bin/open -b " .. REAPER_BUNDLE_ID, true)
  end
  hs.timer.doAfter(2.5, function()
    if hs.application.get(REAPER_APP) then
      hs.alert.show("REAPER launched after wake.")
      log("[%s] REAPER launch verified", tag)
    else
      log("[%s] REAPER not up after 2.5s", tag)
    end
  end)
end

local caffeinateWatcher = hs.caffeinate.watcher.new(function(event)
  if event == hs.caffeinate.watcher.systemDidWake then
    log("systemDidWake")
    wakeHintUntil = now() + RECONNECT_LAUNCH_WINDOW
    -- After OS wake, give CoreAudio and login session some time
    restartDetection("systemDidWake")
    hs.timer.doAfter(WAKE_LAUNCH_DELAY, function()
      launchReaperIfWanted("wake+t+" .. WAKE_LAUNCH_DELAY)
    end)
    for _, d in ipairs(WAKE_LAUNCH_RETRY_DELAYS) do
      hs.timer.doAfter(d, function()
        launchReaperIfWanted("wake+t+" .. d)
      end)
    end
  elseif
    event == hs.caffeinate.watcher.screensDidUnlock
    or event == hs.caffeinate.watcher.sessionDidBecomeActive
  then
    -- When the session is active again (user unlocked), rescan
    log("session active/unlocked -> rescan and (maybe) launch")
    wakeHintUntil = now() + RECONNECT_LAUNCH_WINDOW
    restartDetection("sessionActive")
    hs.timer.doAfter(3, function()
      launchReaperIfWanted("sessionActive+t+3")
    end)
  elseif event == hs.caffeinate.watcher.screensDidWake then
    log("screensDidWake")
    wakeHintUntil = now() + RECONNECT_LAUNCH_WINDOW
    -- No immediate launch here; detection will pick up device
  end
end)
caffeinateWatcher:start()
hs.alert.show("REAPER wake launcher loaded.")

-- ---------- Start detection ----------
restartDetection("init")

-- ---------- Manual hotkeys ----------
-- Ctrl+Cmd+0 → manual restart of detection
hs.hotkey.bind({ "ctrl", "cmd" }, "0", function()
  restartDetection("manual")
  hs.alert.show("Quantum detector restarted (manual).")
end)

-- Ctrl+Cmd+9 → dump audio devices
hs.hotkey.bind({ "ctrl", "cmd" }, "9", function()
  listAudioDevices()
  hs.alert.show("Listed audio devices in console.")
end)
```