# Gnome Timezones Extension
Show multiple clocks in the panel.

> **Fork note:** this fork ports the extension to the GNOME Shell 45+ ESM /
> `Extension` class API. It is tested on **GNOME Shell 50**. For GNOME 42 and
> older, use [the original extension](https://github.com/Masquerade-Circus/gnome-timezones-extension).

For those who need more than one additional clock, this extension makes very easy to add two, three or more clocks to the main panel area.

There is already an excellent [MultiClock](https://github.com/mibus/MultiClock) extension, but that extension only displays a second clock. What i need is to reference 3 different clocks, my local time, UTC time and Puerto Rico time. If you have the same need, this extension can help you.

## Table of contents
- [Gnome Timezones Extension](#gnome-timezones-extension)
  - [Table of contents](#table-of-contents)
  - [How to use](#how-to-use)
  - [Configuration](#configuration)
  - [Installation](#installation)
  - [Contributing](#contributing)
    - [Scripts](#scripts)
  - [Legal](#legal)

## How to use

- Click on a clock to make it active. 
- Click on an active clock to deactivate it. 
- You can search/filter for a timezone using the input field.
- [Configure it](#configuration) as you wish.

![Gnome Timezones extension](/screenshot.jpg)

## Configuration

- **24 hours format**: Toggle between 24 and 12 hours format. Defaults to 24.
- **Show city name**: Controls if in the clock shows the city name before the time. Defaults to true.
- **Show timezone**: Shows the timezone before the time and after the City name if it is shown. Defaults to false.
- **Clear clocks**: It will deactivate all current active clocks. In case you can't remove a clock, you can use this button to clear all clocks.

## Installation

Requires GNOME Shell 45 or newer.

```bash
git clone git@github.com:dustin-hawkins/gnome-timezones-extension.git
cd gnome-timezones-extension
npm run install:local   # builds the zip and installs it
npm run enable
```

Then log out and back in — GNOME Shell only scans for new extensions at session
start, and on Wayland it cannot be restarted in place.

## Contributing

The extension is plain ESM and ships its source directly; there is no bundler
and no runtime dependencies. Edit `extension.js` and `timezones.js` in place.

### Scripts

- `npm run compile`: Compile the settings schemas.
- `npm run build`: Compile schemas and produce the distributable zip.
- `npm run install:local`: Build and install into `~/.local/share/gnome-shell/extensions`.
- `npm run enable` / `npm run disable`: Toggle the extension.
- `npm run watch-log`: Tail the GNOME Shell journal.

To test changes without logging out, run a nested shell:

```bash
dbus-run-session -- gnome-shell --devkit --wayland --mode=user
```

## Legal

Original author: [Masquerade Circus](http://masquerade-circus.net). GNOME 45+ port maintained in [this fork](https://github.com/dustin-hawkins/gnome-timezones-extension). License [Apache-2.0](https://opensource.org/licenses/Apache-2.0)