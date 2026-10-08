/* extension.js
 *
 * Show multiple clocks in the panel, for those who need more than one
 * additional clock.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import TIMEZONES from './timezones.js';

const CHECK_MARK = '✔';

const DEFAULT_CONFIG = {
    format24: true,
    showCity: true,
    showTimezone: false,
};

// PopupMenuSection renders into a plain box; swapping its actor for a
// St.ScrollView keeps long timezone lists inside a fixed height. The shell
// looks items up through actor._delegate, so that has to follow the swap.
function createScrollableSection(maxHeight) {
    const section = new PopupMenu.PopupMenuSection();

    section.actor = new St.ScrollView({
        style_class: 'popup-menu-content',
        style: `max-height: ${maxHeight}px;`,
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        child: section.box,
    });
    section.actor._delegate = section;

    return section;
}

const TimezonesIndicator = GObject.registerClass(
class TimezonesIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'Timezones');

        this._settings = settings;
        this._config = {...DEFAULT_CONFIG};
        this._filter = '';

        // tzdata drops zones over time; keep only the ones this system knows.
        this._state = [...TIMEZONES]
            .filter(id => GLib.TimeZone.new_identifier(id) !== null)
            .sort()
            .map(id => ({
                timezone: id,
                lowerTimezone: id.toLowerCase(),
                active: id === 'UTC',
                label: '',
            }));

        this._loadSettings();

        this.set_y_align(Clutter.ActorAlign.CENTER);

        this._label = new St.Label({
            text: '...',
            opacity: 150,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._buildMenu();
        this._updateLabel();

        this._wallClock = new GnomeDesktop.WallClock();
        this._wallClockId = this._wallClock.connect('notify::clock',
            () => this._updateLabel());
    }

    _onDestroy() {
        if (this._wallClockId) {
            this._wallClock.disconnect(this._wallClockId);
            this._wallClockId = 0;
        }
        this._wallClock = null;
        this._settings = null;

        super._onDestroy();
    }

    /* Menu construction */

    _buildMenu() {
        this._activeSection = createScrollableSection(200);
        this._inactiveSection = createScrollableSection(300);

        // Config items should not dismiss the menu when activated.
        const configSection = new PopupMenu.PopupMenuSection();
        configSection.itemActivated = () => {};

        this._entry = new St.Entry({
            width: 300,
            can_focus: true,
            hint_text: 'Filter timezones...',
        });
        this._entry.clutter_text.connect('text-changed', text => {
            this._filter = text.get_text().toLowerCase();
            this._updateInactiveSection();
        });

        const entryItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        entryItem.add_child(this._entry);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Active clocks'));
        this.menu.addMenuItem(this._activeSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Add more clocks'));
        this.menu.addMenuItem(entryItem);
        this.menu.addMenuItem(this._inactiveSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Config'));
        this.menu.addMenuItem(configSection);

        for (const [name, label] of [
            ['format24', '24 hour format'],
            ['showCity', 'Show city name'],
            ['showTimezone', 'Show timezone'],
        ])
            configSection.addMenuItem(this._createConfigSwitch(name, label));

        configSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        configSection.addAction('Clear clocks', () => this._clearClocks());

        this.menu.connect('open-state-changed', (menu, open) => {
            if (!open)
                return;

            this._entry.set_text('');
            this._filter = '';
            this._refreshMenu();
        });
    }

    _createConfigSwitch(name, label) {
        const item = new PopupMenu.PopupSwitchMenuItem(label, this._config[name]);
        item.connect('toggled', (o, state) => {
            this._config[name] = state;
            this._saveSettings();
            this._updateLabel();
            this._refreshMenu();
        });
        return item;
    }

    /* Rendering */

    _getLabelForTimezone(item, full = false) {
        const now = GLib.DateTime.new_now(GLib.TimeZone.new_identifier(item.timezone));

        const name = full
            ? item.timezone
            : this._config.showCity ? item.timezone.split('/').pop().replaceAll('_', ' ') : '';
        const abbreviation = full || this._config.showTimezone ? now.format('%Z') : '';
        const time = now.format(this._config.format24 ? '%R' : '%l:%M %p');

        return `${name} ${abbreviation} ${time}`.replace(/\s+/g, ' ').trim();
    }

    _updateLabel() {
        const text = this._state
            .filter(item => item.active)
            .map(item => this._getLabelForTimezone(item))
            .join('    ');

        this._label.text = text.length > 0 ? text : '...';
    }

    _refreshMenu() {
        this._state.forEach(item => (item.label = this._getLabelForTimezone(item, true)));
        this._updateActiveSection();
        this._updateInactiveSection();
    }

    _updateActiveSection() {
        this._activeSection.removeAll();
        this._state
            .filter(item => item.active)
            .forEach(item => {
                this._activeSection.addAction(`${CHECK_MARK} ${item.label}`,
                    () => this._toggleTimezone(item));
            });
    }

    _updateInactiveSection() {
        this._inactiveSection.removeAll();
        this._state
            .filter(item => !item.active && item.lowerTimezone.includes(this._filter))
            .forEach(item => {
                this._inactiveSection.addAction(item.label,
                    () => this._toggleTimezone(item));
            });
    }

    /* Actions */

    _toggleTimezone(item) {
        item.active = !item.active;
        this._updateLabel();
        this._saveSettings();
    }

    _clearClocks() {
        this._state.forEach(item => (item.active = false));
        this._updateLabel();
        this._saveSettings();
        this._refreshMenu();
    }

    /* Settings */

    _loadSettings() {
        const saved = this._settings.get_strv('timezones');
        if (saved.length > 0) {
            const selected = new Set(saved);
            this._state.forEach(item => (item.active = selected.has(item.timezone)));
        }

        const config = this._settings.get_value('config').deep_unpack();
        for (const key of Object.keys(DEFAULT_CONFIG)) {
            if (key in config)
                this._config[key] = config[key];
        }
    }

    _saveSettings() {
        this._settings.set_strv('timezones',
            this._state.filter(item => item.active).map(item => item.timezone));
        this._settings.set_value('config', new GLib.Variant('a{sb}', this._config));
    }
});

export default class TimezonesExtension extends Extension {
    enable() {
        this._indicator = new TimezonesIndicator(this.getSettings());
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'center');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
