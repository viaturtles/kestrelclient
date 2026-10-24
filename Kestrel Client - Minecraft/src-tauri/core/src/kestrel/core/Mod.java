package kestrel.core;

import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

/**
 * A mod in the Right Shift panel. HUD mods draw a few lines of text in a small dark box; the others
 * (Tools) change how the game works. Settings live in Config under mod.<id>.
 */
abstract class Mod {
    // The tools are created first so Hooks can reach them directly (see Tools).
    static final Tools.Zoom ZOOM = new Tools.Zoom();
    static final Tools.Fullbright FULLBRIGHT = new Tools.Fullbright();
    static final Tools.Crosshair CROSSHAIR = new Tools.Crosshair();
    static final Tools.Outline OUTLINE = new Tools.Outline();
    static final Tools.Damage DAMAGE = new Tools.Damage();
    static final Tools.ToggleSprint SPRINT = new Tools.ToggleSprint();
    static final Tools.Chat CHAT = new Tools.Chat();
    static final Tools.Screenshots SCREENSHOTS = new Tools.Screenshots();
    static final Tools.Pause PAUSE = new Tools.Pause();
    static final Tools.Alerts ALERTS = new Tools.Alerts();
    static final Tools.Keybinds KEYBINDS = new Tools.Keybinds();
    static final Tools.AutoGg AUTO_GG = new Tools.AutoGg();
    static final Tools.Requeue REQUEUE = new Tools.Requeue();
    static final Tools.Triangulation TRIANGULATION = new Tools.Triangulation();
    static final TabList TABLIST = new TabList();
    static final Ping PING = new Ping();
    static final Tps TPS = new Tps();
    static final CapeMod CAPE = new CapeMod();

    static final List<Mod> ALL = Arrays.asList(new Fps(), new Cps(), new Coordinates(), new Clock(), PING, TPS,
            ZOOM, FULLBRIGHT, CROSSHAIR, OUTLINE, DAMAGE, SPRINT, CAPE, TABLIST, CHAT, SCREENSHOTS, PAUSE, ALERTS, KEYBINDS,
            AUTO_GG, REQUEUE, TRIANGULATION);

    final String id, name, description, icon;
    /** True for mods that draw a box on the HUD. */
    final boolean hud;
    private final boolean defaultOn;
    final List<Setting> settings = new ArrayList<Setting>();
    final Setting background, opacity, shadow, size;

    Mod(String id, String name, String description, String icon, boolean defaultOn) {
        this(id, name, description, icon, defaultOn, true);
    }

    Mod(String id, String name, String description, String icon, boolean defaultOn, boolean hud) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.icon = icon;
        this.defaultOn = defaultOn;
        this.hud = hud;
        if (hud) {
            background = toggle("background", "Background", true);
            opacity = slider("opacity", "Background opacity", 0, 100, 45, "%");
            shadow = toggle("shadow", "Text shadow", false);
            size = slider("size", "Size", 50, 200, 100, "%");
        } else {
            background = opacity = shadow = size = null;
        }
    }

    Setting choice(String key, String label, int def, String... choices) {
        Setting s = Setting.choice("mod." + id + "." + key, label, def, choices);
        settings.add(s);
        return s;
    }

    Setting key(String key, String label, int def) {
        Setting s = Setting.key("mod." + id + "." + key, label, def);
        settings.add(s);
        return s;
    }

    static final String[] CATEGORIES = {"HUD", "Gameplay", "Chat", "Hypixel"};

    /** Which section of the Right Shift panel this mod sits in (index into CATEGORIES). */
    int category() {
        if (hud && !id.equals("togglesprint") && !id.equals("triangulation")) return 0;
        if (id.equals("tablist") || id.equals("chat") || id.equals("screenshots") || id.equals("pause")) return 2;
        if (id.equals("alerts") || id.equals("keybinds") || id.equals("autogg") || id.equals("requeue")) return 3;
        return 1;
    }

    /** Shown under the settings, for things worth knowing before turning it on. */
    String note() { return null; }

    /** Called every client tick (20 a second) in a world, even when the mod is off. */
    void tick(Bridge b) {
    }

    boolean on() { return Config.bool("mod." + id + ".on", defaultOn); }
    void setOn(boolean v) { Config.set("mod." + id + ".on", v); }

    Setting toggle(String key, String label, boolean def) {
        Setting s = new Setting("mod." + id + "." + key, label, def);
        settings.add(s);
        return s;
    }

    Setting slider(String key, String label, int min, int max, int def, String unit) {
        Setting s = new Setting("mod." + id + "." + key, label, min, max, def, unit);
        settings.add(s);
        return s;
    }

    void reset() {
        for (Setting s : settings) Config.remove(s.key);
    }

    // ---- HUD position (HUD editor). Saved as a fraction of the screen (x 10000), so it survives
    // resolution and GUI scale changes. No position = the automatic stack in the top-left corner.
    boolean placed() { return Config.num("mod." + id + ".x", -1) >= 0; }
    float px() { return Config.num("mod." + id + ".x", 0) / 10000f; }
    float py() { return Config.num("mod." + id + ".y", 0) / 10000f; }
    void place(float fx, float fy) {
        Config.set("mod." + id + ".x", Math.round(Math.max(0, Math.min(1, fx)) * 10000));
        Config.set("mod." + id + ".y", Math.round(Math.max(0, Math.min(1, fy)) * 10000));
    }
    void unplace() {
        Config.remove("mod." + id + ".x");
        Config.remove("mod." + id + ".y");
    }

    /** The HUD box's text (HUD mods); null or empty draws nothing. */
    String[] lines(Bridge b) { return null; }

    /** Called every frame in a world, even when hidden. */
    void update(Bridge b) {
    }

    /** In HUD lines, LABEL switches between the value (white) and its label (grey): "404" + LABEL + " FPS". */
    static final char LABEL = '\u0001';

    /** Ping in ms for signal bars in front of the first line; -2 for no bars, -1 for unknown. */
    int bars(Bridge b) { return -2; }

    private static float lineWidth(String line) {
        float w = 0;
        boolean label = false;
        for (String part : line.split(String.valueOf(LABEL), -1)) {
            w += Text.width(label ? Text.MEDIUM : Text.SEMIBOLD, label ? 12 : 13, part);
            label = !label;
        }
        return w;
    }

    private static void drawLine(String line, float x, float y, float lh, boolean shadow) {
        boolean label = false;
        for (String part : line.split(String.valueOf(LABEL), -1)) {
            int font = label ? Text.MEDIUM : Text.SEMIBOLD;
            float size = label ? 12 : 13, dy = label ? (lh - Text.lineHeight(font, size)) / 2 + 0.5f : 0;
            if (shadow) Text.draw(font, size, part, x + 1, y + dy + 1, 0x99000000);
            x += Text.draw(font, size, part, x, y + dy, label ? Ui.T2 : Ui.T1);
            label = !label;
        }
    }

    /** Ping bars in HUD units: bar width, and the width of all four. */
    private static final float SIGNAL_UNIT = 1.7f, SIGNAL_W = 4 * SIGNAL_UNIT + 3 * SIGNAL_UNIT * 0.6f;

    /** The box's {width, height} without drawing it. */
    float[] measure(Bridge b) {
        String[] lines = lines(b);
        if (lines == null || lines.length == 0) return new float[]{0, 0};
        float lh = Text.lineHeight(Text.SEMIBOLD, 13), w = 0;
        for (String l : lines) w = Math.max(w, lineWidth(l));
        if (bars(b) != -2) w += SIGNAL_W + 5;
        return new float[]{w + 16, lines.length * lh + (lines.length - 1) * 2 + 10};
    }

    /** Draws the box at (x, y) in the current units. Returns its {width, height}. */
    float[] draw(Bridge b, float x, float y) {
        String[] lines = lines(b);
        if (lines == null || lines.length == 0) return new float[]{0, 0};
        float[] size = measure(b);
        float lh = Text.lineHeight(Text.SEMIBOLD, 13), w = size[0], h = size[1];
        if (background.bool()) Gfx.rrect(x, y, w, h, 5, Gfx.rgba(0x0B0C0E, opacity.num() / 100f));
        float tx = x + 8;
        int ms = bars(b);
        if (ms != -2) {
            // The same bars as the Tab list, centred on the first line of text.
            float tallest = SIGNAL_UNIT * 5.3f;
            Ui.signal(tx, y + 5 + lh / 2 + tallest / 2, SIGNAL_UNIT, ms);
            tx += SIGNAL_W + 5;
        }
        for (int i = 0; i < lines.length; i++) drawLine(lines[i], tx, y + 5 + i * (lh + 2), lh, shadow.bool());
        return new float[]{w, h};
    }

    // ---- the mods --------------------------------------------------------------------------

    static final class Fps extends Mod {
        Fps() { super("fps", "FPS", "Frames per second", "gauge", true); }
        String[] lines(Bridge b) { return new String[]{b.fps() + "" + LABEL + " FPS"}; }
    }

    static final class Cps extends Mod {
        private final Setting right = toggle("right", "Show right click", true);
        private final ArrayDeque<Long> left = new ArrayDeque<Long>(), rightClicks = new ArrayDeque<Long>();
        private boolean leftDown, rightDown;

        Cps() { super("cps", "CPS", "Clicks per second", "click", true); }

        void update(Bridge b) {
            long now = System.currentTimeMillis();
            boolean l = Mouse.isButtonDown(0), r = Mouse.isButtonDown(1);
            if (!b.screenOpen()) {
                if (l && !leftDown) left.add(now);
                if (r && !rightDown) rightClicks.add(now);
            }
            leftDown = l;
            rightDown = r;
            while (!left.isEmpty() && now - left.peek() > 1000) left.poll();
            while (!rightClicks.isEmpty() && now - rightClicks.peek() > 1000) rightClicks.poll();
        }

        String[] lines(Bridge b) {
            String cps = LABEL + " CPS";
            return new String[]{right.bool() ? left.size() + "" + LABEL + " | " + LABEL + rightClicks.size() + cps : left.size() + cps};
        }
    }

    static final class Coordinates extends Mod {
        private static final String[] FACING = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};
        private final Setting facing = toggle("facing", "Show facing", true);

        Coordinates() { super("coords", "Coordinates", "Position and facing", "compass", false); }

        String[] lines(Bridge b) {
            double[] p = b.position();
            if (p == null) p = new double[]{-214, 72, 1038, 135};
            // One line: "XYZ 128  64  -340  NE" (labels grey).
            String xyz = LABEL + "XYZ " + LABEL + (int) Math.floor(p[0]) + "  " + (int) Math.floor(p[1]) + "  " + (int) Math.floor(p[2]);
            if (!facing.bool()) return new String[]{xyz};
            int dir = (int) Math.floor(p[3] * 8 / 360 + 0.5) & 7;
            return new String[]{xyz + LABEL + "  " + FACING[dir]};
        }
    }

    static final class Ping extends Mod {
        Ping() { super("ping", "Ping", "Your connection", "wifi", false); }

        int bars(Bridge b) { return b.inWorld() ? b.ping() : 34; }

        String[] lines(Bridge b) {
            int p = bars(b);
            return new String[]{(p < 0 ? "-" : String.valueOf(p)) + LABEL + " ms"};
        }
    }

    /** Server ticks per second, from how often the server's time updates arrive (one per 20 ticks). */
    static final class Tps extends Mod {
        private static volatile long last;
        private static volatile double tps = 20;

        Tps() { super("tps", "TPS", "Server speed", "activity", false); }

        /** A time update arrived from the server (network thread). */
        static void timeUpdate() {
            long now = System.nanoTime();
            if (last != 0) {
                double secs = (now - last) / 1e9;
                if (secs > 0.2 && secs < 30) tps = tps * 0.7 + Math.min(20, 20 / secs) * 0.3;
            }
            last = now;
        }

        static void restart() {
            last = 0;
            tps = 20;
        }

        String[] lines(Bridge b) {
            return new String[]{String.format(java.util.Locale.ROOT, "%.1f", b.inWorld() ? tps : 20.0) + LABEL + " TPS"};
        }
    }

    /** Your Kestrel cape (picked in the launcher's Cosmetics tab), with optional cloth physics. */
    static final class CapeMod extends Mod {
        final Setting cloth = toggle("cloth", "Cloth physics", true);

        CapeMod() { super("cape", "Cape", "Your Kestrel cape", "shirt", true, false); }

        String note() { return "Pick your cape in the launcher's Cosmetics tab. Press F5 to see it."; }
    }

    static final class Clock extends Mod {
        private final Setting twentyFour = toggle("24h", "24-hour clock", false);

        Clock() { super("clock", "Clock", "Real-world time", "clock", false); }

        String[] lines(Bridge b) {
            return new String[]{new SimpleDateFormat(twentyFour.bool() ? "HH:mm" : "h:mm a").format(new Date())};
        }
    }
}

/** A switch, slider, choice or key shown on a mod's settings page. */
final class Setting {
    static final int TOGGLE = 0, SLIDER = 1, CHOICE = 2, KEY = 3;
    final String key, label, unit;
    final int type;
    final boolean isSlider, defBool;
    final int min, max, defNum;
    final String[] choices;

    private Setting(String key, String label, int type, boolean defBool, int min, int max, int defNum, String unit, String[] choices) {
        this.key = key; this.label = label; this.type = type; this.defBool = defBool;
        this.min = min; this.max = max; this.defNum = defNum; this.unit = unit; this.choices = choices;
        this.isSlider = type == SLIDER;
    }

    Setting(String key, String label, boolean def) {
        this(key, label, TOGGLE, def, 0, 0, 0, "", null);
    }

    Setting(String key, String label, int min, int max, int def, String unit) {
        this(key, label, SLIDER, false, min, max, def, unit, null);
    }

    static Setting choice(String key, String label, int def, String... choices) {
        return new Setting(key, label, CHOICE, false, 0, choices.length - 1, def, "", choices);
    }

    /** An LWJGL key code; mouse buttons are stored like Minecraft does (button - 100), 0 is none. */
    static Setting key(String key, String label, int def) {
        return new Setting(key, label, KEY, false, 0, 0, def, "", null);
    }

    boolean bool() { return Config.bool(key, defBool); }
    int num() {
        int v = Config.num(key, defNum);
        return type == KEY ? v : Math.max(min, Math.min(max, v));
    }
    void set(Object v) { Config.set(key, v); }
    String choice() { return choices[num()]; }

    /** True while this key setting's key (or mouse button) is held. */
    boolean held() {
        int k = num();
        if (k == 0) return false;
        return k < 0 ? Mouse.isButtonDown(k + 100) : Keyboard.isKeyDown(k);
    }

    static String keyName(int k) {
        if (k == 0) return "None";
        if (k < 0) return "Mouse " + (k + 101);
        String n = Keyboard.getKeyName(k);
        if (n == null) return "Key " + k;
        if (n.startsWith("L") && n.length() > 3 && !n.equals("LBRACKET")) n = "Left " + n.substring(1);
        else if (n.startsWith("R") && n.length() > 3 && !n.equals("RETURN") && !n.equals("RBRACKET")) n = "Right " + n.substring(1);
        return n.length() <= 1 ? n : n.charAt(0) + n.substring(1).toLowerCase();
    }
}
