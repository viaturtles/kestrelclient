package kestrel.core;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import javax.imageio.ImageIO;

/**
 * Your Kestrel capes. At launch the launcher writes every cape you own to <game folder>/kestrel/capes/<id>.png
 * (a Minecraft cape sheet at any resolution; animated capes stack frames top to bottom) and
 * kestrel/cosmetics.properties (equipped, capes, cape.<id>.name / frames / fps). Picking a cape in game
 * switches it at once and writes kestrel/cape-choice.properties, which the launcher saves to your account
 * when the game closes. Only drawn on your own player until Kestrel can see other players' capes.
 */
final class Cape {
    static final class Entry {
        final String id, name, dir;
        final int frames, fps;
        Object[] textures; // loaded on first use (render thread)
        Entry(String id, String name, int frames, int fps, String dir) { this.id = id; this.name = name; this.frames = frames; this.fps = fps; this.dir = dir; }
    }

    /** Returned by location() when you hid every cape in game (Minecraft then draws none). */
    static final Object NONE = new Object();

    private static List<Entry> entries, mcEntries;
    private static String equipped = "", mcEquipped = "";
    /** True once you pick a Minecraft cape in game (until then Minecraft shows the one on your account). */
    private static boolean mcPicked;

    private static void ensure(Bridge b) {
        if (entries != null) return;
        entries = new ArrayList<Entry>();
        mcEntries = new ArrayList<Entry>();
        try {
            File f = new File(b.gameDir(), "kestrel/cosmetics.properties");
            if (!f.isFile()) return;
            Properties p = new Properties();
            InputStream in = new FileInputStream(f);
            try { p.load(in); } finally { in.close(); }
            for (String id : p.getProperty("capes", "").split(",")) {
                id = id.trim();
                if (id.isEmpty() || !new File(b.gameDir(), "kestrel/capes/" + id + ".png").isFile()) continue;
                entries.add(new Entry(id, p.getProperty("cape." + id + ".name", id), num(p, "cape." + id + ".frames", 1), num(p, "cape." + id + ".fps", 0), "capes"));
            }
            // Capes on your Minecraft account (Mojang's), written by the launcher when you're signed in.
            for (String id : p.getProperty("mc.capes", "").split(",")) {
                id = id.trim();
                if (id.isEmpty() || !new File(b.gameDir(), "kestrel/mc-capes/" + id + ".png").isFile()) continue;
                mcEntries.add(new Entry(id, p.getProperty("mc." + id + ".name", "Cape"), 1, 0, "mc-capes"));
            }
            equipped = p.getProperty("equipped", "").trim();
            mcEquipped = p.getProperty("mc.equipped", "").trim();
            Log.info("capes: " + entries.size() + " Kestrel, " + mcEntries.size() + " Minecraft" + (equipped.isEmpty() ? "" : ", wearing " + equipped));
        } catch (Exception e) {
            Log.error("capes", e);
        }
    }

    static List<Entry> list(Bridge b) { ensure(b); return entries; }
    static List<Entry> minecraft(Bridge b) { ensure(b); return mcEntries; }

    static String equipped(Bridge b) { ensure(b); return equipped; }
    static String mcEquipped(Bridge b) { ensure(b); return mcEquipped; }

    /** Wear a Kestrel cape (empty id = none): shows straight away, saved to your account when the game closes. */
    static void wear(Bridge b, String id) {
        ensure(b);
        equipped = id == null ? "" : id;
        saveChoice(b);
    }

    /** Show one of your Minecraft capes (empty = none): shows here at once, set on your Minecraft account when the game closes. */
    static void wearMc(Bridge b, String id) {
        ensure(b);
        mcEquipped = id == null ? "" : id;
        mcPicked = true;
        saveChoice(b);
    }

    private static void saveChoice(Bridge b) {
        try {
            Properties p = new Properties();
            p.setProperty("equipped", equipped);
            if (mcPicked) p.setProperty("mc", mcEquipped);
            OutputStream out = new FileOutputStream(new File(b.gameDir(), "kestrel/cape-choice.properties"));
            try { p.store(out, "Picked in game; the Kestrel launcher saves it to your accounts"); } finally { out.close(); }
        } catch (Exception e) {
            Log.error("cape choice", e);
        }
    }

    /**
     * The cape texture for your player right now: your Kestrel cape (animated ones change frame) first, then a
     * Minecraft cape picked in game; NONE when you hid them in game; null to leave Minecraft's own choice.
     */
    static Object location(Bridge b) {
        Entry e = find(list(b), equipped(b));
        if (e == null && mcPicked) {
            e = find(mcEntries, mcEquipped);
            if (e == null) return NONE;
        }
        if (e == null) return null;
        Object[] t = textures(b, e);
        if (t == null) return null;
        if (t.length == 1 || e.fps <= 0) return t[0];
        return t[(int) ((System.currentTimeMillis() * e.fps / 1000) % t.length)];
    }

    /** GL texture of a cape's first frame (Kestrel or Minecraft cape, for previews), or -1. */
    static int preview(Bridge b, String id) {
        Entry e = find(list(b), id);
        if (e == null) e = find(mcEntries, id);
        Object[] t = e == null ? null : textures(b, e);
        return t == null ? -1 : b.glTexture(t[0]);
    }

    private static Entry find(List<Entry> in, String id) {
        if (id == null || id.isEmpty()) return null;
        for (Entry e : in) if (e.id.equals(id)) return e;
        return null;
    }

    private static Object[] textures(Bridge b, Entry e) {
        if (e.textures != null) return e.textures.length == 0 ? null : e.textures;
        e.textures = new Object[0];
        try {
            BufferedImage img = ImageIO.read(new File(b.gameDir(), "kestrel/" + e.dir + "/" + e.id + ".png"));
            if (img == null || img.getWidth() < 64) return null;
            int fw = img.getWidth(), fh = fw / 2;
            int n = Math.max(1, Math.min(img.getHeight() / fh, e.frames));
            Object[] out = new Object[n];
            for (int i = 0; i < n; i++) {
                // Each frame is its own 2:1 texture; Minecraft's cape model maps onto any resolution.
                BufferedImage frame = new BufferedImage(fw, fh, BufferedImage.TYPE_INT_ARGB);
                frame.getGraphics().drawImage(img.getSubimage(0, i * fh, fw, fh), 0, 0, null);
                out[i] = b.texture("kestrel_cape_" + e.id + "_" + i, frame);
            }
            e.textures = out;
            return out;
        } catch (Exception ex) {
            Log.error("cape " + e.id, ex);
            return null;
        }
    }

    private static int num(Properties p, String key, int def) {
        try { return Integer.parseInt(p.getProperty(key, String.valueOf(def)).trim()); } catch (NumberFormatException e) { return def; }
    }
}
