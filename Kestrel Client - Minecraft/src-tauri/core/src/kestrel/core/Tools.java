package kestrel.core;

import java.awt.Color;
import java.awt.Image;
import java.awt.Toolkit;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.lwjgl.input.Keyboard;
import org.lwjgl.opengl.GL11;

/** The mods that change how the game works rather than draw a HUD box (plus Toggle sprint and Triangulation). */
final class Tools {
    private Tools() {
    }

    static boolean hypixel(Bridge b) {
        String s = b.server();
        return s != null && s.toLowerCase(Locale.ROOT).contains("hypixel");
    }

    static void open(File f) {
        try {
            new ProcessBuilder("explorer.exe", f.getAbsolutePath()).start();
        } catch (Exception e) {
            Log.error("opening " + f, e);
        }
    }

    // ---- Zoom ------------------------------------------------------------------------------

    static final class Zoom extends Mod {
        final Setting key = key("key", "Zoom key", Keyboard.KEY_C);
        final Setting amount = slider("amount", "Zoom", 2, 10, 4, "x");
        final Setting smooth = toggle("smooth", "Smooth camera while zoomed", true);
        final Setting animate = toggle("animate", "Animate in and out", true);
        private float current = 1;
        private long last;
        private boolean zooming, savedSmooth;

        Zoom() { super("zoom", "Zoom", "Hold a key to zoom in", "zoom-in", true, false); }

        String note() { return "With OptiFine, Kestrel's zoom steps aside when OptiFine's zoom uses the same key."; }

        /** EntityRenderer.getFOVModifier's result; only the world's FOV is changed, not the hand's. */
        float fov(Bridge b, float fov, boolean world) {
            if (!world) return fov;
            boolean want = on() && !b.screenOpen() && key.held() && !(b.optifine() && b.keyCode("of.key.zoom") == key.num());
            if (want != zooming) {
                zooming = want;
                if (smooth.bool()) {
                    if (want) {
                        savedSmooth = b.smoothCamera();
                        b.smoothCamera(true);
                    } else {
                        b.smoothCamera(savedSmooth);
                    }
                }
            }
            long now = System.nanoTime();
            float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
            last = now;
            float target = zooming ? 1f / amount.num() : 1f;
            current = animate.bool() ? current + (target - current) * Math.min(1, dt * 14) : target;
            if (!zooming && Math.abs(current - 1) < 0.002f) current = 1;
            return fov * current;
        }
    }

    // ---- Fullbright ------------------------------------------------------------------------

    static final class Fullbright extends Mod {
        private static final String SAVED = "mod.fullbright.savedGamma";

        Fullbright() { super("fullbright", "Fullbright", "See in the dark", "sun", false, false); }

        void tick(Bridge b) {
            if (on()) {
                if (b.gamma() < 99) {
                    Config.set(SAVED, Float.toString(b.gamma()));
                    b.gamma(100);
                }
            } else if (Config.str(SAVED) != null) {
                try {
                    b.gamma(Float.parseFloat(Config.str(SAVED)));
                } catch (NumberFormatException e) {
                    b.gamma(0.5f);
                }
                Config.remove(SAVED);
            }
        }
    }

    // ---- Crosshair -------------------------------------------------------------------------

    static final class Crosshair extends Mod {
        private static final int[] COLOURS = {0xFFFFFF, 0x3DD879, 0xFF4D5E, 0x4DE1FF, 0xFFE14D, 0xFF7AD9};
        final Setting style = choice("style", "Style", 0, "Cross", "Dot", "Circle", "Cross and dot", "Square");
        final Setting colour = choice("colour", "Colour", 0, "White", "Green", "Red", "Cyan", "Yellow", "Pink", "Invert (vanilla)");
        final Setting length = slider("length", "Size", 2, 15, 5, "");
        final Setting gap = slider("gap", "Gap", 0, 8, 2, "");
        final Setting thickness = slider("thickness", "Thickness", 1, 4, 1, "");
        final Setting alpha = slider("alpha", "Opacity", 20, 100, 100, "%");
        final Setting outline = toggle("outline", "Dark outline", true);
        /** Whether vanilla would draw its crosshair this frame (GuiIngame.showCrosshair). */
        volatile boolean vanilla;

        Crosshair() { super("crosshair", "Crosshair", "Shape and colour", "crosshair", false, false); }

        /** Draws at the screen centre in GUI pixels (between Gfx.begin and end at the GUI scale). */
        void draw(float cx, float cy, float px) {
            int st = style.num();
            boolean invert = colour.num() == COLOURS.length;
            int c = Gfx.rgba(invert ? 0xFFFFFF : COLOURS[colour.num()], alpha.num() / 100f);
            float t = thickness.num(), len = length.num(), g = gap.num();
            java.util.List<float[]> rects = new java.util.ArrayList<float[]>();
            if (st == 0 || st == 3) {
                rects.add(new float[]{cx - t / 2, cy - t / 2 - g - len, t, len});
                rects.add(new float[]{cx - t / 2, cy + t / 2 + g, t, len});
                rects.add(new float[]{cx - t / 2 - g - len, cy - t / 2, len, t});
                rects.add(new float[]{cx + t / 2 + g, cy - t / 2, len, t});
            }
            if (st == 1 || st == 3) rects.add(new float[]{cx - t / 2, cy - t / 2, t, t});
            if (st == 4) {
                float r = g + len / 2;
                rects.add(new float[]{cx - r, cy - r, 2 * r, t});
                rects.add(new float[]{cx - r, cy + r - t, 2 * r, t});
                rects.add(new float[]{cx - r, cy - r + t, t, 2 * r - 2 * t});
                rects.add(new float[]{cx + r - t, cy - r + t, t, 2 * r - 2 * t});
            }
            if (outline.bool() && !invert) {
                for (float[] r : rects) Gfx.rect(r[0] - px, r[1] - px, r[2] + 2 * px, r[3] + 2 * px, Gfx.rgba(0, 0.55f * alpha.num() / 100f));
                if (st == 2) ring(cx, cy, g + len / 2 - px, t + 2 * px, Gfx.rgba(0, 0.55f * alpha.num() / 100f));
            }
            if (invert) GL11.glBlendFunc(GL11.GL_ONE_MINUS_DST_COLOR, GL11.GL_ONE_MINUS_SRC_COLOR);
            for (float[] r : rects) Gfx.rect(r[0], r[1], r[2], r[3], c);
            if (st == 2) ring(cx, cy, g + len / 2, t, c);
            if (invert) GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
        }

        private static void ring(float cx, float cy, float r, float t, int c) {
            Gfx.color(c);
            GL11.glBegin(GL11.GL_TRIANGLE_STRIP);
            for (int i = 0; i <= 48; i++) {
                double a = i * Math.PI * 2 / 48;
                GL11.glVertex2f(cx + (float) Math.cos(a) * r, cy + (float) Math.sin(a) * r);
                GL11.glVertex2f(cx + (float) Math.cos(a) * (r + t), cy + (float) Math.sin(a) * (r + t));
            }
            GL11.glEnd();
        }
    }

    // ---- Block outline ---------------------------------------------------------------------

    static final class Outline extends Mod {
        private static final int[] COLOURS = {0x000000, 0xFFFFFF, 0x3DD879, 0xFF4D5E, 0x4DE1FF, 0xFFE14D, 0xFF7AD9};
        final Setting colour = choice("colour", "Colour", 0, "Black (vanilla)", "White", "Green", "Red", "Cyan", "Yellow", "Pink", "Rainbow");
        final Setting alpha = slider("alpha", "Opacity", 10, 100, 40, "%");
        final Setting width = slider("width", "Thickness", 1, 8, 2, "");
        final Setting fill = toggle("fill", "Fill the block", false);
        final Setting fillAlpha = slider("fillAlpha", "Fill opacity", 5, 60, 15, "%");

        Outline() { super("outline", "Block outline", "The box you aim at", "box", false, false); }

        int rgb() {
            if (colour.num() < COLOURS.length) return COLOURS[colour.num()];
            return Color.HSBtoRGB((System.currentTimeMillis() % 4000) / 4000f, 0.7f, 1f) & 0xFFFFFF;
        }
    }

    // ---- Damage effects --------------------------------------------------------------------

    static final class Damage extends Mod {
        private static final float[][] TINTS = {{1, 0, 0}, {1, 0.5f, 0}, {1, 0.3f, 0.75f}, {0.6f, 0.2f, 1}, {0.2f, 0.5f, 1}, {0.2f, 1, 0.4f}};
        final Setting colour = choice("colour", "Hit colour", 0, "Red (vanilla)", "Orange", "Pink", "Purple", "Blue", "Green", "No colour");
        final Setting strength = slider("strength", "Hit colour strength", 5, 100, 30, "%");
        final Setting shake = toggle("shake", "Camera shake when you're hurt", true);

        Damage() { super("damage", "Damage effects", "Hit colour, no shake", "heart-crack", false, false); }

        /** One of the four values RendererLivingEntity uses for the red hurt tint (r, g, b, strength). */
        float tint(int i, float vanilla) {
            if (!on()) return vanilla;
            int c = colour.num();
            if (c >= TINTS.length) return i == 3 ? 0 : vanilla;
            return i == 3 ? strength.num() / 100f : TINTS[c][i];
        }
    }

    // ---- Toggle sprint (a HUD mod) --------------------------------------------------------

    static final class ToggleSprint extends Mod {
        final Setting sprint = toggle("sprint", "Toggle sprint", true);
        final Setting sneak = toggle("sneak", "Toggle sneak", false);
        final Setting status = toggle("status", "Show what's toggled on the HUD", true);
        private boolean sprintOn, sneakOn, sprintWas, sneakWas;

        ToggleSprint() { super("togglesprint", "Toggle sprint", "Tap instead of hold", "footprints", false); }

        private static boolean down(int k) {
            if (k == 0) return false;
            return k < 0 ? org.lwjgl.input.Mouse.isButtonDown(k + 100) : Keyboard.isKeyDown(k);
        }

        void tick(Bridge b) {
            int sk = b.keyCode("sprint"), nk = b.keyCode("sneak");
            boolean sDown = down(sk), nDown = down(nk), free = b.inWorld() && !b.screenOpen();
            boolean wasSprint = sprintOn, wasSneak = sneakOn;
            if (!on() || !b.inWorld()) {
                sprintOn = sneakOn = false;
            } else if (free) {
                if (sDown && !sprintWas) sprintOn = !sprintOn;
                if (nDown && !sneakWas) sneakOn = !sneakOn;
            }
            if (!sprint.bool()) sprintOn = false;
            if (!sneak.bool()) sneakOn = false;
            sprintWas = sDown;
            sneakWas = nDown;
            if (sk != 0 && (sprintOn || wasSprint)) b.holdKey(sk, sprintOn || (sDown && free));
            if (nk != 0 && (sneakOn || wasSneak)) b.holdKey(nk, sneakOn || (nDown && free));
        }

        String[] lines(Bridge b) {
            if (!status.bool()) return null;
            if (!b.inWorld()) return new String[]{"Sprinting (toggled)"};
            if (sneakOn) return new String[]{"Sneaking (toggled)"};
            if (sprintOn) return new String[]{"Sprinting (toggled)"};
            return null;
        }
    }

    // ---- Better chat -----------------------------------------------------------------------

    static final class Chat extends Mod {
        final Setting stamps = toggle("timestamps", "Timestamps", false);
        final Setting clock24 = toggle("24h", "24-hour timestamps", false);
        final Setting stack = toggle("stack", "Stack repeated messages", true);
        final Setting copy = toggle("copy", "Right-click a message to copy it", true);
        final Setting search = toggle("search", "Ctrl+F to search chat", true);
        private String last;
        private int count, lastId, seq;
        private boolean busy;
        boolean searching;

        Chat() { super("chat", "Better chat", "Stack, copy, search", "message-square", true, false); }

        /** printChatMessageWithOptionalDeletion: true when Kestrel printed the message itself. */
        boolean print(Bridge b, Object gui, Object comp, int id) {
            if (busy || !on()) return false;
            boolean st = stamps.bool(), sk = stack.bool() && id == 0;
            if (!st && !sk) return false;
            int useId = id;
            String suffix = null;
            if (sk) {
                String text = b.chatText(comp);
                if (text.equals(last) && text.trim().length() > 0) {
                    count++;
                    useId = lastId;
                    suffix = " [x" + count + "]";
                } else {
                    last = text;
                    count = 1;
                    lastId = 0x4B000000 | (++seq & 0xFFFFFF); // every message gets its own id so a repeat can replace it
                    useId = lastId;
                }
            }
            String prefix = st ? "[" + new SimpleDateFormat(clock24.bool() ? "HH:mm" : "h:mm").format(new Date()) + "] " : null;
            Object out = prefix == null && suffix == null ? comp : b.chatDecorate(comp, prefix, suffix);
            busy = true;
            try {
                b.chatPrint(gui, out, useId);
            } finally {
                busy = false;
            }
            return true;
        }
    }

    // ---- Screenshots -----------------------------------------------------------------------

    static final class Screenshots extends Mod {
        final Setting notice = toggle("toast", "Show a notice", true);
        final Setting buttons = toggle("buttons", "Open, Copy and Folder buttons in chat", true);

        Screenshots() { super("screenshots", "Screenshots", "Open, copy or find", "camera", true, false); }

        /** ScreenShotHelper.saveScreenshot's chat message: replaced with Kestrel's when it worked. */
        Object saved(Bridge b, Object message) {
            if (!on()) return message;
            File dir = new File(b.gameDir(), "screenshots"), newest = null;
            File[] files = dir.listFiles();
            if (files != null) for (File f : files) if (f.getName().endsWith(".png") && (newest == null || f.lastModified() > newest.lastModified())) newest = f;
            if (newest == null || System.currentTimeMillis() - newest.lastModified() > 5000) return message;
            if (notice.bool()) Toasts.show("Screenshot saved", newest.getName(), "camera");
            if (!buttons.bool()) return message;
            String path = newest.getAbsolutePath();
            return b.chatLine("Screenshot saved", new String[]{"Open", "Copy", "Folder"},
                    new String[]{"open:" + path, "run:/kestrel copyshot " + path, "open:" + dir.getAbsolutePath()});
        }

        static void copy(final File f) {
            Thread t = new Thread(new Runnable() {
                public void run() {
                    try {
                        final BufferedImage img = ImageIO.read(f);
                        Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new Transferable() {
                            public DataFlavor[] getTransferDataFlavors() { return new DataFlavor[]{DataFlavor.imageFlavor}; }
                            public boolean isDataFlavorSupported(DataFlavor d) { return DataFlavor.imageFlavor.equals(d); }
                            public Object getTransferData(DataFlavor d) { return (Image) img; }
                        }, null);
                        Toasts.show("Screenshot copied", "Paste it anywhere", "copy");
                    } catch (Throwable e) {
                        Log.error("copying screenshot", e);
                        Toasts.show("Couldn't copy the screenshot", null, "camera");
                    }
                }
            }, "Kestrel copy screenshot");
            t.setDaemon(true);
            t.start();
        }
    }

    // ---- Pause menu shortcuts --------------------------------------------------------------

    static final class Pause extends Mod {
        static final int KESTREL = 7701, SHOTS = 7702, PACKS = 7703, RECONNECT = 7704;

        Pause() { super("pause", "Pause shortcuts", "Pause menu buttons", "layout", true, false); }

        void init(Bridge b, Object screen) {
            if (!on()) return;
            b.addButtons(screen, new Object[][]{
                    {KESTREL, -100, 128, 98, "Kestrel mods"}, {SHOTS, 2, 128, 98, "Screenshots"},
                    {PACKS, -100, 152, 98, "Resource Packs"}, {RECONNECT, 2, 152, 98, b.server() != null ? "Reconnect" : "Game Folder"},
            });
        }

        /** True when the button was one of Kestrel's. */
        boolean action(Bridge b, Object screen, int id) {
            switch (id) {
                case KESTREL: Panel.open(b, null, 0); return true;
                case SHOTS: {
                    File dir = new File(b.gameDir(), "screenshots");
                    dir.mkdirs();
                    open(dir);
                    return true;
                }
                case PACKS: b.resourcePacks(screen); return true;
                case RECONNECT:
                    if (b.server() != null) b.reconnect();
                    else open(b.gameDir());
                    return true;
                default: return false;
            }
        }
    }

    // ---- Friend alerts (Hypixel) -----------------------------------------------------------

    static final class Alerts extends Mod {
        private static final Pattern FRIEND = Pattern.compile("^Friend > (\\w{1,16}) (joined|left)\\.$");
        private static final Pattern GUILD = Pattern.compile("^Guild > (\\w{1,16}) (joined|left)\\.$");
        private static final Pattern INVITE = Pattern.compile("(?:\\[[^\\]]+\\] )?(\\w{1,16}) has invited you to join (?:their|[\\w']+) party!");
        final Setting friends = toggle("friends", "Friends coming online", true);
        final Setting party = toggle("party", "Party invites", true);
        final Setting guild = toggle("guild", "Guild members coming online", false);
        final Setting hide = toggle("hide", "Hide join and leave lines from chat", false);

        Alerts() { super("alerts", "Friend alerts", "Friends and invites", "bell", true, false); }

        String note() { return "Works on Hypixel."; }

        /** True to hide the chat line. */
        boolean chat(Bridge b, String text) {
            if (!on() || !hypixel(b)) return false;
            Matcher m = FRIEND.matcher(text);
            boolean guildLine = false;
            if (!m.matches()) {
                m = GUILD.matcher(text);
                guildLine = m.matches();
                if (!guildLine) {
                    m = INVITE.matcher(text);
                    if (m.find() && party.bool()) Toasts.show(m.group(1) + " invited you to a party", "Type /p accept " + m.group(1), "users");
                    return false;
                }
            }
            boolean joined = m.group(2).equals("joined");
            if (guildLine ? guild.bool() : friends.bool()) {
                Toasts.show(m.group(1) + (joined ? " is online" : " went offline"), guildLine ? "Guild" : "Friend", "users");
            }
            return hide.bool();
        }
    }

    // ---- Keybinds per server ---------------------------------------------------------------

    static final class Keybinds extends Mod {
        private String active;
        private Properties store;
        private File file;

        Keybinds() { super("keybinds", "Keybinds per server", "Controls per server", "keyboard", false, false); }

        String note() { return "Change keys in Options > Controls while you're on the server."; }

        void tick(Bridge b) {
            String now = on() && b.inWorld() && b.server() != null ? b.server().toLowerCase(Locale.ROOT) : "default";
            if (active == null) {
                active = now; // the keys in options.txt belong to wherever the game starts
                if (!on()) return;
            }
            if (now.equals(active)) return;
            load(b);
            save(active, b.keybinds());
            Map<String, Integer> next = profile(now);
            if (next != null) b.keybinds(next);
            active = now;
            write();
        }

        private void load(Bridge b) {
            if (store != null) return;
            store = new Properties();
            file = new File(new File(b.gameDir(), "kestrel"), "keybinds.properties");
            if (!file.isFile()) return;
            try (InputStream in = new FileInputStream(file)) {
                store.load(in);
            } catch (Exception e) {
                Log.error("reading keybinds", e);
            }
        }

        private void save(String profile, Map<String, Integer> keys) {
            for (Map.Entry<String, Integer> e : keys.entrySet()) store.setProperty(profile + "|" + e.getKey(), String.valueOf(e.getValue()));
        }

        private Map<String, Integer> profile(String profile) {
            Map<String, Integer> out = new LinkedHashMap<String, Integer>();
            for (String k : store.stringPropertyNames()) {
                if (!k.startsWith(profile + "|")) continue;
                try {
                    out.put(k.substring(profile.length() + 1), Integer.parseInt(store.getProperty(k)));
                } catch (NumberFormatException ignored) {
                }
            }
            return out.isEmpty() ? null : out;
        }

        private void write() {
            try {
                file.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(file)) {
                    store.store(out, "Kestrel keybinds per server");
                }
            } catch (Exception e) {
                Log.error("saving keybinds", e);
            }
        }
    }

    // ---- Auto GG (Hypixel) -----------------------------------------------------------------

    static final class AutoGg extends Mod {
        private static final String[] ENDS = {"1st Killer - ", "1st Place - ", "Winner: ", "Winners: ", "Winning Team - ", "Winning Team: ",
                "1st - ", "Winners - ", "Top Seeker: ", "Last team standing!", "Winner #1 (", "Top Survivors", "Sumo Duel - ", "Reward Summary"};
        final Setting message = choice("message", "Message", 0, "gg", "GG", "gg wp", "Good game");
        final Setting delay = slider("delay", "Delay", 0, 5, 1, "s");
        private long sendAt, lastSent;

        AutoGg() { super("autogg", "Auto GG", "Says gg after games", "party-popper", false, false); }

        String note() { return "Hypixel only, once per game."; }

        void chat(Bridge b, String text) {
            if (!on() || !hypixel(b) || sendAt != 0) return;
            String t = text.trim();
            for (String end : ENDS) {
                if (t.startsWith(end) && System.currentTimeMillis() - lastSent > 15000) {
                    sendAt = System.currentTimeMillis() + delay.num() * 1000L;
                    return;
                }
            }
        }

        void tick(Bridge b) {
            if (sendAt == 0 || System.currentTimeMillis() < sendAt) return;
            sendAt = 0;
            lastSent = System.currentTimeMillis();
            if (on() && b.inWorld()) b.chat("/ac " + message.choice());
        }
    }

    // ---- Auto requeue (Hypixel) ------------------------------------------------------------

    static final class Requeue extends Mod {
        final Setting delay = slider("delay", "Delay", 0, 10, 3, "s");
        private String pending;
        private long at;

        Requeue() { super("requeue", "Auto requeue", "Joins the next game", "repeat", false, false); }

        String note() { return "Hypixel only. Type anything in chat to cancel."; }

        void chat(Bridge b, Object comp, String text) {
            if (!on() || !hypixel(b) || !text.toLowerCase(Locale.ROOT).contains("play again")) return;
            String cmd = b.chatCommand(comp);
            if (cmd == null || !cmd.startsWith("/play ")) return;
            pending = cmd;
            at = System.currentTimeMillis() + delay.num() * 1000L;
            Toasts.show("Next game in " + delay.num() + "s", "Type anything in chat to stay", "repeat");
        }

        /** You sent something: cancels a requeue that hasn't happened yet. */
        void sent(String msg) {
            if (pending != null && !msg.equals(pending)) {
                pending = null;
                Toasts.show("Requeue cancelled", null, "repeat");
            }
        }

        void tick(Bridge b) {
            if (pending == null || System.currentTimeMillis() < at) return;
            String cmd = pending;
            pending = null;
            if (on() && b.inWorld()) b.chat(cmd);
        }
    }

    // ---- Triangulation (a HUD mod) --------------------------------------------------------

    /**
     * Watches thrown Eyes of Ender: each flies straight towards the stronghold, so two throws from
     * different places give two lines that cross at it.
     */
    static final class Triangulation extends Mod {
        final Setting nether = toggle("nether", "Show Nether coordinates", true);
        private final Map<Integer, double[]> seen = new HashMap<Integer, double[]>();
        private double[] first, second; // {x, z, direction x, direction z}
        private int dim = Integer.MIN_VALUE;

        Triangulation() { super("triangulation", "Triangulation", "Find the stronghold", "navigation", false); }

        String note() { return "Not allowed in verified speedruns. Throw, walk ~200 blocks sideways, throw again. /kestrel reset starts over."; }

        void tick(Bridge b) {
            if (!on() || !b.inWorld()) {
                seen.clear();
                return;
            }
            if (b.dimension() != dim) {
                dim = b.dimension();
                first = second = null;
                seen.clear();
            }
            Set<Integer> alive = new HashSet<Integer>();
            for (double[] e : b.enderEyes()) {
                int id = (int) e[0];
                alive.add(id);
                double[] s = seen.get(id);
                if (s == null) {
                    seen.put(id, new double[]{e[1], e[3], 0});
                } else if (s[2] >= 0 && ++s[2] >= 8) {
                    double dx = e[1] - s[0], dz = e[3] - s[1], len = Math.sqrt(dx * dx + dz * dz);
                    if (len > 0.5) add(new double[]{s[0], s[1], dx / len, dz / len});
                    s[2] = -1; // measured
                }
            }
            for (Iterator<Integer> it = seen.keySet().iterator(); it.hasNext(); ) if (!alive.contains(it.next())) it.remove();
        }

        /** "/kestrel reset": forget both throws. */
        void reset() {
            first = second = null;
            seen.clear();
            Toasts.show("Triangulation reset", "Throw a new Eye of Ender", "navigation");
        }

        private void add(double[] t) {
            if (first == null) first = t;
            else if (second == null) {
                if (near(first, t)) first = t;
                else second = t;
            } else if (near(second, t)) {
                second = t;
            } else {
                first = second;
                second = t;
            }
        }

        private static boolean near(double[] a, double[] b) {
            return Math.hypot(a[0] - b[0], a[1] - b[1]) < 4;
        }

        /** Minecraft's yaw for a direction, as F3 shows it. */
        private static String yaw(double[] t) {
            return String.format(Locale.ROOT, "%.1f", Math.toDegrees(Math.atan2(-t[2], t[3])));
        }

        String[] lines(Bridge b) {
            if (!b.inWorld()) return new String[]{"Stronghold  X 1234  Z -567", "Distance 902  ·  Nether X 154  Z -71"};
            if (first == null) return new String[]{"Throw an Eye of Ender"};
            if (second == null) return new String[]{"Eye 1  ·  angle " + yaw(first), "Walk ~200 blocks sideways, throw again"};
            double cross = first[2] * second[3] - first[3] * second[2];
            if (Math.abs(cross) < 0.03) return new String[]{"Both eyes point the same way", "Walk further sideways and throw again"};
            double t = ((second[0] - first[0]) * second[3] - (second[1] - first[1]) * second[2]) / cross;
            if (t < 0) return new String[]{"The throws don't meet ahead", "Throw again from a new spot"};
            int x = (int) Math.round(first[0] + first[2] * t), z = (int) Math.round(first[1] + first[3] * t);
            double[] p = b.position();
            int dist = p == null ? 0 : (int) Math.round(Math.hypot(x - p[0], z - p[2]));
            String line2 = "Distance " + dist + (nether.bool() ? "  ·  Nether X " + Math.round(x / 8.0) + "  Z " + Math.round(z / 8.0) : "");
            return new String[]{"Stronghold  X " + x + "  Z " + z, line2};
        }
    }
}
