using System.Reflection;
using System.Text;
using NAudio;
using NAudio.Midi;

namespace Midi.Capture;

/// <summary>
/// A bad command line. Printed as a plain message instead of a stack trace.
/// </summary>
internal sealed class OptionException : Exception
{
    public OptionException(string message) : base(message) { }
}

internal sealed class Options
{
    public string Mode { get; private set; } = "list";
    public string? Filter { get; private set; }
    public int? Index { get; private set; }
    public bool Raw { get; private set; }

    public static Options Parse(string[] args)
    {
        var options = new Options();

        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            switch (arg)
            {
                case "--list": options.Mode = "list"; break;
                case "--raw": options.Raw = true; break;
                case "--simulate": options.Mode = "simulate"; break;
                case "--version": options.Mode = "version"; break;
                case "-h":
                case "--help": options.Mode = "help"; break;

                case "--filter":
                    options.Filter = Value(args, ref i, arg);
                    options.Mode = "capture";
                    break;

                case "--index":
                    options.Index = ParseInt(Value(args, ref i, arg), arg);
                    options.Mode = "capture";
                    break;

                default:
                    // Also accept --filter=value and --index=value.
                    if (arg.StartsWith("--filter=", StringComparison.Ordinal))
                    {
                        options.Filter = arg["--filter=".Length..];
                        options.Mode = "capture";
                    }
                    else if (arg.StartsWith("--index=", StringComparison.Ordinal))
                    {
                        options.Index = ParseInt(arg["--index=".Length..], "--index");
                        options.Mode = "capture";
                    }
                    else
                    {
                        throw new OptionException($"unknown argument '{arg}'");
                    }
                    break;
            }
        }

        if (options.Mode == "capture")
        {
            if (options.Filter is not null && options.Index is not null)
            {
                throw new OptionException("use either --filter or --index, not both");
            }

            if (string.IsNullOrWhiteSpace(options.Filter) && options.Index is null)
            {
                throw new OptionException("--filter needs a device name");
            }
        }

        return options;
    }

    public static void PrintUsage()
    {
        Console.WriteLine(
            """
            midi-capture - list MIDI devices, or print the events one of them sends

              midi-capture                      list every MIDI input and output device
              midi-capture --filter <text>      capture the input whose name contains <text>
              midi-capture --index <n>          capture input device n (the number from the list)
              midi-capture --simulate           print a scripted burst, no device needed
              midi-capture --version

            options:
              --raw         append the raw MIDI bytes to every event line
              -h, --help    show this help

            The name match ignores case. If several inputs match, an exact name wins;
            otherwise the matches are listed so the filter can be narrowed (or use
            --index). Press Ctrl+C to stop capturing.
            """);
    }

    private static string Value(string[] args, ref int i, string arg)
    {
        if (i + 1 >= args.Length)
        {
            throw new OptionException($"{arg} needs a value");
        }

        return args[++i];
    }

    private static int ParseInt(string text, string arg)
    {
        if (!int.TryParse(text, out int value))
        {
            throw new OptionException($"{arg} needs a number, got '{text}'");
        }

        return value;
    }
}

internal static class Program
{
    /// <summary>
    /// Printed by --version and in the capture banner. build.ps1 appends the git
    /// commit, so a stale binary on the test machine is obvious at a glance.
    /// </summary>
    internal static string BuildVersion =>
        typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(Program).Assembly.GetName().Version?.ToString()
        ?? "unknown";

    private static int Main(string[] args)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { }

        Options options;
        try
        {
            options = Options.Parse(args);
        }
        catch (OptionException ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            Console.Error.WriteLine("run 'midi-capture --help' for the usage");
            return 2;
        }

        try
        {
            switch (options.Mode)
            {
                case "help":
                    Options.PrintUsage();
                    return 0;
                case "version":
                    Console.WriteLine(BuildVersion);
                    return 0;
                case "list":
                    MidiDevices.PrintAll();
                    return 0;
                case "simulate":
                    return RunSimulated(options);
                default:
                    return RunCapture(options);
            }
        }
        catch (OptionException ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            return 2;
        }
        catch (MmException ex)
        {
            // The usual cause is another application holding the device open.
            Console.Error.WriteLine($"error: {ex.Function} failed: {ex.Result}");
            Console.Error.WriteLine("the device may be open in another application");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            return 1;
        }
    }

    private static int RunCapture(Options options)
    {
        MidiDevice device = MidiDevices.Resolve(options.Filter, options.Index);

        Console.WriteLine("midi-capture");
        Console.WriteLine($"  device : [{device.Index}] {device.Name}");
        if (device.Manufacturer.Length > 0)
        {
            Console.WriteLine($"  maker  : {device.Manufacturer}");
        }
        Console.WriteLine($"  build  : {BuildVersion}");
        Console.WriteLine();
        Console.WriteLine("Press Ctrl+C to stop.");
        Console.WriteLine();

        return MidiMonitor.Run(device, options.Raw);
    }

    private static int RunSimulated(Options options)
    {
        Console.WriteLine("midi-capture");
        Console.WriteLine("  device : (simulated)");
        Console.WriteLine($"  build  : {BuildVersion}");
        Console.WriteLine();

        return MidiMonitor.RunSimulated(options.Raw);
    }
}
