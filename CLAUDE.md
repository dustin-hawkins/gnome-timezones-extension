# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GNOME Shell panel extension showing multiple timezone clocks. This is a fork of
[Masquerade-Circus/gnome-timezones-extension](https://github.com/Masquerade-Circus/gnome-timezones-extension),
ported from the GNOME 42 era to the **GNOME 45+ ESM / `Extension` class API**. Verified on GNOME Shell 50.1.

UUID: `timezones@dustin-hawkins`

## Commands

```bash
npm run build          # produce timezones@dustin-hawkins.zip
npm run lint           # build + run the shexli EGO static analyzer (must report "clean")
npm run install:local  # build, install to ~/.local/share/gnome-shell/extensions, compile schemas
npm run watch-log      # tail the GNOME Shell journal
```

`npm install` is not needed — there are no dependencies. `shexli` is not vendored; install it when
linting: `python3 -m venv venv && . venv/bin/activate && pip install -U shexli`.

`npm run enable` goes through the running shell's D-Bus and fails with "doesn't exist" until a login
has picked the extension up. To enable ahead of that, write the uuid into
`org.gnome.shell enabled-extensions` directly.

## The testing constraint (read this first)

**GNOME Shell scans the extensions directory only at session start**, and on Wayland it cannot be
restarted in place. Installing does not make the running shell see the extension —
`gnome-extensions info <uuid>` will say "doesn't exist" and that is expected, not a failure.

Do not conclude a change works because it installed without error. Verify in a **nested shell**:

```bash
dbus-run-session -- gnome-shell --devkit --wayland --mode=user --unsafe-mode
```

Notes on that command, each learned the hard way:
- `--nested` was **removed**; `--devkit` is the current nested mode. Plain `--wayland` tries to take
  over the real seat and dies with `Failed to take control of the session: ... EBUSY`.
- `--mode=user` is required; the default devkit session mode does not load user extensions.
- `--unsafe-mode` enables `org.gnome.Shell.Eval`, which is how you drive and inspect the extension.
- `dbus-run-session` is required to avoid colliding with the real shell on `org.gnome.Shell`.

Query state and drive the UI over the nested session's bus:

```bash
gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionInfo "timezones@dustin-hawkins"
# state: 1 = ENABLED, 2 = DISABLED, 3 = ERROR; check the 'error' field too

gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Eval 'Main.panel.statusArea["timezones@dustin-hawkins"]._label.text'
```

Shell JS is compiled into the gnome-shell binary and is **not** extractable with `gresource` on this
system. For ground truth on shell APIs, fetch the matching branch instead:
`https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/gnome-50/js/ui/popupMenu.js`

Screenshots via `org.gnome.Shell.Screenshot` are portal-gated and return `AccessDenied`.

## Architecture

Three files, no build step beyond zipping:

- `extension.js` — everything. `TimezonesExtension extends Extension` (enable/disable only) owns a
  `TimezonesIndicator`, a `GObject.registerClass`ed `PanelMenu.Button` subclass that holds all state
  and UI. The indicator owns its own teardown via `_onDestroy()`; `disable()` just destroys it.
- `timezones.js` — a plain `export default [...]` of IANA zone IDs.
- `schemas/` — two keys: `timezones` (`as`) and `config` (`a{sb}`).

**There is no bundler, deliberately.** The original used rollup + buble; buble targets ES5, which
cannot express the ESM a GNOME 45+ extension must ship. GNOME loads relative module imports directly.
Do not reintroduce a build step — edit `extension.js` and `timezones.js` in place.

### GNOME 45+ API points that this code depends on

- `PanelMenu.Button` and `PopupBaseMenuItem` **are** actors. There is no `.actor` property; use
  `add_child()` directly.
- `St.ScrollView` takes a `child:` construct property. `add_actor()` is gone.
- `createScrollableSection()` swaps a `PopupMenuSection`'s `.actor` for a `St.ScrollView`. The shell
  resolves menu items through `actor._delegate` (`PopupMenuBase._getMenuItems()`), so the swap
  **must** carry `_delegate` across or the section silently appears empty.
- Use `GLib.TimeZone.new_identifier()`, not `GLib.TimeZone.new()` — the latter is deprecated and
  collides with the GJS constructor. It returns `null` for unknown zones.
- Signals use `connectObject(..., this)` / `disconnectObject(this)`, which ties handler lifetime to
  the actor. This works on `Signals.EventEmitter` objects (e.g. `this.menu`) as well as GObjects.
  Plain `connect()` with a disconnect in `_onDestroy()` is functionally fine but trips shexli
  (see below), so prefer `connectObject`.

### Settings

The schema id is `org.gnome.shell.extensions.dustin-hawkins-timezones`, stored at
`/org/gnome/shell/extensions/dustin-hawkins-timezones/`. It is deliberately distinct from upstream's
(`org.gnome.shell.extensions.timezones` at `.../timezone/`) so the two extensions don't share saved
data. Once published, do not change the id or path — users' saved clocks live there.

`metadata.json`'s `settings-schema` must be the schema id. Upstream had the uuid there, which broke
`getSettings()`.

## EGO review / shexli

`npm run lint` must report `clean`. Two rules this code was tripped by:

- **EGO-P-006** — never ship `schemas/gschemas.compiled`. The zip script excludes it;
  `gnome-extensions install` and the EGO installer compile schemas themselves.
- **EGO-L-003** — the analyzer is static and cannot see teardown in `_onDestroy()`. It flags any
  `connect()` in `enable()` without a sibling `disconnect()`. `connectObject` avoids the finding.

## Maintaining timezones.js

Zone IDs drift as tzdata retires names. The list should exactly match the system's canonical zones.
To audit it, write a throwaway module next to a copy of `timezones.js` and run it with `gjs -m`
(`gjs -m -c '...'` and `-e` do **not** work — module mode needs a real file, and a relative import
resolves against the script's directory, not the cwd):

```js
import GLib from 'gi://GLib';
import TIMEZONES from './tz.js';
const [, data] = GLib.file_get_contents('/usr/share/zoneinfo/zone1970.tab');
const system = new Set();
for (const line of new TextDecoder().decode(data).split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    for (const z of line.split('\t')[2].split(',')) system.add(z.trim());
}
print(`invalid: ${TIMEZONES.filter(z => GLib.TimeZone.new_identifier(z) === null)}`);
print(`missing: ${[...system].filter(z => !TIMEZONES.includes(z))}`);
```

As of the last pass: 348 entries, 0 invalid, 0 missing. The indicator also filters unknown zones at startup as a safety net, so stale
IDs degrade to "missing from the list" rather than breaking the panel label.

## Gotcha: dconf writes from the agent sandbox

`gsettings set` / `dconf write` targeting the **live session's** dconf silently no-op from inside the
tool sandbox: they exit 0, and reading back in the same sandbox returns the value you just "wrote".
The real database is unchanged. Verify with an independent `dconf read`, and perform such writes with
the sandbox disabled. Child processes spawned under `dbus-run-session` (like the nested shell) do
write through normally.
