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
   0.250s  Control Change   ch 1  Modulation (CC1) value 64
   0.500s  Note Off         ch 1  C4 (60) velocity 64
   0.750s  Control Change   ch 1  Sustain Pedal (CC64) value 127
   1.000s  Program Change   ch 1  5 (Electric Piano 2)
   1.250s  Pitch Bend       ch 1  8192 (centre)
   1.500s  After Touch      ch 1  pressure 64
   1.750s  Key After Touch  ch 1  D4 (62) pressure 32
   2.000s  Timing Clock     ch -  [F8]
```

Notes:

- Note numbers use scientific pitch notation, so MIDI 60 is **C4** (NAudio's own
  `NoteName` calls it C5).
- A note-on with velocity 0 is printed as Note Off, which is what it means.
- Clock, start/stop, active sensing and sysex have no friendly shape, so they
  print their name and bytes.
- `--simulate` exists because the dev box has no MIDI input, so the formatting
  can still be checked (and tested) without hardware.

## Layout

| File | Purpose |
| --- | --- |
| `Program.cs` | argument parsing, modes, banner/version |
| `MidiDevices.cs` | enumerate inputs/outputs, resolve `--filter`/`--index` |
| `MidiMonitor.cs` | open the device, print events; `--simulate` burst |
| `Midi.Capture.csproj` | net8.0-windows, x64, `NAudio.Midi` only |
| `build.ps1` | publish self-contained + zip |
