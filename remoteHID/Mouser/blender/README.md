# Mouser Step Controls for Blender 4.4.3

Small Blender add-on that turns Mouser key taps into fixed-step rotations and
translations. It exists mainly because Blender's keymap UI often refuses to
capture F13–F24 even though Blender's event system supports them; the add-on
creates the F13–F24 bindings from Python.

- **Selected Objects** — rotates/translates selected objects in Object Mode.
- **3D Viewport** — orbits/pans the viewport (not available in camera view).

## Install

1. In Blender 4.4.3: **Edit → Preferences → Add-ons**.
2. Click the gear/popover menu and choose **Install from Disk**.
3. Select `mouser_step_controls.py`.
4. Enable **Mouser Step Controls**.
5. Open its preferences and set:
   - **Rotate step (degrees)**: 5° by default.
   - **Translate step**: 0.1 m by default.
   - **Apply to**: Selected Objects or 3D Viewport.
   - **Axis Space**: Global or Local (object mode).
   - **Pivot**: Individual Origins, Median Point, or 3D Cursor (global object rotation).
6. Leave **Auto-bind F13-F24** enabled. If you disable it or need to recreate the
   bindings, click **Rebind F13-F24**.

## Default bindings

The defaults match Mouser's rx/ry/rz and tx/ty/tz axes:

| Key | Action |
|---|---|
| F13 / F14 | Rotate X + / − |
| F15 / F16 | Rotate Y + / − |
| F17 / F18 | Rotate Z + / − |
| F19 / F20 | Translate X + / − |
| F21 / F22 | Translate Y + / − |
| F23 / F24 | Translate Z + / − |

The bindings are added under **3D View** in Blender's keymap. To use different
Mouser keys, either change the PhoneButtons Mouser bindings to F13–F24, or add
new keymap items for `mouser.rotate_step` / `mouser.translate_step` in
**Preferences → Keymap** and set the Axis/Direction properties on each item.

## Object-mode behaviour

- Operates on selected objects in **Object Mode**.
- **Global + Individual Origins** rotates each object around its own origin
  along the global axis.
- **Global + Median Point / 3D Cursor** rotates the selection around that pivot.
- **Local** rotates/translates around each object's own local axes. Local
  rotation always uses each object's origin; the Pivot setting only affects
  global rotations.
- Translation moves the selection by **Translate step** along the chosen global
  or local axis.
- If both a parent and its child are selected, only the parent is transformed, so
  the child is not transformed twice.
- Each tap pushes one undo step.

## Viewport-mode behaviour

- **F13/F14**: pitch around the view's right axis.
- **F15/F16**: turntable yaw around world Z.
- **F17/F18**: roll around the view direction.
- **F19/F20**: pan left/right.
- **F21/F22**: pan down/up.
- **F23/F24**: move the view centre forward/back along the view direction.
- Leave camera view before using these; changing `region_3d` in camera view is
  not supported and the operator reports a warning.
- Viewport orbit/pan is not an undoable scene change.

## Mouser setup

In PhoneButtons, set the layout's Mouser axes:

- `rx`: `F13` / `F14`
- `ry`: `F15` / `F16`
- `rz`: `F17` / `F18`
- `tx`: `F19` / `F20`
- `ty`: `F21` / `F22`
- `tz`: `F23` / `F24`

Then enable Mouser, save the layout, and run `mouser-capture --gate --udp
<server-ip>:7801`. Hold MB4 to rotate and MB5 to translate as usual.

## Troubleshooting

- **F13 doesn't appear in Blender's keymap UI**: that is expected; use this
  add-on's auto-bind, or bind a normal key (F5–F8, F10, letters, arrows) instead.
- **No rotation/translation**: check **Preferences → Keymap** for the
  `Mouser Step Rotate` and `Mouser Step Translate` entries. The mouse must be over
  the 3D Viewport. Also confirm the server is logging the key (`--debug-keys`)
  and that Blender is the focused window.
- **Keys work in Notepad but not Blender**: Blender and the server must run at
  the same Windows integrity level; UIPI blocks injection into an elevated
  Blender.
- **F13 is received as unknown**: use a key Blender's keymap accepts, or update
  Blender; this add-on cannot make the keymap editor recognize an event type the
  build does not expose.
