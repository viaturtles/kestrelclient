package kestrel.core;

import java.util.Map;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

/**
 * The HUD editor (Right Shift → HUD editor → Open): the game stays visible, every HUD mod that's on can be
 * dragged anywhere. Boxes snap to the screen edges, the centre lines and each other's edges; the mouse wheel
 * resizes the box under the cursor; right-click puts it back in the automatic top-left stack.
 */
final class HudEditor {
    static boolean active;
    private static Mod drag, hover;
    private static float offX, offY, guideX = -1, guideY = -1;
    private static final float SNAP = 5, MARGIN = 4;

    static void open() { active = true; drag = null; }

    static void key(Bridge b, int key) {
        if (key == Keyboard.KEY_ESCAPE) active = false;
    }

    static void mouse(Bridge b, int button, boolean down) {
        if (!down) { drag = null; return; }
        if (button == 0) Ui.click();
        else if (button == 1 && hover != null) hover.unplace();
    }

    static void scroll(int wheel) {
        if (hover == null || wheel == 0) return;
        Setting s = hover.size;
        s.set(Math.max(s.min, Math.min(s.max, s.num() + (wheel > 0 ? 5 : -5))));
    }

    static void draw(Bridge b) {
        int w = b.width(), h = b.height();
        float s = Hud.scale(b);
        Gfx.begin(w, h, s);
        try {
            Ui.frame();
            float W = w / s, H = h / s;
            Gfx.rect(0, 0, W, H, Gfx.rgba(0x05060A, 0.28f));
            Gfx.rect(W / 2 - 0.5f, 0, 1, H, Gfx.rgba(0xFFFFFF, 0.05f));
            Gfx.rect(0, H / 2 - 0.5f, W, 1, Gfx.rgba(0xFFFFFF, 0.05f));
            Map<Mod, float[]> boxes = Hud.boxes(b, W, H);

            // Dragging: follow the mouse, snap, save as a fraction of the screen.
            guideX = guideY = -1;
            if (drag != null && Mouse.isButtonDown(0) && boxes.containsKey(drag)) {
                float[] me = boxes.get(drag);
                float x = Ui.mx - offX, y = Ui.my - offY;
                float[] sx = snap(x, me[2], W, boxes, true), sy = snap(y, me[3], H, boxes, false);
                x = Math.max(0, Math.min(W - me[2], sx[0]));
                y = Math.max(0, Math.min(H - me[3], sy[0]));
                guideX = sx[1];
                guideY = sy[1];
                drag.place(x / W, y / H);
                boxes = Hud.boxes(b, W, H);
            } else if (drag != null && !Mouse.isButtonDown(0)) {
                drag = null;
            }

            hover = null;
            for (Map.Entry<Mod, float[]> e : boxes.entrySet()) {
                final Mod m = e.getKey();
                final float[] r = e.getValue();
                boolean hov = drag == m || drag == null && Ui.hover(r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6);
                if (hov) hover = m;
                Gfx.rrect(r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6, 5, Gfx.rgba(0xFFFFFF, hov ? 0.12f : 0.05f));
                Gfx.outline(r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6, 5, Gfx.rgba(0xFFFFFF, hov ? 0.9f : 0.3f));
                Hud.drawBox(b, m, r);
                if (hov) {
                    String label = m.name + "  ·  " + m.size.num() + "%";
                    float lw = Text.width(Text.SEMIBOLD, 11, label) + 14, ly = r[1] - 3 - 22 < 0 ? r[1] + r[3] + 6 : r[1] - 3 - 22;
                    Gfx.rrect(r[0] - 3, ly, lw, 18, 5, Gfx.rgba(0x0F1115, 0.92f));
                    Text.centred(Text.SEMIBOLD, 11, label, r[0] + 4, ly, 18, Ui.T1);
                }
                Ui.hit(r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6, new Runnable() {
                    public void run() { drag = m; offX = Ui.mx - r[0]; offY = Ui.my - r[1]; }
                });
            }
            if (guideX >= 0) Gfx.rect(guideX - 0.5f, 0, 1, H, Gfx.rgba(0x3DD879, 0.9f));
            if (guideY >= 0) Gfx.rect(0, guideY - 0.5f, W, 1, Gfx.rgba(0x3DD879, 0.9f));

            // Toolbar at the top middle.
            float tw = 420, tx = (W - tw) / 2, ty = 10;
            Gfx.box(tx, ty, tw, 44, 10, Gfx.rgba(0x0F1115, 0.92f), Gfx.rgba(0xFFFFFF, 0.1f), 1);
            Text.draw(Text.BOLD, 13, "HUD editor", tx + 14, ty + 7, Ui.T1);
            Text.draw(Text.MEDIUM, 10.5f, boxes.isEmpty() ? "Turn on HUD mods in Mods first" : "Drag · scroll to resize · right-click to reset", tx + 14, ty + 25, Ui.T3);
            Ui.greyButton(tx + tw - 160, ty + 8, 80, 28, null, "Reset all", new Runnable() {
                public void run() { for (Mod m : Mod.ALL) if (m.hud) { m.unplace(); m.size.set(100); } }
            });
            Ui.button(tx + tw - 74, ty + 8, 64, 28, null, "Done", new Runnable() { public void run() { active = false; } });
        } finally {
            Gfx.end();
        }
    }

    /** Snaps a box edge to the screen margins, the centre line and the other boxes; {value, guide line or -1}. */
    private static float[] snap(float v, float size, float max, Map<Mod, float[]> boxes, boolean horizontal) {
        float best = v, line = -1, dist = SNAP;
        float[][] options = {{MARGIN, MARGIN}, {max - MARGIN - size, max - MARGIN}, {max / 2 - size / 2, max / 2}};
        for (float[] o : options) if (Math.abs(o[0] - v) < dist) { dist = Math.abs(o[0] - v); best = o[0]; line = o[1]; }
        for (Map.Entry<Mod, float[]> e : boxes.entrySet()) {
            if (e.getKey() == drag) continue;
            float[] r = e.getValue();
            float a = horizontal ? r[0] : r[1], len = horizontal ? r[2] : r[3];
            // Line up with its start or end, or sit right next to it.
            float[][] near = {{a, a}, {a + len - size, a + len}, {a + len + 4, a + len}, {a - 4 - size, a}};
            for (float[] o : near) if (Math.abs(o[0] - v) < dist) { dist = Math.abs(o[0] - v); best = o[0]; line = o[1]; }
        }
        return new float[]{best, line};
    }
}
