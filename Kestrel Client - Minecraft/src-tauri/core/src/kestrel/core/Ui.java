package kestrel.core;

import java.util.ArrayList;
import java.util.List;
import org.lwjgl.input.Mouse;

/** Immediate-mode widgets in the Kestrel style, plus click areas collected each frame. */
final class Ui {
    static final int T1 = 0xFFF2F3F5, T2 = 0xFFA3A8B0, T3 = 0xFF6C717A;
    static final int BG = 0x0C0D0F, GREY = 0x9299A4, BUTTON = 0x0F1115, BUTTON_HOVER = 0x1A1D23;

    static float mx = -1, my = -1;
    private static List<Object[]> building = new ArrayList<Object[]>(), live = new ArrayList<Object[]>();
    private static String tip;
    private static float tipX, tipY;

    /** Starts a frame: mouse position in design units, click areas from the last frame become live. */
    static void frame() {
        mx = Mouse.getX() / Gfx.scale;
        my = (Gfx.height - Mouse.getY() - 1) / Gfx.scale;
        live = building;
        building = new ArrayList<Object[]>();
        tip = null;
    }

    static boolean hover(float x, float y, float w, float h) {
        return mx >= x && my >= y && mx < x + w && my < y + h;
    }

    static void hit(float x, float y, float w, float h, Runnable action) {
        building.add(new Object[]{new float[]{x, y, w, h}, action});
    }

    /** Runs the top-most click area under the mouse. */
    static boolean click() {
        return clickAt(Mouse.getX() / Gfx.scale, (Gfx.height - Mouse.getY() - 1) / Gfx.scale);
    }

    /** Runs the top-most click area at this point (design units); the self-test clicks this way. */
    static boolean clickAt(float x, float y) {
        for (int i = live.size() - 1; i >= 0; i--) {
            float[] r = (float[]) live.get(i)[0];
            if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) {
                ((Runnable) live.get(i)[1]).run();
                return true;
            }
        }
        return false;
    }

    /**
     * Connection bars for the Ping HUD and the Tab list: four thin round-topped bars, `unit` wide, bottoms on
     * `bottom`. Green while the ping is fine, amber from 150 ms, red from 300 ms (Turtles wants the green here).
     * ping < 0 = unknown (all dim). Returns the width drawn.
     */
    static float signal(float x, float bottom, float unit, int ping) {
        int on = ping < 0 ? 0 : ping < 80 ? 4 : ping < 150 ? 3 : ping < 300 ? 2 : 1;
        int lit = ping < 150 ? 0xFF3DD879 : ping < 300 ? 0xFFF3C46B : 0xFFFF6B76;
        // Worked out in whole screen pixels: bars this small blur unevenly on fractional pixels, so every bar
        // gets the same width, every gap the same size, and each bar is the same step taller than the last.
        float s = Gfx.scale;
        int w = Math.max(2, Math.round(unit * s)), gap = Math.max(1, Math.round(unit * 0.6f * s));
        int first = Math.max(3, Math.round(unit * 2 * s)), step = Math.max(2, Math.round(unit * 1.1f * s));
        float x0 = Math.round(x * s), b0 = Math.round(bottom * s);
        for (int i = 0; i < 4; i++) {
            int h = first + i * step;
            Gfx.rect((x0 + i * (w + gap)) / s, (b0 - h) / s, w / s, h / s, i < on ? lit : Gfx.rgba(0xFFFFFF, 0.2f));
        }
        return (4 * w + 3 * gap) / s;
    }

    static void tooltip(String text, float x, float y) {
        tip = text;
        tipX = x;
        tipY = y;
    }

    /** Draws the pending tooltip; call last. */
    static void flush() {
        if (tip == null) return;
        float w = Text.width(Text.SEMIBOLD, 12, tip) + 20;
        float x = Math.max(4, tipX - w / 2);
        Gfx.box(x, tipY, w, 28, 6, Gfx.rgba(BG, 0.95f), Gfx.rgba(0xFFFFFF, 0.1f), 0.6f);
        Text.centred(Text.SEMIBOLD, 12, tip, x + 10, tipY, 28, T1);
    }

    // ---- widgets ---------------------------------------------------------------------------

    /** Solid button from the in-game Figma (main menu and pause style). */
    static void button(float x, float y, float w, float h, String icon, String label, Runnable action) {
        boolean hov = hover(x, y, w, h);
        Gfx.box(x, y, w, h, 8, Gfx.rgba(hov ? BUTTON_HOVER : BUTTON, hov ? 0.95f : 0.9f), Gfx.rgba(0xFFFFFF, hov ? 0.16f : 0.1f), 1f);
        float tx = x + 14;
        if (icon != null) {
            Gfx.icon(icon, x + 14, y + (h - 18) / 2, 18, T1);
            tx = x + 42;
        }
        Text.centred(Text.SEMIBOLD, 14, label, tx, y, h, T1);
        if (action != null) hit(x, y, w, h, action);
    }

    static void iconButton(float x, float y, float size, float iconSize, String icon, String tooltip, Runnable action) {
        boolean hov = hover(x, y, size, size);
        Gfx.box(x, y, size, size, 8, Gfx.rgba(hov ? BUTTON_HOVER : BUTTON, hov ? 0.95f : 0.9f), Gfx.rgba(0xFFFFFF, hov ? 0.16f : 0.1f), 1f);
        Gfx.icon(icon, x + (size - iconSize) / 2, y + (size - iconSize) / 2, iconSize, T1);
        if (hov && tooltip != null) Ui.tooltip(tooltip, x + size / 2, y - 34);
        hit(x, y, size, size, action);
    }

    /** Grey translucent button used inside the Kestrel panel. */
    static void greyButton(float x, float y, float w, float h, String icon, String label, Runnable action) {
        boolean hov = hover(x, y, w, h);
        Gfx.box(x, y, w, h, 8, Gfx.rgba(GREY, hov ? 0.26f : 0.17f), Gfx.rgba(0xFFFFFF, 0.1f), 0.8f);
        float tx = x + 14;
        if (icon != null) {
            Gfx.icon(icon, x + 14, y + (h - 15) / 2, 15, T1);
            tx = x + 37;
        }
        if (label != null) Text.centred(Text.SEMIBOLD, 13, label, tx, y, h, T1);
        if (action != null) hit(x, y, w, h, action);
    }

    /** Square icon tile: white 10% with a white icon when on, white 5% with a grey icon when off (never green). */
    static void tile(float x, float y, float size, String icon, boolean on) {
        Gfx.rrect(x, y, size, size, size * 0.22f, Gfx.rgba(0xFFFFFF, on ? 0.1f : 0.05f));
        float is = Math.round(size * 0.5f);
        Gfx.icon(icon, x + (size - is) / 2, y + (size - is) / 2, is, on ? T1 : T2);
    }

    /** Title screen button (In-game v2): icon tile, label and an optional chevron. */
    static void tileButton(float x, float y, float w, float h, String icon, String label, boolean chevron, Runnable action) {
        boolean hov = hover(x, y, w, h);
        Gfx.box(x, y, w, h, 10, Gfx.rgba(hov ? BUTTON_HOVER : BUTTON, hov ? 0.94f : 0.86f), Gfx.rgba(0xFFFFFF, hov ? 0.18f : 0.11f), 1f);
        float ts = h - 16;
        tile(x + 8, y + 8, ts, icon, true);
        Text.centred(Text.SEMIBOLD, h > 40 ? 14 : 12.5f, label, x + 8 + ts + 10, y, h, T1);
        if (chevron) Gfx.icon("right", x + w - 28, y + (h - 15) / 2, 15, hov ? T2 : T3);
        hit(x, y, w, h, action);
    }

    /** Keyboard key, like the launcher's keycap. */
    static float keycap(float x, float y, String label) {
        float w = Text.width(Text.BOLD, 11, label) + 14;
        Gfx.rrect(x, y + 2, w, 20, 5, Gfx.rgba(0, 0.6f));
        Gfx.box(x, y, w, 20, 5, 0xFF2A2C33, Gfx.rgba(0xFFFFFF, 0.12f), 0);
        Text.centred(Text.BOLD, 11, label, x + 7, y, 20, T1);
        return w;
    }

    static void toggle(float x, float y, boolean on) {
        if (on) {
            Gfx.rrect(x, y, 34, 20, 10, 0xFF3DD879);
            Gfx.rrect(x + 17, y + 3, 14, 14, 7, 0xFFFFFFFF);
        } else {
            Gfx.rrect(x, y, 34, 20, 10, Gfx.rgba(GREY, 0.22f));
            Gfx.outline(x, y, 34, 20, 10, Gfx.rgba(0xFFFFFF, 0.08f));
            Gfx.rrect(x + 3, y + 3, 14, 14, 7, T3);
        }
    }

    static void slider(float x, float y, float w, float v) {
        v = Math.max(0, Math.min(1, v));
        Gfx.rrect(x, y + 6, w, 4, 2, Gfx.rgba(GREY, 0.25f));
        Gfx.rrect(x, y + 6, w * v, 4, 2, T1);
        Gfx.rrect(x + w * v - 7, y + 1, 14, 14, 7, 0xFFFFFFFF);
    }

    static void chip(float x, float y, String label, boolean on, Runnable action) {
        float w = Text.width(Text.SEMIBOLD, 12, label) + 24;
        if (on) Gfx.rrect(x, y, w, 28, 14, Gfx.rgba(0xFFFFFF, 0.1f));
        Gfx.outline(x, y, w, 28, 14, Gfx.rgba(0xFFFFFF, on ? 0.14f : 0.08f));
        Text.centred(Text.SEMIBOLD, 12, label, x + 12, y, 28, on ? T1 : T2);
        if (action != null) hit(x, y, w, 28, action);
    }

    static float chipWidth(String label) {
        return Text.width(Text.SEMIBOLD, 12, label) + 24;
    }
}
