using System.Diagnostics;
using NAudio;
using NAudio.Midi;

namespace Midi.Capture;

internal static class MidiMonitor
{
    /// <summary>
    /// How often to look for the device while capturing. winmm removes an unplugged
    /// device from its list and gives no close notification through NAudio, so the
    /// list is the only signal that the handle has died.
    /// </summary>
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    private enum SessionEnd
    {
        Cancelled,
        Lost,
        CannotOpen,
    }

    /// <summary>
    /// Opens the device and prints every message it sends until Ctrl+C. If the device
    /// disappears (unplugged, powered off, driver restart) the session ends, the tool
    /// waits for an input with the same name to be listed again and reopens it.
    /// Returns 0 on a clean stop.
    /// </summary>
    public static int Run(MidiDevice device, bool showRaw)
    {
        using var stop = new ManualResetEventSlim(false);

        ConsoleCancelEventHandler onCancel = (_, e) =>
        {
            // Cancel the default exit so the device is stopped and closed properly;
            // the main thread does that once the flag is set.
            e.Cancel = true;
            stop.Set();
        };

        Console.CancelKeyPress += onCancel;

        try
        {
            // One clock across every session, so a gap in the timestamps shows the
            // outage rather than restarting at zero.
            var clock = Stopwatch.StartNew();
            MidiDevice current = device;
            bool firstAttempt = true;
            bool openFailureReported = false;

            while (true)
            {
                SessionEnd end = RunSession(current, stop, clock, showRaw, out bool started);

                if (started && !firstAttempt)
                {
                    WriteLine($"  reconnected: [{current.Index}] {current.Name}");
                }

                firstAttempt = false;
                openFailureReported = openFailureReported && !started;

                if (end == SessionEnd.Cancelled)
                {
                    break;
                }

                if (end == SessionEnd.Lost)
                {
                    WriteLine($"  device lost: {current.Name} (waiting for it to come back)");
                }
                else if (!openFailureReported)
                {
                    // Once per outage: a device held open by another application must
                    // not fill the log with a line every second.
                    WriteLine($"  cannot open [{current.Index}] {current.Name} (retrying)");
                    openFailureReported = true;
                }

                // Devices are renumbered when anything is plugged in or out, so the
                // index from the old session is not reusable; find it by name.
                MidiDevice? back = WaitForDevice(current.Name, stop);
                if (back is null)
                {
                    break;
                }

                current = back;
            }
        }
        finally
        {
            Console.CancelKeyPress -= onCancel;
        }

        Console.WriteLine();
        Console.WriteLine("Stopped.");
        return 0;
    }

    /// <summary>
    /// One open-device session. Returns when Ctrl+C is pressed, the device leaves the
    /// device list, or the driver refuses to open it.
    /// </summary>
    private static SessionEnd RunSession(
        MidiDevice device,
        ManualResetEventSlim stop,
        Stopwatch clock,
        bool showRaw,
        out bool started)
    {
        started = false;
        MidiIn? midiIn = null;

        try
        {
            // The constructor opens the device, so this is where "in use" shows up.
            midiIn = new MidiIn(device.Index);

            midiIn.MessageReceived += (_, e) =>
                WriteLine(Describe(e.MidiEvent, e.RawMessage, clock.Elapsed, showRaw));

            midiIn.ErrorReceived += (_, e) =>
                Console.Error.WriteLine($"  ! driver error 0x{e.RawMessage:X8}");

            midiIn.Start();
            started = true;

            while (!stop.Wait(PollInterval))
            {
                if (!MidiDevices.IsPresent(device.Name))
                {
                    return SessionEnd.Lost;
                }
            }

            return SessionEnd.Cancelled;
        }
        catch (MmException)
        {
            return started ? SessionEnd.Lost : SessionEnd.CannotOpen;
        }
        finally
        {
            // A handle that died with the device throws on stop/close; there is
            // nothing left to clean up in that case.
            try { midiIn?.Stop(); } catch (MmException) { }
            try { midiIn?.Dispose(); } catch (MmException) { }
        }
    }

    /// <summary>
    /// Waits for an input with this name to be listed again. The wait comes first so a
    /// device that is present but held by another application is retried once a
    /// second instead of spinning.
    /// </summary>
    private static MidiDevice? WaitForDevice(string name, ManualResetEventSlim stop)
    {
        while (!stop.Wait(PollInterval))
        {
            MidiDevice? found = MidiDevices.Find(name);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    /// <summary>
    /// Prints a fixed burst covering every message shape, without opening a device.
    /// Lets the formatting be checked on a machine with no MIDI hardware.
    /// </summary>
    public static int RunSimulated(bool showRaw)
    {
        foreach ((double seconds, MidiEvent midiEvent) in Simulation())
        {
            WriteLine(Describe(midiEvent, RawOf(midiEvent), TimeSpan.FromSeconds(seconds), showRaw));
        }

        Console.WriteLine();
        Console.WriteLine("Stopped.");
        return 0;
    }

    private static IReadOnlyList<(double Seconds, MidiEvent Event)> Simulation() =>
    [
        (0.000, new NoteOnEvent(0, 1, 60, 100, 0)),
        (0.250, new ControlChangeEvent(0, 1, MidiController.Modulation, 64)),
        (0.500, new NoteEvent(0, 1, MidiCommandCode.NoteOff, 60, 64)),
        (0.750, new ControlChangeEvent(0, 1, MidiController.Sustain, 127)),
        (1.000, new PatchChangeEvent(0, 1, 5)),
        (1.250, new PitchWheelChangeEvent(0, 1, 8192)),
        (1.500, new ChannelAfterTouchEvent(0, 1, 64)),
        (1.750, new NoteEvent(0, 1, MidiCommandCode.KeyAfterTouch, 62, 32)),
        (2.000, MidiEvent.FromRawMessage(0xF8)),
    ];

    /// <summary>
    /// The packed short message for an event. System realtime messages have no
    /// GetAsShortMessage implementation, but their byte is fixed.
    /// </summary>
    private static int RawOf(MidiEvent midiEvent) => midiEvent.CommandCode switch
    {
        MidiCommandCode.TimingClock => 0xF8,
        MidiCommandCode.StartSequence => 0xFA,
        MidiCommandCode.ContinueSequence => 0xFB,
        MidiCommandCode.StopSequence => 0xFC,
        MidiCommandCode.AutoSensing => 0xFE,
        _ => midiEvent.GetAsShortMessage(),
    };

    private static string Describe(MidiEvent midiEvent, int rawMessage, TimeSpan at, bool showRaw)
    {
        string name;
        int channel;
        string detail;

        switch (midiEvent)
        {
            case NoteOnEvent noteOn when noteOn.Velocity > 0:
                name = "Note On";
                channel = noteOn.Channel;
                detail = $"{MidiNames.Note(noteOn.NoteNumber)} ({noteOn.NoteNumber}) velocity {noteOn.Velocity}";
                break;

            // Note off, note on with velocity 0 (a note off by convention) and key
            // after touch all arrive as the base NoteEvent.
            case NoteEvent note:
                channel = note.Channel;
                if (note.CommandCode == MidiCommandCode.KeyAfterTouch)
                {
                    name = "Key After Touch";
                    detail = $"{MidiNames.Note(note.NoteNumber)} ({note.NoteNumber}) pressure {note.Velocity}";
                }
                else
                {
                    name = "Note Off";
                    detail = $"{MidiNames.Note(note.NoteNumber)} ({note.NoteNumber}) velocity {note.Velocity}";
                }
                break;

            case ControlChangeEvent control:
                name = "Control Change";
                channel = control.Channel;
                detail = $"CC {(int)control.Controller} = {control.ControllerValue}";
                break;

            case PatchChangeEvent patch:
                name = "Program Change";
                channel = patch.Channel;
                detail = MidiNames.Program(patch.Patch);
                break;

            case ChannelAfterTouchEvent afterTouch:
                name = "After Touch";
                channel = afterTouch.Channel;
                detail = $"pressure {afterTouch.AfterTouchPressure}";
                break;

            case PitchWheelChangeEvent bend:
                name = "Pitch Bend";
                channel = bend.Channel;
                detail = MidiNames.Pitch(bend.Pitch);
                break;

            default:
                return DescribeUnknown(midiEvent, rawMessage, at);
        }

        string line = $"{at.TotalSeconds,8:F3}s  {name,-16} ch{channel,2}  {detail}";
        if (showRaw)
        {
            line += $"   [{Bytes(rawMessage)}]";
        }

        return line;
    }

    /// <summary>
    /// Anything without a friendly shape (clock, start/stop, active sensing, sysex)
    /// is printed as its name plus the bytes, which is all the information there is.
    /// </summary>
    private static string DescribeUnknown(MidiEvent midiEvent, int rawMessage, TimeSpan at)
    {
        string name = midiEvent.CommandCode switch
        {
            MidiCommandCode.TimingClock => "Timing Clock",
            MidiCommandCode.StartSequence => "Start",
            MidiCommandCode.ContinueSequence => "Continue",
            MidiCommandCode.StopSequence => "Stop",
            MidiCommandCode.AutoSensing => "Active Sensing",
            MidiCommandCode.Sysex => "SysEx",
            MidiCommandCode.Eox => "SysEx End",
            MidiCommandCode.MetaEvent => "Meta",
            _ => midiEvent.CommandCode.ToString(),
        };

        return $"{at.TotalSeconds,8:F3}s  {name,-16} ch -  [{Bytes(rawMessage)}]";
    }

    /// <summary>
    /// The bytes a short MIDI message actually carries, unpacked from the raw value
    /// winmm hands us (status in the low byte, then data1, then data2).
    /// </summary>
    private static string Bytes(int rawMessage)
    {
        int status = rawMessage & 0xFF;
        int data1 = (rawMessage >> 8) & 0xFF;
        int data2 = (rawMessage >> 16) & 0xFF;

        int count = status switch
        {
            >= 0xF8 => 1,               // realtime: clock, start/continue/stop, sensing, reset
            0xF1 or 0xF3 => 2,          // MTC quarter frame, song select
            0xF2 => 3,                  // song position
            >= 0xF0 => 1,               // sysex start/end, tune request
            >= 0xC0 and < 0xE0 => 2,    // program change, channel after touch
            _ => 3,
        };

        return count switch
        {
            1 => $"{status:X2}",
            2 => $"{status:X2} {data1:X2}",
            _ => $"{status:X2} {data1:X2} {data2:X2}",
        };
    }

    private static void WriteLine(string line)
    {
        Console.WriteLine(line);

        // Redirected stdout is block-buffered; a capture stream has to arrive as it
        // happens, not when the buffer fills.
        Console.Out.Flush();
    }
}

internal static class MidiNames
{
    /// <summary>
    /// Scientific pitch notation, where MIDI 60 is C4 (NAudio's own NoteName calls
    /// the same note C5, which is a different octave convention).
    /// </summary>
    public static string Note(int noteNumber)
    {
        if (noteNumber is < 0 or > 127)
        {
            return noteNumber.ToString();
        }

        string[] names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        return $"{names[noteNumber % 12]}{noteNumber / 12 - 1}";
    }

    public static string Program(int program) =>
        program is >= 0 and < 128
            ? $"{program} ({PatchChangeEvent.GetPatchName(program)})"
            : program.ToString();

    public static string Pitch(int value)
    {
        int offset = value - 8192;
        if (offset == 0)
        {
            return "8192 (centre)";
        }

        return $"{value} ({(offset > 0 ? "+" : string.Empty)}{offset})";
    }
}
