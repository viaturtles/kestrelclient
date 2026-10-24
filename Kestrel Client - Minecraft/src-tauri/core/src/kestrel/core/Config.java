package kestrel.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;

/** Kestrel settings for one installation: <game folder>/kestrel/settings.properties. */
final class Config {
    private static final Properties props = new Properties();
    private static File file;
    private static boolean dirty;

    static synchronized void load(File gameDir) {
        if (file != null) return;
        file = new File(new File(gameDir, "kestrel"), "settings.properties");
        if (file.isFile()) {
            try (InputStream in = new FileInputStream(file)) {
                props.load(in);
            } catch (Exception e) {
                Log.error("reading settings", e);
            }
        }
        Runtime.getRuntime().addShutdownHook(new Thread(Config::save, "Kestrel settings"));
    }

    static boolean bool(String key, boolean def) {
        String v = props.getProperty(key);
        return v == null ? def : Boolean.parseBoolean(v);
    }

    static int num(String key, int def) {
        try {
            String v = props.getProperty(key);
            return v == null ? def : Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    static String str(String key) {
        return props.getProperty(key);
    }

    static void set(String key, Object value) {
        props.setProperty(key, String.valueOf(value));
        dirty = true;
    }

    static void remove(String key) {
        if (props.remove(key) != null) dirty = true;
    }

    static synchronized void save() {
        if (!dirty || file == null) return;
        try {
            file.getParentFile().mkdirs();
            try (OutputStream out = new FileOutputStream(file)) {
                props.store(out, "Kestrel Core settings");
            }
            dirty = false;
        } catch (Exception e) {
            Log.error("saving settings", e);
        }
    }

    // Kestrel-wide settings.
    static boolean customMenu() { return bool("ui.mainMenu", true); }
    static boolean blur() { return bool("ui.blur", true); }
    static final Setting BLUR = new Setting("ui.blurStrength", "Blur strength", 1, 20, 5, "");
    static final Setting SIZE = new Setting("ui.size", "Menu size", 70, 130, 100, "%");
    static final Setting OPACITY = new Setting("ui.opacity", "Panel opacity", 40, 100, 80, "%");

    /** Kestrel menus follow Minecraft's GUI scale (Options > Video Settings > GUI Scale) and Menu size. */
    static float menuScale(Bridge b, int size) {
        // Normal 0.92, Large 1.08, Auto at 1080p 1.24 (most people play on Normal).
        return (0.6f + 0.16f * b.guiScale()) * size / 100f;
    }
    static boolean hideOnDebug() { return bool("hud.hideOnDebug", true); }
}
