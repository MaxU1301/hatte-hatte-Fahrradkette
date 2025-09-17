---
hide:
  - toc
---

# ReaScript: Big Buttons UI

This document details the "Big Buttons" ReaScript, a custom tool designed to provide a simple, dockable user interface within REAPER for triggering common actions.

## Overview

This script uses the **ReaImGui** library to create a window containing large, easy-to-click buttons. It is fully configurable through a built-in settings panel, allowing you to create a custom layout of actions tailored to your workflow, such as refreshing audio and MIDI devices.

This script currently serves as a lightweight and functional UI, with plans to eventually replace it with the more advanced and versatile **[Control-Canvas](https://github.com/MaxU1301/Control-Canvas)** project.

### Core Features

- **Dockable Window:** Can be docked in any of REAPER's docker positions.
- **Fully Configurable:** Add, remove, re-label, and re-colorize buttons from a built-in settings window.
- **Flexible Actions:** Buttons can trigger any REAPER action using its native number or its named command ID (e.g., `_SWS_ABOUT`).
- **Toggle State Highlighting:** Buttons for toggle actions (like Metronome or Repeat) change color to reflect their on/off state.
- **External Configuration:** All settings (buttons, sizes, colors) are saved to an external `.cfg` file, making your layout portable and easy to back up.

## Installation & Usage

### Prerequisites

1.  **ReaPack:** Must be installed.
2.  **ReaImGui:** Must be installed via ReaPack.

(See the main [Studio Setup](../current-setup.md) page for instructions on installing these prerequisites).

### Installation Steps

1.  In REAPER, go to the `Options` menu and select `Show REAPER resource path in explorer/finder...`.
2.  Open the `Scripts` folder.
3.  Save the code below into a new file inside the `Scripts` folder. Name it something memorable, like `Big Buttons.lua`.
4.  In REAPER, go to `Actions` > `Show action list...`.
5.  Click `New action...` > `Load ReaScript...`.
6.  Select `Big Buttons.lua` and click `Open`.

### Running the Script

1.  In REAPER, go to `Actions` > `Show action list...`.
2.  In the filter box, type the name of your script file (e.g., "Big Buttons").
3.  Select the script and click `Run`.
4.  For easy access, you can assign the script to a toolbar button or a keyboard shortcut by clicking the `Add...` button in the bottom left of the Action List window.

## Configuration

All configuration is handled through the script's own graphical interface.

-   To access the settings, click `Options` > `Settings...` in the menu bar of the "Big Buttons" window.
-   The script will automatically create a `Big Buttons.cfg` file in the same `Scripts` directory to store your layout and color preferences. You do not need to edit this file manually.

## Complete `Big Buttons.lua` Script

```lua
--[[
Big Buttons (dockable) – ReaImGui script for REAPER
Author: Max
Version: 2.0 (With external settings file and editor)

What it does:
- Creates a dockable ImGui window with large, easy-to-click buttons.
- Buttons are now fully configurable via a Settings window.
- Each button runs a REAPER action (native ID or named command).
- Optional highlight for toggle-type actions.
- Configuration (buttons, sizes) is saved to a .cfg file.
- Optionally docks itself the first time it runs.

Requirements:
- ReaImGui (reaimgui) by cfillion installed ([https://github.com/cfillion/reaimgui](https://github.com/cfillion/reaimgui))
- This script is plain Lua. Save it as a ReaScript and run from REAPER.

How to Configure:
- In the script window, go to "Options" -> "Settings..." to open the editor.
- Add, remove, or change buttons. Changes are saved automatically.
--]]

-- ============================================================================
-- Default Config (used only if .cfg file is missing)
-- ============================================================================

local WINDOW_TITLE = "Big Buttons"
local DEFAULT_DOCKER_ID = -1 -- REAPER docker 1 (-1..-16). Only first run.
local TRUE_DEFAULT_COLOR_OFF = 0x25466EFF
local TRUE_DEFAULT_COLOR_ON = 0x2E7D32FF

-- Default UI settings
local DEFAULT_UI = {
    font_size = 24,
    btn_w = 180,
    btn_h = 64,
    first_run = true,
    show_settings = false,
    next_uid = 100,
    always_on_top = false,
    settings_font_size = 16,
    title_font_size = 18, -- <<< ADD THIS
    default_color_off = TRUE_DEFAULT_COLOR_OFF,
    default_color_on = TRUE_DEFAULT_COLOR_ON,
    color_bg = nil,
    color_titlebar = nil
}

-- Default buttons (only used on the very first run)
local DEFAULT_ACTIONS = {
    { uid = 1, label = "Record",    cmd = "1013",       toggle = false, color_off = nil, color_on = 0x2E7D32FF },
    { uid = 2, label = "Play",      cmd = "40044",      toggle = false, color_off = nil, color_on = 0x2E7D32FF },
    { uid = 3, label = "Stop",      cmd = "1016",       toggle = false, color_off = nil, color_on = 0x2E7D32FF },
    { uid = 4, label = "Repeat",    cmd = "1068",       toggle = true,  color_off = nil, color_on = 0x2E7D32FF },
    { uid = 5, label = "Save",      cmd = "40026",      toggle = false, color_off = nil, color_on = 0x2E7D32FF },
    { uid = 6, label = "Metronome", cmd = "40364",      toggle = true,  color_off = nil, color_on = 0x2E7D32FF },
    { uid = 7, label = "SWS About", cmd = "_SWS_ABOUT", toggle = false, color_off = nil, color_on = 0x2E7D32FF }
}

-- ============================================================================
-- Minimal boilerplate
-- ============================================================================

package.path = reaper.ImGui_GetBuiltinPath() .. "/?.lua"
local ImGui = require("imgui")("0.10")

local ctx = ImGui.CreateContext(WINDOW_TITLE)

-- Runtime state (loaded from file)
local ui = {}
local ACTIONS = {}
local pending_deletions = {}

-- ============================================================================
-- File and Settings Management
-- ============================================================================

-- Get the path for our .cfg file
local SCRIPT_PATH = debug.getinfo(1, "S").source:sub(2)
local CFG_PATH = SCRIPT_PATH:gsub("%.lua$", ".cfg")

-- Serializes a Lua table into a string that can be executed
local function serialize(data)
    local s = "return {\n"

    -- Serialize UI settings
    s = s .. "  ui = {\n"
    for k, v in pairs(data.ui) do
        -- ### Handle custom color nils ###
        if k == 'color_bg' or k == 'color_titlebar' then
            s = s .. string.format("    %s = %s,\n", k, v and string.format("0x%X", v) or "nil")
        elseif type(v) == "string" then
            s = s .. string.format("    %s = [[%s]],\n", k, v)
        elseif type(v) == "boolean" then
            s = s .. string.format("    %s = %s,\n", k, tostring(v))
        else
            s = s .. string.format("    %s = %s,\n", k, v)
        end
    end
    s = s .. "  },\n"

    -- Serialize Actions (unchanged from before)
    s = s .. "  actions = {\n"
    for _, action in ipairs(data.actions) do
        s = s .. "    {\n"
        s = s .. string.format("      uid = %d,\n", action.uid)
        s = s .. string.format("      label = [[%s]],\n", action.label)
        s = s .. string.format("      cmd = [[%s]],\n", action.cmd)
        s = s .. string.format("      toggle = %s,\n", tostring(action.toggle))
        s = s .. string.format("      color_off = %s,\n", action.color_off and string.format("0x%X", action.color_off) or "nil")
        s = s .. string.format("      color_on = 0x%X,\n", action.color_on)
        s = s .. "    },\n"
    end
    s = s .. "  }\n"

    s = s .. "}\n"
    return s
end

local function save_settings()
    local file = io.open(CFG_PATH, "w")
    if file then
        local data_to_save = { ui = ui, actions = ACTIONS }
        file:write(serialize(data_to_save))
        file:close()
    else
        reaper.ShowMessageBox("Failed to save settings to:\n" .. CFG_PATH, "Big Buttons Error", 0)
    end
end

local function load_settings()
    local file = io.open(CFG_PATH, "r")
    if file then
        file:close()
        local data = dofile(CFG_PATH)
        if data and data.ui and data.actions then
            ui = data.ui
            ACTIONS = data.actions
            -- Ensure settings flag is always false on start
            ui.show_settings = false

            -- ### BACKWARD COMPATIBILITY ###
            if ui.always_on_top == nil then ui.always_on_top = false end
            if ui.settings_font_size == nil then ui.settings_font_size = DEFAULT_UI.settings_font_size end
            if ui.title_font_size == nil then ui.title_font_size = DEFAULT_UI.title_font_size end
            if ui.default_color_off == nil then ui.default_color_off = TRUE_DEFAULT_COLOR_OFF end
            if ui.default_color_on == nil then ui.default_color_on = TRUE_DEFAULT_COLOR_ON end
            if ui.color_bg == nil then ui.color_bg = nil end
            if ui.color_titlebar == nil then ui.color_titlebar = nil end
            for _, action in ipairs(ACTIONS) do
                if action.color_off == nil and action.color_on == nil then
                    action.color_off = nil
                    action.color_on = ui.default_color_on
                end
            end
            return
        end
    end

    -- If file doesn't exist or is invalid, use defaults
    for k, v in pairs(DEFAULT_UI) do ui[k] = v end
    for _, action in ipairs(DEFAULT_ACTIONS) do table.insert(ACTIONS, action) end
    save_settings() -- Create the first config file
end

-- ============================================================================
-- Utilities
-- ============================================================================

local function resolve_cmd_id(cmd)
    local num = tonumber(cmd)
    if num then
        return num
    elseif type(cmd) == "string" and cmd ~= "" then
        return reaper.NamedCommandLookup(cmd)
    end
    return 0
end

local function is_toggle_on(cmd_id)
    if not cmd_id or cmd_id <= 0 then return false end
    return reaper.GetToggleCommandState(cmd_id) == 1
end

local function run_action(cmd)
    local id = resolve_cmd_id(cmd)
    if id and id > 0 then
        reaper.Main_OnCommand(id, 0)
    else
        reaper.ShowMessageBox(
            string.format("Invalid command ID for button: '%s'", tostring(cmd)),
            WINDOW_TITLE,
            0
        )
    end
end

-- ============================================================================
-- UI
-- ============================================================================

local function draw_settings_window()
    if not ui.show_settings then return end
    
    -- Apply custom window colors
    local pushed_colors = 0
    if ui.color_bg then
        ImGui.PushStyleColor(ctx, ImGui.Col_WindowBg, ui.color_bg)
        pushed_colors = pushed_colors + 1
    end
    if ui.color_titlebar then
        ImGui.PushStyleColor(ctx, ImGui.Col_TitleBgActive, ui.color_titlebar)
        ImGui.PushStyleColor(ctx, ImGui.Col_TitleBg, ui.color_titlebar)
        pushed_colors = pushed_colors + 2
    end

    ImGui.PushFont(ctx, nil, ui.title_font_size) -- Use new title font for settings window title

    ImGui.SetNextWindowSize(ctx, 700, 500, ImGui.Cond_FirstUseEver)
    local visible, show_window_updated = ImGui.Begin(ctx, "Button Settings", ui.show_settings)
    ui.show_settings = show_window_updated
    
    ImGui.PopFont(ctx) -- Pop title font, switch to content font below

    if visible then
        ImGui.PushFont(ctx, nil, ui.settings_font_size) -- Use settings content font
        if ImGui.BeginTabBar(ctx, "SettingsTabs") then
            -- ### BUTTONS TAB ###
            if ImGui.BeginTabItem(ctx, "Buttons") then
                local footer_height = ImGui.GetStyleVar(ctx, ImGui.StyleVar_ItemSpacing) + ImGui.GetFrameHeightWithSpacing(ctx)
                if ImGui.BeginChild(ctx, "SettingsScrollingRegion", 0, -footer_height) then
                    local action_to_delete = nil
                    local needs_save = false
                    if ImGui.BeginTable(ctx, "settings_table", 6, ImGui.TableFlags_Borders | ImGui.TableFlags_Resizable | ImGui.TableFlags_ScrollY) then
                        ImGui.TableSetupColumn(ctx, "Label"); ImGui.TableSetupColumn(ctx, "Command ID"); ImGui.TableSetupColumn(ctx, "Toggle?", ImGui.TableColumnFlags_WidthFixed, 60); ImGui.TableSetupColumn(ctx, "Color Off", ImGui.TableColumnFlags_WidthFixed, 95); ImGui.TableSetupColumn(ctx, "Color On", ImGui.TableColumnFlags_WidthFixed, 95); ImGui.TableSetupColumn(ctx, "Actions", ImGui.TableColumnFlags_WidthFixed, 80); ImGui.TableHeadersRow(ctx)
                        for i, action in ipairs(ACTIONS) do
                            ImGui.PushID(ctx, action.uid)
                            ImGui.TableNextRow(ctx)
                            ImGui.TableNextColumn(ctx); ImGui.SetNextItemWidth(ctx, -1); local l_ch, l_new = ImGui.InputText(ctx, "##label", action.label); if l_ch then action.label = l_new; needs_save = true end
                            ImGui.TableNextColumn(ctx); ImGui.SetNextItemWidth(ctx, -1); local c_ch, c_new = ImGui.InputText(ctx, "##cmd", action.cmd);   if c_ch then action.cmd = c_new; needs_save = true end
                            ImGui.TableNextColumn(ctx); local t_ch, t_new = ImGui.Checkbox(ctx, "##toggle", action.toggle); if t_ch then action.toggle = t_new; needs_save = true end
                            ImGui.TableNextColumn(ctx); local co_ch, co_new = ImGui.ColorEdit4(ctx, "##off", action.color_off or ui.default_color_off, ImGui.ColorEditFlags_NoInputs | ImGui.ColorEditFlags_AlphaBar); if co_ch then action.color_off = co_new; needs_save = true end
                            ImGui.SameLine(ctx); if ImGui.Button(ctx, "(R)##off") then action.color_off = nil; needs_save = true end; ImGui.SetItemTooltip(ctx, "Reset to default 'off' color")
                            ImGui.TableNextColumn(ctx); local cn_ch, cn_new = ImGui.ColorEdit4(ctx, "##on", action.color_on or ui.default_color_on, ImGui.ColorEditFlags_NoInputs | ImGui.ColorEditFlags_AlphaBar); if cn_ch then action.color_on = cn_new; needs_save = true end
                            ImGui.SameLine(ctx); if ImGui.Button(ctx, "(R)##on") then action.color_on = ui.default_color_on; needs_save = true end; ImGui.SetItemTooltip(ctx, "Reset to default 'on' color")
                            ImGui.TableNextColumn(ctx);
                            local is_pending_delete = pending_deletions[action.uid]
                            if is_pending_delete then
                                if ImGui.GetTime(ctx) > is_pending_delete + 3.0 then pending_deletions[action.uid] = nil
                                else
                                    local col, colH, colA = 0xB71C1CFF, 0xC62828FF, 0xD32F2FFF
                                    ImGui.PushStyleColor(ctx, ImGui.Col_Button, col); ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, colH); ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, colA)
                                    if ImGui.Button(ctx, "Confirm") then action_to_delete = i; needs_save = true; pending_deletions[action.uid] = nil end
                                    ImGui.PopStyleColor(ctx, 3)
                                end
                            end
                            if not pending_deletions[action.uid] then
                                if ImGui.Button(ctx, "Delete") then pending_deletions[action.uid] = ImGui.GetTime(ctx) end
                            end
                            ImGui.PopID(ctx)
                        end
                        ImGui.EndTable(ctx)
                    end
                    if action_to_delete then table.remove(ACTIONS, action_to_delete) end
                    if needs_save then save_settings() end
                end
                ImGui.EndChild(ctx)
                if ImGui.Button(ctx, "Add New Button") then
                    table.insert(ACTIONS, { uid = ui.next_uid, label = "New Button", cmd = "", toggle = false, color_off = nil, color_on = ui.default_color_on })
                    ui.next_uid = ui.next_uid + 1
                    save_settings()
                end
                ImGui.EndTabItem(ctx)
            end

            -- ### UI SETTINGS TAB ###
            if ImGui.BeginTabItem(ctx, "UI Settings") then
                ImGui.SeparatorText(ctx, "Sizing")
                ImGui.SetNextItemWidth(ctx, 150); local tfs_ch, tfs = ImGui.SliderInt(ctx, "Title/Menu font size", ui.title_font_size, 10, 48, "%d px"); if tfs_ch then ui.title_font_size = tfs; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##tfs") then ui.title_font_size = DEFAULT_UI.title_font_size; save_settings() end
                ImGui.SetNextItemWidth(ctx, 150); local sfs_ch, sfs = ImGui.SliderInt(ctx, "Settings font size", ui.settings_font_size, 10, 32, "%d px"); if sfs_ch then ui.settings_font_size = sfs; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##sfs") then ui.settings_font_size = DEFAULT_UI.settings_font_size; save_settings() end
                ImGui.SetNextItemWidth(ctx, 150); local fs_ch, fs = ImGui.SliderInt(ctx, "Content font size", ui.font_size, 10, 64, "%d px"); if fs_ch then ui.font_size = fs; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##fs") then ui.font_size = DEFAULT_UI.font_size; save_settings() end
                ImGui.SetNextItemWidth(ctx, 150); local bw_ch, bw = ImGui.SliderInt(ctx, "Button width", ui.btn_w, 80, 400, "%d px"); if bw_ch then ui.btn_w = bw; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##bw") then ui.btn_w = DEFAULT_UI.btn_w; save_settings() end
                ImGui.SetNextItemWidth(ctx, 150); local bh_ch, bh = ImGui.SliderInt(ctx, "Button height", ui.btn_h, 40, 240, "%d px"); if bh_ch then ui.btn_h = bh; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##bh") then ui.btn_h = DEFAULT_UI.btn_h; save_settings() end
                
                ImGui.SeparatorText(ctx, "Default Button Colors")
                local dco_ch, dco_new = ImGui.ColorEdit4(ctx, "Default Off Color", ui.default_color_off, ImGui.ColorEditFlags_AlphaBar)
                if dco_ch then ui.default_color_off = dco_new; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##dco") then ui.default_color_off = TRUE_DEFAULT_COLOR_OFF; save_settings() end

                local dcn_ch, dcn_new = ImGui.ColorEdit4(ctx, "Default On Color", ui.default_color_on, ImGui.ColorEditFlags_AlphaBar)
                if dcn_ch then ui.default_color_on = dcn_new; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##dcn") then ui.default_color_on = TRUE_DEFAULT_COLOR_ON; save_settings() end

                ImGui.SeparatorText(ctx, "Window Colors")
                local bg_ch, bg_new = ImGui.ColorEdit4(ctx, "Background Color", ui.color_bg or 0, ImGui.ColorEditFlags_AlphaBar)
                if bg_ch then ui.color_bg = bg_new; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##bg") then ui.color_bg = nil; save_settings() end

                local tb_ch, tb_new = ImGui.ColorEdit4(ctx, "Title Bar Color", ui.color_titlebar or 0, ImGui.ColorEditFlags_AlphaBar)
                if tb_ch then ui.color_titlebar = tb_new; save_settings() end
                ImGui.SameLine(ctx); if ImGui.Button(ctx, "Reset##tb") then ui.color_titlebar = nil; save_settings() end

                ImGui.EndTabItem(ctx)
            end

            ImGui.EndTabBar(ctx)
        end
        ImGui.PopFont(ctx) -- Pop content font
        ImGui.End(ctx)
    end
    
    -- Pop custom window colors
    if pushed_colors > 0 then
        ImGui.PopStyleColor(ctx, pushed_colors)
    end
end

local function draw_menu_bar()
    if ImGui.BeginMenuBar(ctx) then
        if ImGui.BeginMenu(ctx, "Options") then
            if ImGui.MenuItem(ctx, "Settings...") then
                ui.show_settings = not ui.show_settings
            end

            ImGui.Separator(ctx)

            local toggled, new_state = ImGui.MenuItem(ctx, "Always on top", nil, ui.always_on_top)
            if toggled then
                ui.always_on_top = new_state
                save_settings()
            end

            ImGui.EndMenu(ctx)
        end
        ImGui.EndMenuBar(ctx)
    end
end

local function draw_buttons_grid()
    -- Helper to generate brighter/darker shades for button states
    local function generate_button_colors(base_color)
        local r = (base_color >> 24) & 0xFF; local g = (base_color >> 16) & 0xFF; local b = (base_color >> 8) & 0xFF; local a = base_color & 0xFF
        local function clamp(val) return math.max(0, math.min(255, val)) end
        local col_h = (clamp(r + 20) << 24) | (clamp(g + 20) << 16) | (clamp(b + 20) << 8) | a
        local col_a = (clamp(r - 20) << 24) | (clamp(g - 20) << 16) | (clamp(b - 20) << 8) | a
        return base_color, col_h, col_a
    end

    local spacing_x = select(1, ImGui.GetStyleVar(ctx, ImGui.StyleVar_ItemSpacing))
    local avail_w = ImGui.GetContentRegionAvail(ctx)
    local cols = math.max(1, math.floor((avail_w + spacing_x) / (ui.btn_w + spacing_x)))

    if #ACTIONS > 0 and ImGui.BeginTable(ctx, "grid", cols) then
        for _, a in ipairs(ACTIONS) do
            ImGui.PushID(ctx, a.uid)
            ImGui.TableNextColumn(ctx)

            local cmd_id = resolve_cmd_id(a.cmd)
            local on = a.toggle and is_toggle_on(cmd_id)
            local use_custom_color = false
            
            local color_to_use = nil
            if on then
                color_to_use = a.color_on or ui.default_color_on
            else
                color_to_use = a.color_off or ui.default_color_off
            end

            if color_to_use then
                local col, colH, colA = generate_button_colors(color_to_use)
                ImGui.PushStyleColor(ctx, ImGui.Col_Button, col)
                ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, colH)
                ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, colA)
                use_custom_color = true
            end

            if ImGui.Button(ctx, a.label, ui.btn_w, ui.btn_h) then
                run_action(a.cmd)
            end

            if use_custom_color then ImGui.PopStyleColor(ctx, 3) end
            ImGui.PopID(ctx)
        end
        ImGui.EndTable(ctx)
    end
end
-- ============================================================================
-- Main loop
-- ============================================================================

load_settings()

local function loop()
    if ui.first_run then
        ImGui.SetNextWindowDockID(ctx, DEFAULT_DOCKER_ID)
        ui.first_run = false
        save_settings()
    end

    -- Apply custom window colors
    local pushed_colors = 0
    if ui.color_bg then
        ImGui.PushStyleColor(ctx, ImGui.Col_WindowBg, ui.color_bg)
        pushed_colors = pushed_colors + 1
    end
    if ui.color_titlebar then
        ImGui.PushStyleColor(ctx, ImGui.Col_TitleBgActive, ui.color_titlebar)
        ImGui.PushStyleColor(ctx, ImGui.Col_TitleBg, ui.color_titlebar)
        pushed_colors = pushed_colors + 2
    end

    -- ### Main "Big Buttons" Window ###
    local window_flags = ImGui.WindowFlags_MenuBar
    if ui.always_on_top then
        window_flags = window_flags | ImGui.WindowFlags_TopMost
    end

    ImGui.PushFont(ctx, nil, ui.title_font_size) -- << PUSH FONT FOR TITLE AND MENU
    local visible, open = ImGui.Begin(ctx, WINDOW_TITLE, true, window_flags)
    
    if visible then
        draw_menu_bar()
        ImGui.PopFont(ctx) -- << POP FONT AFTER MENU BAR

        ImGui.PushFont(ctx, nil, ui.font_size) -- << PUSH FONT FOR BUTTONS
        draw_buttons_grid()
        ImGui.PopFont(ctx) -- << POP FONT FOR BUTTONS

        ImGui.End(ctx)
    else
        ImGui.PopFont(ctx) -- << POP FONT IF WINDOW ISN'T VISIBLE
    end

    -- Pop custom window colors
    if pushed_colors > 0 then
        ImGui.PopStyleColor(ctx, pushed_colors)
    end

    -- Settings Window (drawn as a separate window)
    draw_settings_window()

    if open then
        reaper.defer(loop)
    end
end

reaper.defer(loop)
```
