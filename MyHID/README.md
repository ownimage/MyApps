# Overview

The main part of the system is the server/app.py, this accepts inputs from http (port 5000) and udp (port 7801) and converts them into keystrokes.

The mapping can be configured using the MyHID app.
The MyHID app also presents a layout of buttons that the user can click on which is then translated to a keystroke that is deliverd to the running app.

The keystrokes are deliverd to the currently running app on the host machine.

Additionally, there is a blender plugin that takes the F13-F24 keystrokes and converts them into Rotations and Translations on the currently selected object.

## server\app.py
This accepts requests from a phone on port 5000.

It also accepts udp requests (including ping) from HID/mouse-capture.exe

When started using StartMyHIDServer.cmd it also creates a temporary Cloudflare routing to this port. The details of this routing are displayed on a QR code and can be scanned by the MyHID App.

It detects the running application, then based on that chooses a layout which maps the MyHID and mouse input into keystrokes that are delivered to the running application.

## MyHID

This is the web app for the configuration of the key mapping and also displaying the buttons on the phone.

This is part of the main MyApps web application.

## MyHID\blender\hid_step_controls.py

This is installed into blender Edit -> Preferences -> Add-ons -> Install from disk

This converts the keystrokes F13-F24 into rotations and translations.

## MyHID\mouse-capture

This directory houses all of the mouse capture parts. Currently I am using a Logitech M570 which has a trackball and a scroll wheel and four buttons.

Two of the buttons when held down convert the mouse from a regular pointer to delivering rotation or translation events to the server.

From a PowerShell in that directory run `.\build.ps1 -InterceptionDir .` which will build `mouse-capture.zip`. This can then be taken and installed on the machine where the mouse is plugged in.

Note when using the `--filter` you should put the filter in quotes. So having unzipped it, and changed to the directory the command might be `mouse-capture.exe --gate --filter "HID\VID_046D&PID_C52B&REV_1210&MI_01&Col01" --udp 192.168.1.69:7801`.
Without the quotes it might say `Not connected` in the udp startup line which means it is not sending events to the server.

Running it without parameters will give the help screen, running it with `--list` will tell you what mice you have connected.

## MyHID\mouse-capture\interception.dll

This is generated from https://github.com/oblitum/Interception/releases v1.0.1
