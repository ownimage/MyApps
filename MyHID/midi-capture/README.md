# midi-capture

A small console tool that lists the MIDI devices on this machine, or prints the
messages one input device sends, with the note/controller names filled in.

It is the MIDI counterpart of `../mouse-capture`: same shape (C#, self-contained
win-x64, `build.ps1` produces `out/` plus a zip) so the two read alike.

## Build

```powershell
powershell -File MyHID\midi-capture\build.ps1
```

Produces `out\midi-capture.exe` (self-contained, no .NET runtime needed on the
target machine) and `midi-capture.zip`. The banner version carries the git
commit, e.g. `0.1.0+34a6cf0`, so a stale copy is obvious.

## Use

```text
midi-capture                      list every MIDI input and output device
midi-capture --filter <text>      capture the input whose name contains <text>
midi-capture --index <n>          capture input device n (the number from the list)
midi-capture --simulate           print a scripted burst, no device needed
midi-capture --version
```

`--raw` appends the MIDI bytes to every line. Ctrl+C stops the capture.

The name match ignores case. If several inputs match, an exact name wins;
otherwise the matches are listed so the filter can be narrowed, or `--index`
picks one directly.

## Output

```text
   0.000s  Note On          ch 1  C4 (60) velocity 100
   0.250s  Control Change   ch 1  CC 1 = 64
   0.500s  Note Off         ch 1  C4 (60) velocity 64
   0.750s  Control Change   ch 1  CC 64 = 127
   1.000s  Program Change   ch 1  5 (Electric Piano 2)
   1.250s  Pitch Bend       ch 1  8192 (centre)
   1.500s  After Touch      ch 1  pressure 64
   1.750s  Key After Touch  ch 1  D4 (62) pressure 32
   2.000s  Timing Clock     ch -  [F8]
```

Notes:

- The channel comes from the low nibble of the status byte, so it is exact.
  System messages (clock, start/stop, active sensing, sysex) have no channel.
- Control Change prints the CC number and its value, `CC <n> = <value>`. No
  controller *names* are shown on purpose: the GM names (CC 7 = Volume, ...) are
  a convention a device is free to ignore, so a knob can sit on CC 7.
- Note numbers use scientific pitch notation, so MIDI 60 is **C4** (NAudio's own
  `NoteName` calls it C5).
- A note-on with velocity 0 is printed as Note Off, which is what it means.
- Clock, start/stop, active sensing and sysex have no friendly shape, so they
  print their name and bytes.
- `--simulate` exists because the dev box has no MIDI input, so the formatting
  can still be checked (and tested) without hardware.
- MIDI does not declare whether a control is a rotary, a slider or a button;
  only the message kind is reliable. A type has to be observed or declared.

## Reconnecting

If the device disappears mid-capture (unplugged, powered off, driver restart),
the tool reports it, waits for an input with the same name to be listed again,
and reopens it:

```text
   1.240s  Control Change   ch 1  CC 1 = 64
   4.708s  -- device lost: USB MIDI Interface
   4.708s  -- inputs now: (none)
   9.870s  -- reconnected: [1] USB MIDI Interface
   9.902s  Note On          ch 1  C4 (60) velocity 100
```

- Timestamps keep counting through the outage, so the gap is visible.
- The device is found again by **name**, not index: winmm renumbers device ids
  whenever anything is plugged in or out, so the old index is not reusable.
- Presence is polled once a second, and a device must be missing for two polls
  before it counts as lost (one missed poll is not an unplug). winmm gives no
  close notification through NAudio - its callback explicitly ignores
  `MIM_CLOSE` - so the device list is the only signal.
- On loss, `inputs now:` prints what winmm currently lists, which separates "it
  is gone" (`(none)`) from "it is listed under a different name".
- Reopening backs off (1, 2, 4 then 5 s) so a wedged USB driver is not hammered
  by a reopen loop; the backoff resets after a session that ran for 5 s.
- If the open fails, the winmm result is shown:
  `cannot open [0] X (AlreadyAllocated) - the port is still held, close the
  other MIDI application`. `BadDeviceId` means the device is not there.
- Stop/close failures are logged as `! stop failed: ...` / `! close failed: ...`
  instead of being swallowed, so a handle that will not release is visible.
- Ctrl+C works while waiting for the device to come back.
- Limitation: if the device is replugged so quickly that it never leaves the
  list, the dead handle cannot be detected through NAudio and capture stays
  silent. Unplugging a USB device normally takes long enough to be seen.

## Layout

| File | Purpose |
| --- | --- |
| `Program.cs` | argument parsing, modes, banner/version |
| `MidiDevices.cs` | enumerate inputs/outputs, resolve `--filter`/`--index` |
| `MidiMonitor.cs` | open the device, print events; `--simulate` burst |
| `Midi.Capture.csproj` | net8.0-windows, x64, `NAudio.Midi` only |
| `build.ps1` | publish self-contained + zip |

## Note 

The device can be very sensitive to disconnects when swapping to RDP due to USB power management
Windows sometimes powers down USB devices when the active session changes.
For every USB Root Hub:

Device Manager
  Universal Serial Bus controllers
    USB Root Hub (and Generic USB Hub)
      Properties
        Power Management
          Untick: Allow the computer to turn off this device to save power