using System.Diagnostics;
using NAudio.Midi;

namespace Midi.Capture;

internal static class MidiMonitor
{
    /// <summary>
    /// Opens the device and prints every message it sends until Ctrl+C.
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
            // The constructor opens the device, so this is where "in use" shows up.
            using var midiIn = new MidiIn(device.Index);
            var clock = Stopwatch.StartNew();

            midiIn.MessageReceived += (_, e) =>
                WriteLine(Describe(e.MidiEvent, e.RawMessage, clock.Elapsed, showRaw));

            midiIn.ErrorReceived += (_, e) =>
                Console.Error.WriteLine($"  ! driver error 0x{e.RawMessage:X8}");

            midiIn.Start();
            stop.Wait();
            midiIn.Stop();
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
                detail = $"{MidiNames.Controller((int)control.Controller)} value {control.ControllerValue}";
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

    /// <summary>
    /// Names the common controllers; everything else keeps its number so an unusual
    /// knob still prints something usable.
    /// </summary>
    public static string Controller(int controller) => controller switch
    {
        0 => "Bank Select (CC0)",
        1 => "Modulation (CC1)",
        2 => "Breath (CC2)",
        4 => "Foot Controller (CC4)",
        5 => "Portamento Time (CC5)",
        6 => "Data Entry (CC6)",
        7 => "Volume (CC7)",
        8 => "Balance (CC8)",
        10 => "Pan (CC10)",
        11 => "Expression (CC11)",
        12 => "Effect Control 1 (CC12)",
        13 => "Effect Control 2 (CC13)",
        16 => "General Purpose 1 (CC16)",
        17 => "General Purpose 2 (CC17)",
        18 => "General Purpose 3 (CC18)",
        19 => "General Purpose 4 (CC19)",
        32 => "Bank Select LSB (CC32)",
        33 => "Modulation LSB (CC33)",
        38 => "Data Entry LSB (CC38)",
        39 => "Volume LSB (CC39)",
        42 => "Pan LSB (CC42)",
        43 => "Expression LSB (CC43)",
        64 => "Sustain Pedal (CC64)",
        65 => "Portamento On/Off (CC65)",
        66 => "Sostenuto (CC66)",
        67 => "Soft Pedal (CC67)",
        68 => "Legato Footswitch (CC68)",
        69 => "Hold 2 (CC69)",
        70 => "Sound Controller 1 (CC70)",
        71 => "Sound Controller 2 (CC71)",
        72 => "Sound Controller 3 (CC72)",
        73 => "Sound Controller 4 (CC73)",
        74 => "Sound Controller 5 (CC74)",
        75 => "Sound Controller 6 (CC75)",
        76 => "Sound Controller 7 (CC76)",
        77 => "Sound Controller 8 (CC77)",
        78 => "Sound Controller 9 (CC78)",
        79 => "Sound Controller 10 (CC79)",
        80 => "General Purpose Button 1 (CC80)",
        81 => "General Purpose Button 2 (CC81)",
        82 => "General Purpose Button 3 (CC82)",
        83 => "General Purpose Button 4 (CC83)",
        91 => "Reverb Send (CC91)",
        92 => "Tremolo (CC92)",
        93 => "Chorus Send (CC93)",
        94 => "Detune (CC94)",
        95 => "Phaser (CC95)",
        96 => "Data Increment (CC96)",
        97 => "Data Decrement (CC97)",
        98 => "NRPN LSB (CC98)",
        99 => "NRPN MSB (CC99)",
        100 => "RPN LSB (CC100)",
        101 => "RPN MSB (CC101)",
        120 => "All Sound Off (CC120)",
        121 => "Reset All Controllers (CC121)",
        122 => "Local Control (CC122)",
        123 => "All Notes Off (CC123)",
        124 => "Omni Off (CC124)",
        125 => "Omni On (CC125)",
        126 => "Mono Mode (CC126)",
        127 => "Poly Mode (CC127)",
        _ => $"CC {controller}",
    };
}
