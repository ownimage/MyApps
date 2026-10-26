# Mouser - design notes

Context for a fresh session. Read this before changing anything. It records the
decisions that were expensive to reach and the invariants that keep the tool safe
to run on a machine with only one mouse.

Repo: `P:\git\MyApps`, nested app `remoteHID/Mouser`. Current state: **v0.4.0
capture client** with two momentary modes and a control panel; the driver path is
verified and the Python server injects F13–F24 keystrokes. See `README.md` for the
current usage. Parts of this document are the original Phase-0 design record and
are marked accordingly.

---

## The goal

Turn an ordinary mouse into a 6DOF input device on Windows 11. The mouse exposes
three channels — X, Y, wheel — plus two side buttons. Two modes:

- **MB4 held** → rotation: yaw, pitch, roll
- **MB5 held** → translation: X, Y, Z

Three channels times two modes is six degrees of freedom, but only three at once.
That is fine for CAD and DCC navigation and useless for a flight sim. Do not
promise simultaneous 6DOF.

The user has an additional hard requirement: **it must also defeat applications
that read raw input directly**, i.e. games. Everything below follows from that.

---

## Decision 1: a driver, not a hook

`WH_MOUSE_LL` cannot do this job. Raw input is produced from the device stack
*below* the hook chain, so swallowing legacy messages hides motion from the cursor
and from normal apps but not from anything using `WM_INPUT` or DirectInput.

The alternatives were checked and rejected:

| Approach | Why it fails |
|---|---|
| `WH_MOUSE_LL`, return 1 | does not affect raw input; 300 ms callback budget; silently removed on timeout |
| `RIDEV_NOLEGACY` | suppresses legacy synthesis only; other apps' raw input still flows |
| `ClipCursor` / cursor warping | breaks on multi-monitor and DPI, fights other apps, ignores raw input |
| Exclusive HID `CreateFile` | Windows refuses for mouse collections |
| Replace the device driver with WinUSB | then you have no mouse at all |

The chosen mechanism is **Interception** (https://github.com/oblitum/Interception),
a `mouclass` filter driver. Nothing reaches the OS unless the app calls
`interception_send()`, so blocking is the default and pass-through is the special
case.

Accepted costs, already agreed with the user: machine-wide install, admin, reboot,
an old and unmaintained driver, and the possibility that HVCI or anti-cheat
rejects it.

---

## Decision 2: capture runs on the machine with the mouse

RDP does not forward the physical mouse. `mstsc` reads the local pointer and
re-transmits absolute screen coordinates over its own virtual-mouse channel.

Verified empirically on the dev host over RDP:

```
abs=( 7684,27321)     <- MOUSE_MOVE_ABSOLUTE, not stroke deltas
note: device names unavailable on this system (seen on some RDP sessions)
```

`GetRawInputDeviceInfo` also fails there for both `RIDI_DEVICENAME` and
`RIDI_DEVICEINFO`, even with `cbSize` correctly initialised. That is a property of
the session, not a bug in our code.

Therefore:

| Component | Machine |
|---|---|
| Interception + `mouser-capture.exe` | the laptop or desktop the mouse is plugged into |
| `remoteHID/server` + the app | this host, or wherever the app runs |
| Build | anywhere with the .NET 8 SDK |

**The host needs no driver.** While gated, the RDP mouse channel is dead by
design, so the 6DOF stream must travel over a side channel (UDP), not through RDP.

Useful corollary: `mstsc` in relative-mouse mode is itself a raw-input consumer,
which is an independent reason a hook would not have sufficed.

---

## Decision 3: hold-to-engage

Momentary, not toggle. Holding MB4 or MB5 gates motion; releasing restores normal
mouse behaviour. Chosen by the user, and it is the safer default: a crash cannot
strand the machine in a gated state.

Phase 1 originally planned an armed/disarmed supervisor. v0.3 instead keeps the
buttons momentary (no armed state to get stuck in) and lets the server ignore the
mode unless the focused app's layout has Mouser enabled. v0.3.1 consumes the
configured mode buttons in `--gate`, so engaging MB4/MB5 does not also click in the
focused app; `--pass-mode-buttons` restores the old pass-through behaviour.

---

## Decision 4: the host converts motion to keystrokes (v0.3)

The capture client sends 32-byte UDP frames at ~100 Hz: `magic | seq | qpc | dx |
dy | wheel | mode | pad`. The Python server (`remoteHID/server/mouser`) turns
accumulated counts into real F13–F24 presses via `SendInput`, selected by the
focused app's layout. No Blender/Unity add-on is needed.

The original Phase-0 text said the transport was undecided and `--udp` was only a
measurement probe. Keep the capture side behind `Net.cs`; do not couple the UDP
socket into the stroke pump.

---

## Decision 5: C# .NET 8, self-contained, no UI framework

- Console app, `net8.0`, x64 only, published self-contained so the target needs no
  runtime installed (~70 MB, 32 MB zipped).
- **No WinForms.** It was used for one hidden window in the first draft and pulled
  in all of WPF, taking the payload from 70 MB to 144 MB. `RawInput.cs` now creates
  the window with hand-rolled Win32 P/Invoke.
- A user-local SDK was installed on the dev host at `C:\Users\Keith\.dotnet`
  (no admin, no machine-wide change). `build.ps1` finds it automatically.
- **v0.4 amendment - the control panel is a WEB PAGE, not a window.** The client
  needs configuration (which mouse, which mode buttons, where telemetry goes,
  start/stop, live state). Adding WinForms for that would re-open the payload
  problem above, and a desktop form cannot be driven from a phone.
  Instead `--ui` serves a tiny HTTP API plus a QR/address page on a `TcpListener`
  (`ControlPanel.cs`), and the CONFIGURATION UI lives in the PhoneButtons app
  (`Manage mouser-capture`), which already has the shared smd-* components, the
  theme engine and Playwright tests. `System.Net.Sockets` and `System.Text.Json`
  are part of the self-contained runtime, so the panel adds NOTHING to the ~70 MB
  payload (the QR page and the vendored `qrcode.min.js` are embedded resources).
  Deliberately NOT `HttpListener`: an HTTP.sys prefix needs a URL ACL (admin) on
  Windows, which would turn an unelevated start into an obscure failure.
  The target framework moved to `net8.0-windows` (this is a Windows-only binary:
  Win32 P/Invoke throughout) so the platform analyser stops warning about
  `WindowsIdentity`, with no framework reference added.

---

## Code map

| File | Responsibility |
|---|---|
| `capture/Interception.cs` | P/Invoke surface, stroke/mouse structs, hardware-id enumeration |
| `capture/Capture.cs` | stroke pump, gate state, telemetry, UDP framing hand-off, watchdog |
| `capture/CaptureSession.cs` | the session the panel starts/stops: real (pump + reporter + filter) and `--simulate` |
| `capture/CaptureApp.cs` | `--ui` supervisor: routes, `/api/state`, QR page rendering |
| `capture/Config.cs` | `mouser-capture.json` (validate, load, save, token) |
| `capture/ControlPanel.cs` | the management socket: HTTP/1.1 on loopback/LAN, token + CORS |
| `capture/Devices.cs` | Interception slots to Windows friendly names (SetupAPI) |
| `capture/RawWindow.cs` | hidden Win32 window: identify-by-wiggle + the panic hotkey |
| `capture/TunnelRunner.cs` | Cloudflare quick tunnel (cloudflared child, URL parse, kill on exit) |
| `capture/RawInput.cs` | hidden Win32 window, `RIDEV_INPUTSINK`, the raw-input witness |
| `capture/Net.cs` | wire constants, the UDP sender and the ping probe |
| `capture/ui/index.html` | the QR/address page (embedded resource) |
| `capture/Program.cs` | CLI parsing, modes, driver lifecycle, receiver and ping |
| `build.ps1` | publish, bundle `interception.dll`, zip |
| `README.md` | build, deploy, the T1–T8 acceptance procedure, troubleshooting |

---

## Invariants — do not break these

1. **The pump thread allocates nothing.** `Capture.Loop` may not allocate, lock, log,
   touch the console, or do socket I/O. If you need to add work, put it on the
   reporter thread and hand over a snapshot.
2. **The reporter is a separate thread** so a slow socket or a slow console can never
   delay stroke forwarding.
3. **The watchdog stays.** If the pump stops ticking for 500 ms, the reporter
   disables the filter and exits. This is the difference between a bug and a dead
   mouse.
4. **Filter mice only.** `INTERCEPTION_FILTER_MOUSE_ALL` with `interception_is_mouse`.
   Never add a keyboard filter; a stuck one makes the machine unusable.
5. **Consume the mode buttons as a pair.** In `--gate`, the configured
   `--rotate-button`/`--translate-button` strokes are swallowed, so MB4/MB5 do not
   also click in the foreground app. Every other button always passes. Swallow a
   down and its matching up together, never one half; an up that was not preceded
   by a swallowed down is forwarded so a client started mid-hold cannot strand the
   OS button state. `--pass-mode-buttons` deliberately restores the old
   click-through behaviour for debugging or for users who need those buttons.
6. **Never call `interception_destroy_context` while the pump might be blocked**
   inside `interception_wait_with_timeout`. The code joins the pump first and calls
   `Environment.Exit` if the join times out.
7. **`Interception.MouseStroke` is a 20-byte `InterceptionMouseStroke`, not a tagged
   union.** `InterceptionStroke` is `char[20]` and the device slot tells you the type.
   Field order is `state, flags, rolling, x, y, information`, with two bytes of padding
   before `x`. Use explicit layout; `Interception.cs` asserts the size at load time.
   Note `state` holds buttons and wheel bits — motion is `state == 0`.
8. **`RAWINPUTHEADER` is 24 bytes on x64**, `RAWMOUSE` 24, `RAWINPUT` 48. Do not
   "tidy" the explicit field offsets.
9. **`interception_set_filter(context, predicate, filter)` — predicate is second.**
   The filter is a `unsigned short`; passing it where the predicate belongs makes the
   DLL call `0xFFFF` as a function pointer and the process dies with an
   `AccessViolationException`. Always go through `Interception.SetMouseFilter`.

---

## Verified vs unverified

Verified on the dev host (no driver, RDP session only):

- clean Release build, zero warnings; self-contained publish
- `--rawdump` parses real `WM_INPUT` data correctly (struct layout confirmed)
- UDP loopback: 20 pings, 0.25 ms median RTT, echo and gap counting correct
- missing-`interception.dll` path returns exit code 3 with a useful message
- published binary in `out\` runs

**Verified on real hardware** (one run, after the ABI fix):

- `--list` opens a driver context and prints the correct hardware id for the mouse
  (`HID\VID_046D&PID_C52B\...`), so the driver loads, the context is valid, and the
  `IOCTL_GET_HARDWARE_ID` path works.

**Unverified:** this document predates the final acceptance run. The driver path,
`--list`, `--rawdump`, pass-through, gating and the Mouser UDP path have all been
exercised on real hardware; the full T1–T8 procedure in `README.md` and A1–A10 are
the reference. The v0.3.1 mode-button swallowing path is compile-verified only;
A3 is the hardware check that MB4/MB5 no longer click through.

---

## Risks, in order of severity

1. **HVCI / driver signing.** The dominant risk. If the machine will not load it,
   the fallback ladder is in `README.md` under *Troubleshooting*: attestation-signed
   custom KMDF filter, or test-signing mode, or abandon games and use a hook.
2. **`interception_wait_with_timeout` is assumed to be exported.** It is used instead
   of `interception_wait` so `Ctrl+C` is graceful. If it is missing the app will
   throw `EntryPointNotFoundException` immediately — which is at least obvious.
3. **Anti-cheat.** Kernel anti-cheat may refuse to run alongside an unknown filter
   driver. Fine for single-player, risky for competitive.
4. **Unmaintained upstream.** Windows Updates may break it; a custom signed filter
   driver is the eventual answer.

---

## Environment gotchas already paid for

- **Verify the binary before trusting a result.** The first hardware run of T2 used a
  stale `mouser-capture.exe` and produced a stack trace that looked like a live bug.
  `--version` now prints `0.3.1+<sha>[-dirty]`; check it on the test machine first.
- Windows PowerShell 5.1 is the shell here. `$PSScriptRoot` is **empty during
  parameter-default binding**; assign defaults in the script body. Avoid `?.` and
  `??`.
- `CreateParams.Style = 0x80000000` needs `unchecked((int)0x80000000)`.
- `GetRawInputDeviceInfo` for `RID_DEVICEINFO` requires the caller to set
  `cbSize`; for `RIDI_DEVICENAME` it can fail entirely in RDP sessions. Always zero
  the buffer before reading it — an earlier version printed uninitialised heap as a
  device name.
- Setting `Console.OutputEncoding` can throw when stdout is redirected; wrap it.

---

## Commands

```powershell
# build + bundle + zip
.\build.ps1 -InterceptionDir C:\path\to\Interception\library\x64

# compile check only
& "$env:USERPROFILE\.dotnet\dotnet.exe" build capture\Mouser.Capture.csproj -c Release

# runtime modes
.\mouser-capture.exe --list
.\mouser-capture.exe --passthrough --filter VID_046D
.\mouser-capture.exe --gate --filter VID_046D [--rotate-button 4] [--pass-mode-buttons] [--udp 192.168.1.50:7801]
.\mouser-capture.exe --rawdump
.\mouser-capture.exe --recv --port 7801
.\mouser-capture.exe --ping --udp 192.168.1.50:7801
```

`out/`, `bin/`, `obj/` and `*.zip` are gitignored.

---

## Roadmap

**Phase 1 — product shell (done in v0.3).** Momentary MB4/MB5 modes, per-layout
enable + six axis bindings in the PhoneButtons web app, ratcheted key output from
the Python server, F13–F24 defaults.

**Phase 2 — richer mapping (next).** Expo/curves, per-axis inversion, axis lock and
fine-mode multipliers, absolute-position approximation. Judge feel at the machine
with the mouse; remote display latency dominates everything else.

**Phase 3 — real device presence.** Virtual HID (VHF) exposing a genuine 6-axis
device so Blender, Fusion and Unreal pick it up natively, or a custom filter that
both strips motion and adds a HID collection. This is where the certificate work
from the Phase 0 decision pays off.

---

## Conventions

- File-scoped namespaces, nullable enabled, `sealed` classes, no external packages.
- Comments explain *why*, not *what*. The existing comments mark places where a
  naive change is dangerous.
- Keep `README.md` honest: mark what has been tested on real hardware and what has
  not. The T4 test is the only one that decides whether the architecture works.
- Do not commit `out/` or the zip.
