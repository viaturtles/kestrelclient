package kestrel.core;

import org.lwjgl.Sys;
import org.lwjgl.input.Mouse;

/** Kestrel's title screen (Figma "Kestrel / In-game", 01 · Main menu) over the vanilla panorama. */
final class MainMenu {
    private static final String NEWS_URL = "https://viaturtles.github.io/kestrelclient/";
    private static float yaw = -28, pitch = -6, lastX, lastY;
    private static boolean dragging;

    /** 3D player with its feet at (x, y); drag to turn it (like Essential). */
    private static void preview(Bridge b, int skin, float x, float y, float scale) {
        if (skin <= 0 || scale < 2) return;
        if (dragging) {
            if (Mouse.isButtonDown(0)) {
                yaw += (Ui.mx - lastX) * 0.9f;
                pitch = Math.max(-35, Math.min(35, pitch - (Ui.my - lastY) * 0.5f));
            } else {
                dragging = false;
            }
        }
        lastX = Ui.mx;
        lastY = Ui.my;
        float h = 34 * scale, w = 18 * scale;
        Gfx.rrect(x - 9 * scale, y - 1.2f * scale, 18 * scale, 2.4f * scale, 1.2f * scale, Gfx.rgba(0, 0.3f));
        Model.draw(skin, x, y, scale, yaw, pitch, Mod.CAPE.on() ? Cape.preview(b, Cape.equipped(b)) : -1);
        boolean hov = Ui.hover(x - w, y - h, w * 2, h + 10);
        if (hov || dragging) {
            String hint = "Drag to rotate";
            float tw = Text.width(Text.MEDIUM, 12, hint);
            Gfx.icon("reset", x - (tw + 20) / 2, y + 12, 14, Ui.T2);
            Text.draw(Text.MEDIUM, 12, hint, x - (tw + 20) / 2 + 20, y + 11, Ui.T2);
        }
        Ui.hit(x - w, y - h, w * 2, h + 10, new Runnable() { public void run() { dragging = true; } });
    }

    static void draw(final Bridge b, final Object menu, float partialTicks) {
        int w = b.width(), h = b.height();
        b.skybox(menu, partialTicks);
        int skin = b.skinTexture();
        // Follows Minecraft's GUI scale like the panel, a little smaller (it shares the screen with the panorama).
        // Grows with GUI scale, but less steeply than vanilla (Normal 1.0, Large 1.2, Auto at 1080p 1.4).
        float s = Math.min((0.6f + 0.2f * b.guiScale()) * Config.SIZE.num() / 100f, h / 560f);
        Gfx.begin(w, h, s);
        try {
            Ui.frame();
            float W = w / s, H = h / s;
            Gfx.gradientH(0, 0, W * 0.62f, H, Gfx.rgba(0x08080A, 0.88f), Gfx.rgba(0x08080A, 0));
            Gfx.gradientV(0, H - 120, W, 120, Gfx.rgba(0x08080A, 0), Gfx.rgba(0x08080A, 0.6f));

            // Wordmark
            Gfx.icon("kestrel", 64, 48, 22, Ui.T1);
            Text.draw(Text.BOLD, 14, "KESTREL", 96, 50, Ui.T1, 3.4f);

            // Greeting, buttons and the dock, kept together near the middle.
            float top = Math.max(100, Math.min((H - 322) / 2 + 20, H - 322 - 70));
            if (skin > 0) {
                Gfx.pixelated(skin);
                Gfx.texture(skin, 64, top, 48, 48, 8 / 64f, 8 / 64f, 16 / 64f, 16 / 64f, 0xFFFFFFFF);
                Gfx.texture(skin, 64, top, 48, 48, 40 / 64f, 8 / 64f, 48 / 64f, 16 / 64f, 0xFFFFFFFF);
            } else {
                Gfx.rrect(64, top, 48, 48, 8, Gfx.rgba(Ui.BUTTON, 0.9f));
            }
            Text.draw(Text.MEDIUM, 13, "Welcome back", 126, top + 1, Ui.T2);
            Text.draw(Text.BOLD, 24, b.username(), 126, top + 18, Ui.T1);

            float y = top + 76;
            Ui.tileButton(64, y, 320, 48, "user", "Singleplayer", true, new Runnable() { public void run() { b.singleplayer(menu); } });
            Ui.tileButton(64, y + 56, 320, 48, "globe", "Multiplayer", true, new Runnable() { public void run() { b.multiplayer(menu); } });
            Ui.tileButton(64, y + 112, 156, 48, "sliders", "Options", false, new Runnable() { public void run() { b.options(menu); } });
            Ui.tileButton(228, y + 112, 156, 48, "power", "Quit", false, new Runnable() { public void run() { b.quit(); } });

            // Labelled shortcuts into the Kestrel panel (In-game v2).
            String[][] dock = {{"blocks", "Mods"}, {"shirt", "Cosmetics"}, {"users", "Friends"}};
            final int[] tabs = {0, 2, 3};
            float dx = 64;
            for (int i = 0; i < dock.length; i++) {
                final int tab = tabs[i];
                float dw = Text.width(Text.SEMIBOLD, 12.5f, dock[i][1]) + 58;
                Ui.tileButton(dx, y + 180, dw, 38, dock[i][0], dock[i][1], false, new Runnable() { public void run() { Panel.open(b, menu, tab); } });
                dx += dw + 6;
            }
            Text.draw(Text.MEDIUM, 12, "Press Right Shift in a world to open your mods", 64, y + 230, Ui.T2);

            // What's new, with the player above it
            if (W >= 900) {
                float cx = W - 64 - 346, cy = H - 54 - 127;
                preview(b, skin, cx + 173, cy - 44, Math.min(6.5f, (cy - 150) / 34f));
                Gfx.box(cx, cy, 346, 127, 12, Gfx.rgba(Ui.BG, 0.88f), Gfx.rgba(0xFFFFFF, 0.08f), 1.4f);
                Gfx.texture(Gfx.image("news"), cx + 12, cy + 12, 120, 100, 0, 0, 1, 1, 0xFFFFFFFF);
                Text.draw(Text.BOLD, 11, "WHAT'S NEW", cx + 148, cy + 16, Ui.T3, 0.9f);
                Text.draw(Text.SEMIBOLD, 15, "Kestrel Core is here", cx + 148, cy + 34, Ui.T1);
                Text.draw(Text.MEDIUM, 12, "Press Right Shift in game to", cx + 148, cy + 58, Ui.T2);
                Text.draw(Text.MEDIUM, 12, "open your mods.", cx + 148, cy + 75, Ui.T2);
                boolean hov = Ui.hover(cx + 148, cy + 92, 80, 20);
                float rw = Text.draw(Text.SEMIBOLD, 12, "Read more", cx + 148, cy + 96, hov ? 0xFFFFFFFF : Ui.T1);
                Gfx.icon("right", cx + 148 + rw + 2, cy + 97, 14, Ui.T1);
                Ui.hit(cx + 148, cy + 92, rw + 20, 22, new Runnable() { public void run() { Sys.openURL(NEWS_URL); } });
            }

            // Footer
            String version = System.getProperty("kestrel.version", Agent.VERSION);
            Text.draw(Text.MEDIUM, 12, "Minecraft 1.8.9  ·  Kestrel " + version, 64, H - 40, Ui.T2);
            String legal = "Not affiliated with Mojang or Microsoft";
            Text.draw(Text.MEDIUM, 12, legal, W - 64 - Text.width(Text.MEDIUM, 12, legal), H - 40, Ui.T3);

            Ui.flush();
        } finally {
            Gfx.end();
        }
    }
}
