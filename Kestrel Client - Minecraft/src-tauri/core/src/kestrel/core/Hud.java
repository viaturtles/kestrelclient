package kestrel.core;

import java.util.LinkedHashMap;
import java.util.Map;
import org.lwjgl.opengl.GL11;

/**
 * Draws the custom crosshair, the HUD mods and toasts. HUD mods go where the HUD editor put them;
 * mods without a position stack in the top-left corner.
 */
final class Hud {
    /** HUD units per screen pixel: Normal 1.3, Large 1.6, Auto at 1080p 1.9. */
    static float scale(Bridge b) { return 0.7f + 0.3f * b.guiScale(); }

    /** Every HUD mod that's on, with its box {x, y, w, h, size} in HUD units on a W x H screen. */
    static Map<Mod, float[]> boxes(Bridge b, float W, float H) {
        Map<Mod, float[]> out = new LinkedHashMap<Mod, float[]>();
        float stack = 6;
        for (Mod m : Mod.ALL) {
            if (!m.hud || !m.on()) continue;
            float k = m.size.num() / 100f;
            float[] s = m.measure(b);
            if (s[1] <= 0) continue;
            float w = s[0] * k, h = s[1] * k, x, y;
            if (m.placed()) {
                x = Math.max(0, Math.min(W - w, m.px() * W));
                y = Math.max(0, Math.min(H - h, m.py() * H));
            } else {
                x = 6;
                y = stack;
                stack += h + 4;
            }
            out.put(m, new float[]{x, y, w, h, k});
        }
        return out;
    }

    /** One HUD box at its place (Gfx is begun at HUD scale). */
    static void drawBox(Bridge b, Mod m, float[] box) {
        float s = Gfx.scale;
        GL11.glPushMatrix();
        // On whole screen pixels, so small shapes inside (ping bars) and text stay sharp.
        GL11.glTranslatef(Math.round(box[0] * s) / s, Math.round(box[1] * s) / s, 0);
        GL11.glScalef(box[4], box[4], 1);
        Gfx.scale = s * box[4];
        try {
            m.draw(b, 0, 0);
        } finally {
            Gfx.scale = s;
            GL11.glPopMatrix();
        }
    }

    static void draw(Bridge b) {
        for (Mod m : Mod.ALL) m.update(b);
        int w = b.width(), h = b.height();
        Tools.Crosshair ch = Mod.CROSSHAIR;
        if (ch.on() && ch.vanilla && !b.screenOpen()) {
            // In GUI pixels, centred like vanilla's 16x16 crosshair texture.
            int gui = b.guiScale();
            Gfx.begin(w, h, gui);
            try {
                int sw = (int) Math.ceil(w / (float) gui), sh = (int) Math.ceil(h / (float) gui);
                ch.draw(sw / 2 + 0.5f, sh / 2 + 0.5f, 1f / gui);
            } finally {
                Gfx.end();
            }
        }
        float s = scale(b);
        Gfx.begin(w, h, s);
        try {
            Toasts.draw(w / s);
            // The HUD editor draws the HUD itself while it's open.
            if (HudEditor.active || Config.hideOnDebug() && b.debugShown()) return;
            for (Map.Entry<Mod, float[]> e : boxes(b, w / s, h / s).entrySet()) drawBox(b, e.getKey(), e.getValue());
        } finally {
            Gfx.end();
        }
    }
}
