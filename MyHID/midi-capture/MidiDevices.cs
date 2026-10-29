using NAudio;
using NAudio.Midi;

namespace Midi.Capture;

/// <summary>One MIDI input device as winmm reports it.</summary>
internal sealed record MidiDevice(int Index, string Name, string Manufacturer);

internal static class MidiDevices
{
    public static IReadOnlyList<MidiDevice> Inputs()
    {
        var devices = new List<MidiDevice>(MidiIn.NumberOfDevices);

        for (int i = 0; i < MidiIn.NumberOfDevices; i++)
        {
            MidiInCapabilities caps = MidiIn.DeviceInfo(i);

            // ProductName is the driver's description; some drivers leave it empty.
            string name = string.IsNullOrWhiteSpace(caps.ProductName)
                ? $"MIDI input {i}"
                : caps.ProductName;

            // winmm reports manufacturer id 0 ("Microsoft") for anything without a
            // real id, which would just be noise on the device list.
            string manufacturer = caps.Manufacturer == Manufacturers.Microsoft
                ? string.Empty
                : caps.Manufacturer.ToString();

            devices.Add(new MidiDevice(i, name, manufacturer));
        }

        return devices;
    }

    public static void PrintAll()
    {
        var inputs = Inputs();

        Console.WriteLine("MIDI input devices:");
        if (inputs.Count == 0)
        {
            Console.WriteLine("  (none found)");
        }
        else
        {
            foreach (MidiDevice device in inputs)
            {
                string maker = device.Manufacturer.Length > 0
                    ? $"   (maker: {device.Manufacturer})"
                    : string.Empty;
                Console.WriteLine($"  [{device.Index}] {device.Name}{maker}");
            }
        }

        Console.WriteLine();
        Console.WriteLine("MIDI output devices:");
        if (MidiOut.NumberOfDevices == 0)
        {
            Console.WriteLine("  (none found)");
        }
        else
        {
            for (int i = 0; i < MidiOut.NumberOfDevices; i++)
            {
                MidiOutCapabilities caps = MidiOut.DeviceInfo(i);
                string name = string.IsNullOrWhiteSpace(caps.ProductName)
                    ? $"MIDI output {i}"
                    : caps.ProductName;
                Console.WriteLine($"  [{i}] {name}");
            }
        }
    }

    /// <summary>
    /// First input whose product name matches exactly. Used to find the device again
    /// after a reconnect, when winmm may have given it a different index.
    /// </summary>
    public static MidiDevice? Find(string name) =>
        Inputs().FirstOrDefault(device =>
            string.Equals(device.Name, name, StringComparison.OrdinalIgnoreCase));

    public static bool IsPresent(string name) => Find(name) is not null;

    /// <summary>
    /// Turns --filter/--index into one input device, or explains why it cannot.
    /// An exact name beats a substring match; anything still ambiguous is refused
    /// rather than guessing which device the user meant.
    /// </summary>
    public static MidiDevice Resolve(string? filter, int? index)
    {
        IReadOnlyList<MidiDevice> inputs = Inputs();
        if (inputs.Count == 0)
        {
            throw new OptionException("no MIDI input devices are connected");
        }

        if (index is int wanted)
        {
            MidiDevice? byIndex = inputs.FirstOrDefault(device => device.Index == wanted);
            return byIndex ?? throw new OptionException(
                $"there is no MIDI input [{wanted}]; run 'midi-capture' to list them");
        }

        string needle = (filter ?? string.Empty).Trim();
        var matches = inputs
            .Where(device => device.Name.Contains(needle, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matches.Count == 1)
        {
            return matches[0];
        }

        if (matches.Count == 0)
        {
            throw new OptionException(
                $"no MIDI input name contains '{needle}'; run 'midi-capture' to list them");
        }

        var exact = matches
            .Where(device => string.Equals(device.Name, needle, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (exact.Count == 1)
        {
            return exact[0];
        }

        string found = string.Join(", ", matches.Select(device => $"[{device.Index}] {device.Name}"));
        throw new OptionException(
            $"'{needle}' matches {matches.Count} inputs: {found}; use --index <n> to choose one");
    }
}
