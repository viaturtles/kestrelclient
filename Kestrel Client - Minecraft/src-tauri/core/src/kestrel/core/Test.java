package kestrel.core;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.ByteBuffer;
import javax.imageio.ImageIO;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL11;

/**
 * Self-test, only active with -Dkestrel.test=<folder>: walks through the screens, saves a
 * screenshot of each into the folder and quits. Optional -Dkestrel.test.world=<save folder>.
 */
final class Test {
    static final String DIR = System.getProperty("kestrel.test");
    private static int step, frames;
    private static boolean setUp, capeView;

    static void menu(Bridge b, Object menu) {
        if (DIR == null) return;
        frames++;
        if (step == 0 && frames > 150) { shot(b, "1-menu"); Panel.open(b, menu, 0); next(); }
        if (step == 9) next();
        if (step == 10) {
            String world = System.getProperty("kestrel.test.world");
            if (world == null) b.quit();
            else { b.openWorld(world); next(); }
        }
    }

    static void panel(Bridge b) {
        if (DIR == null) return;
        frames++;
        if (frames <= 30) return;
        switch (step) {
            case 1: shot(b, "2-mods"); Panel.scroll(-120 * 6); next(); break;
            case 2: shot(b, "2b-mods-scrolled"); Panel.testPage(0, Mod.ALL.get(0)); next(); break;
            case 3: shot(b, "3-fps-settings"); Panel.testPage(0, Mod.CROSSHAIR); next(); break;
            case 4: shot(b, "3b-crosshair"); Panel.testPage(0, Mod.TRIANGULATION); next(); break;
            case 5: shot(b, "3c-triangulation"); Panel.testPage(3, null); next(); break;
            case 6: shot(b, "4-settings"); Panel.testPage(1, null); next(); break;
            case 7: shot(b, "5-cosmetics"); Panel.close(b); next(); next(); break; // no step 8 any more (was the HUD editor tab)
            case 12: if (frames > 60) { shot(b, "7-ingame-panel"); Panel.testPage(2, null); next(); } break;
            case 13: shot(b, "7c-friends"); next(); break;
            case 14: {
                // Click the sidebar's "Edit HUD" button the way a player would.
                Panel.testClick(114, 620 - 112 + 21);
                Log.info("test: Edit HUD button " + (HudEditor.active ? "opens the editor" : "FAILED to open the editor"));
                if (!HudEditor.active) HudEditor.open();
                next();
                break;
            }
            case 15: if (frames > 30) { shot(b, "7b-hud-editor"); HudEditor.active = false; b.quit(); } break;
            default: break;
        }
    }

    static void hud(Bridge b) {
        if (DIR == null) return;
        frames++;
        if (step == 11 && !setUp) {
            setUp = true;
            frames = 0;
            // Turn on the new HUD pieces and make some chat to check stacking and timestamps.
            for (Mod m : new Mod[]{Mod.CROSSHAIR, Mod.PING, Mod.TPS, Mod.TRIANGULATION, Mod.OUTLINE, Mod.SPRINT}) m.setOn(true);
            Mod.TPS.place(0.8f, 0.12f); // one HUD box moved by the HUD editor
            Mod.CHAT.stamps.set(true);
            Mod.OUTLINE.fill.set(true);
            Mod.OUTLINE.colour.set(2);
            b.look(0, 60);
            b.chat("hello");
            b.chat("hello");
            b.chat("hello");
            Toasts.show("Screenshot saved", "2026-10-23_12.00.00.png", "camera");
        }
        if (step == 11 && frames > 300 && !capeView) {
            shot(b, "6-hud");
            // Alone in singleplayer vanilla never shows Tab, so draw it straight away for the picture.
            Mod.TABLIST.draw(b, b.tabOverlay(), (int) Math.ceil(b.width() / (float) b.guiScale()), null, null);
            shot(b, "6b-tab");
            // From behind (F5) to see the cape, if the launcher put one in the game folder.
            capeView = true;
            b.look(30, 10);
            b.thirdPerson(1);
        }
        if (step == 11 && frames > 360) {
            shot(b, "6c-cape");
            b.thirdPerson(0);
            Panel.open(b, null, 0);
            next();
        }
    }

    private static void next() {
        step++;
        frames = 0;
    }

    static void shot(Bridge b, String name) {
        int w = b.width(), h = b.height();
        ByteBuffer buf = BufferUtils.createByteBuffer(w * h * 4);
        GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, 1);
        GL11.glReadPixels(0, 0, w, h, GL11.GL_RGBA, GL11.GL_UNSIGNED_BYTE, buf);
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = (x + (h - 1 - y) * w) * 4;
                img.setRGB(x, y, ((buf.get(i) & 255) << 16) | ((buf.get(i + 1) & 255) << 8) | (buf.get(i + 2) & 255));
            }
        }
        try {
            File f = name.contains(File.separator) ? new File(name + ".png") : new File(DIR, name + ".png");
            f.getParentFile().mkdirs();
            ImageIO.write(img, "png", f);
            Log.info("test screenshot " + name);
        } catch (Exception e) {
            Log.error("test screenshot", e);
        }
    }
}
