package kestrel.core;

import java.util.ArrayList;
import java.util.List;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;
import org.lwjgl.opengl.GL11;

/** The Right Shift panel (Figma 03 Mods, 04 Mod settings, 07 Settings). */
final class Panel {
    // The HUD editor isn't a tab: the "Edit HUD" button at the bottom of the sidebar opens it from any tab.
    private static final String[] TABS = {"Mods", "Cosmetics", "Friends", "Settings"};
    private static final String[] TAB_ICONS = {"blocks", "shirt", "users", "sliders"};
    private static final float PW = 1040, PH = 620, X = 244;

    private static boolean open;
    private static int tab, filter;
    private static Mod page;
    private static String query = "";
    private static Object parent;
    private static long openedAt;
    private static Setting dragging;
    private static float dragX, dragW;
    private static int size = 100;
    private static boolean world;

    static boolean isOpen() { return open; }

    /** Self-test: clicks a point given in panel coordinates, like a real mouse click would. */
    static boolean testClick(float x, float y) {
        float ox = Math.round((Gfx.width / Gfx.scale - PW) / 2), oy = Math.round((Gfx.height / Gfx.scale - PH) / 2);
        return Ui.clickAt(ox + x, oy + y);
    }

    /** Used by the self-test to move between pages. */
    static void testPage(int t, Mod m) {
        tab = t;
        page = m;
    }

    static void open(Bridge b, Object parentMenu, int startTab) {
        parent = parentMenu;
        tab = startTab;
        page = null;
        query = "";
        filter = 0;
        openedAt = System.currentTimeMillis();
        b.openPanel();
    }

    static void close(Bridge b) {
        if (parent != null && !b.inWorld()) b.display(parent);
        else b.display(null);
    }

    static void init(Bridge b) {
        open = true;
        Keyboard.enableRepeatEvents(true);
    }

    static void closed(Bridge b) {
        open = false;
        dragging = null;
        Keyboard.enableRepeatEvents(false);
        b.blur(0);
        Config.save();
    }

    static void tick(Bridge b) {
        if (parent != null && !b.inWorld()) b.tickMenu(parent);
    }

    static void key(Bridge b, char c, int key) {
        if (HudEditor.active) { HudEditor.key(b, key); return; }
        if (listening != null) {
            if (key == Keyboard.KEY_BACK || key == Keyboard.KEY_DELETE) listening.set(0);
            else if (key != Keyboard.KEY_ESCAPE && key != 0) listening.set(key);
            listening = null;
            return;
        }
        if (key == Keyboard.KEY_ESCAPE) {
            if (page != null) page = null;
            else close(b);
        } else if (key == Keyboard.KEY_BACK) {
            if (query.length() > 0) query = query.substring(0, query.length() - 1);
        } else if (tab == 0 && page == null && c >= 32 && c != 127 && query.length() < 24 && key != Keyboard.KEY_RSHIFT) {
            query += c;
        }
    }

    static void mouse(Bridge b, int button, boolean down) {
        if (HudEditor.active) { HudEditor.mouse(b, button, down); return; }
        if (listening != null && down) {
            Setting st = listening;
            listening = null;
            if (button != 0) {
                st.set(button - 100); // Minecraft's way of storing mouse buttons as keys
                return;
            }
        }
        if (button != 0) return;
        if (down) Ui.click();
        else dragging = null;
    }

    // ---- drawing ---------------------------------------------------------------------------

    static void draw(Bridge b, float partialTicks) {
        int w = b.width(), h = b.height();
        world = b.inWorld();
        if (!world && parent != null) b.skybox(parent, partialTicks);
        if (HudEditor.active) {
            // The editor shows the real game behind the HUD boxes, so no blur and no panel.
            if (world) b.blur(0);
            HudEditor.draw(b);
            return;
        }
        if (world) b.blur(Config.blur() ? Config.BLUR.num() : 0);
        // Menu size only changes once its slider is let go, so the panel doesn't resize under the mouse.
        if (dragging != Config.SIZE) size = Config.SIZE.num();
        float s = Math.min(Config.menuScale(b, size), Math.min(w / 1080f, h / 660f));
        Gfx.begin(w, h, s);
        try {
            Ui.frame();
            float W = w / s, H = h / s;
            float t = Math.min(1f, (System.currentTimeMillis() - openedAt) / 160f);
            float e = 1 - (1 - t) * (1 - t) * (1 - t);
            if (!world && parent == null) Gfx.rect(0, 0, W, H, 0xFF0C0D0F);
            // In a world nothing darkens the game, so you can still see what's happening.
            if (!world) Gfx.rect(0, 0, W, H, Gfx.rgba(0, 0.45f * e));

            Gfx.alpha = e;
            GL11.glPushMatrix();
            float k = 0.97f + 0.03f * e;
            GL11.glTranslatef(W / 2, H / 2, 0);
            GL11.glScalef(k, k, 1);
            GL11.glTranslatef(-W / 2, -H / 2, 0);
            float px = Math.round((W - PW) / 2), py = Math.round((H - PH) / 2);
            GL11.glTranslatef(px, py, 0);
            Ui.mx -= px;
            Ui.my -= py;

            if (dragging != null) {
                if (Mouse.isButtonDown(0)) {
                    float v = Math.max(0, Math.min(1, (Ui.mx - dragX) / dragW));
                    dragging.set(Math.round(dragging.min + v * (dragging.max - dragging.min)));
                } else {
                    dragging = null;
                }
            }
            body(b);
            GL11.glPopMatrix();
            Gfx.alpha = 1;
        } finally {
            Gfx.end();
        }
    }

    /** Everything inside the panel, in panel coordinates (click areas are shifted back). */
    private static void body(final Bridge b) {
        final float ox = Math.round((Gfx.width / Gfx.scale - PW) / 2), oy = Math.round((Gfx.height / Gfx.scale - PH) / 2);
        Clicks c = new Clicks(ox, oy);

        float fill = world ? Config.OPACITY.num() / 100f : 0.95f;
        Gfx.box(0, 0, PW, PH, 14, Gfx.rgba(0x0F1115, fill), Gfx.rgba(0xFFFFFF, 0.08f), 1.5f);
        // Sidebar with icon-tile tabs (In-game v2).
        Gfx.rect(227, 0, 1, PH, Gfx.rgba(0xFFFFFF, 0.06f));
        Gfx.icon("kestrel", 22, 24, 20, Ui.T1);
        Text.draw(Text.SEMIBOLD, 13, "KESTREL", 52, 26, Ui.T1, 3.6f);
        for (int i = 0; i < TABS.length; i++) {
            final int n = i;
            float iy = 76 + i * 46;
            boolean on = tab == i, hov = Ui.hover(12, iy, 204, 40);
            if (on || hov) Gfx.rrect(12, iy, 204, 40, 9, Gfx.rgba(0xFFFFFF, on ? 0.07f : 0.035f));
            if (on) Gfx.outline(12, iy, 204, 40, 9, Gfx.rgba(0xFFFFFF, 0.08f));
            Ui.tile(18, iy + 6, 28, TAB_ICONS[i], on);
            Text.centred(Text.SEMIBOLD, 14, TABS[i], 56, iy, 40, on ? Ui.T1 : Ui.T2);
            if (i == 2 && Friends.incoming(b) > 0) {
                String req = String.valueOf(Friends.incoming(b));
                float nw = Math.max(20, Text.width(Text.BOLD, 11, req) + 10);
                Gfx.rrect(216 - 10 - nw, iy + 10, nw, 20, 10, 0xFFF2F3F5);
                Text.centred(Text.BOLD, 11, req, 216 - 10 - nw + (nw - Text.width(Text.BOLD, 11, req)) / 2, iy + 10, 20, 0xFF0C0D0F);
            }
            c.hit(12, iy, 204, 40, new Runnable() { public void run() { tab = n; page = null; } });
        }
        // Edit HUD: one button, the same on every tab, just above the close hint.
        float ey = PH - 112;
        boolean eh = Ui.hover(12, ey, 204, 42);
        Gfx.rrect(12, ey, 204, 42, 10, Gfx.rgba(0xFFFFFF, eh ? 0.09f : 0.05f));
        Gfx.outline(12, ey, 204, 42, 10, Gfx.rgba(0xFFFFFF, eh ? 0.16f : 0.08f));
        Gfx.icon("layout", 26, ey + 12, 18, Ui.T1);
        Text.centred(Text.SEMIBOLD, 14, "Edit HUD", 56, ey, 42, Ui.T1);
        Gfx.icon("right", 192, ey + 13, 16, eh ? Ui.T2 : Ui.T3);
        c.hit(12, ey, 204, 42, new Runnable() { public void run() { HudEditor.open(); } });
        Gfx.rrect(12, PH - 60, 204, 46, 10, Gfx.rgba(0xFFFFFF, 0.04f));
        float kw = Ui.keycap(22, PH - 48, "Right Shift");
        Text.centred(Text.MEDIUM, 12, "to close", 22 + kw + 8, PH - 50, 24, Ui.T3);

        // Close
        Ui.greyButton(992, 20, 32, 32, null, null, null);
        Gfx.icon("x", 1000, 28, 16, Ui.T1);
        c.hit(992, 20, 32, 32, new Runnable() { public void run() { close(b); } });

        if (tab == 0 && page != null) modPage(b, c);
        else if (tab == 0) mods(c);
        else if (tab == 3) settings(b, c);
        else if (tab == 1) cosmetics(b, c);
        else friends(b, c);

        Ui.flush();
    }

    private static void mods(Clicks c) {
        float tw = Text.draw(Text.BOLD, 22, "Mods", X, 20, Ui.T1);
        int on = 0;
        for (Mod m : Mod.ALL) if (m.on()) on++;
        Text.draw(Text.MEDIUM, 13, Mod.ALL.size() + " mods  ·  " + on + " on", X + tw + 12, 28, Ui.T3);

        // Search: always focused, typing goes here.
        Gfx.rrect(X, 66, 772, 40, 8, Gfx.rgba(Ui.GREY, 0.12f));
        Gfx.outline(X, 66, 772, 40, 8, Gfx.rgba(0xFFFFFF, 0.18f));
        Gfx.icon("search", X + 12, 77, 18, Ui.T2);
        boolean blink = (System.currentTimeMillis() / 530) % 2 == 0;
        float qx = X + 42;
        if (query.isEmpty()) {
            if (blink) Gfx.rect(qx, 77, 1.5f, 18, Ui.T1);
            Text.centred(Text.MEDIUM, 14, "Search mods", qx + 5, 66, 40, Ui.T3);
            String hint = "Just start typing";
            Text.centred(Text.MEDIUM, 12, hint, X + 772 - 14 - Text.width(Text.MEDIUM, 12, hint), 66, 40, Ui.T3);
        } else {
            float qw = Text.centred(Text.MEDIUM, 14, query, qx, 66, 40, Ui.T1);
            if (blink) Gfx.rect(qx + qw + 1, 77, 1.5f, 18, Ui.T1);
        }

        // Category chips, plus "Show on only" on the right.
        String[] chips = {"All", "HUD", "Gameplay", "Chat", "Hypixel"};
        float cx = X;
        for (int i = 0; i < chips.length; i++) {
            final int n = i;
            Ui.chip(cx, 120, chips[i], filter == i, null);
            c.hit(cx, 120, Ui.chipWidth(chips[i]), 28, new Runnable() { public void run() { filter = n; scrollTarget = 0; } });
            cx += Ui.chipWidth(chips[i]) + 6;
        }
        String only = "Show on only";
        float ow = Text.width(Text.MEDIUM, 12, only);
        Text.centred(Text.MEDIUM, 12, only, X + 772 - 34 - 10 - ow, 120, 28, Ui.T2);
        Ui.toggle(X + 772 - 34, 124, onlyOn);
        c.hit(X + 772 - 44 - ow, 120, ow + 44, 28, new Runnable() { public void run() { onlyOn = !onlyOn; scrollTarget = 0; } });

        // Mods grouped by category; headers only when showing everything.
        String q = query.toLowerCase().trim();
        boolean headers = filter == 0 && q.isEmpty();
        List<Object> items = new ArrayList<Object>(); // a String header or a Mod
        int count = 0;
        for (int cat = 0; cat < Mod.CATEGORIES.length; cat++) {
            if (filter != 0 && filter - 1 != cat) continue;
            List<Mod> group = new ArrayList<Mod>();
            for (Mod m : Mod.ALL) {
                if (m.category() != cat || onlyOn && !m.on()) continue;
                if (!q.isEmpty() && !m.name.toLowerCase().contains(q) && !m.description.toLowerCase().contains(q)) continue;
                group.add(m);
            }
            if (group.isEmpty()) continue;
            if (headers) items.add(Mod.CATEGORIES[cat].toUpperCase() + "  ·  " + group.size());
            items.addAll(group);
            count += group.size();
        }
        if (count == 0) {
            Text.draw(Text.MEDIUM, 14, !query.isEmpty() ? "No mods match \"" + query + "\"." : onlyOn ? "No mods are on here." : "No mods here.", X, 176, Ui.T2);
            return;
        }
        final float cw = 249, ch = 70, gap = 12, top = 162, bottom = PH - 16;
        // Lay out: each header starts a new row.
        float[] ys = new float[items.size()], xs = new float[items.size()];
        float cy = 0;
        int col = 0;
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i) instanceof String) {
                if (col > 0) cy += ch + gap;
                if (i > 0) cy += 8;
                ys[i] = cy;
                cy += 26;
                col = 0;
            } else {
                xs[i] = X + col * (cw + gap);
                ys[i] = cy;
                if (++col == 3) { col = 0; cy += ch + gap; }
            }
        }
        float total = (col > 0 ? cy + ch : cy - gap);
        // Scrolls with the mouse wheel; the grid is clipped to the panel.
        float max = Math.max(0, total - (bottom - top));
        scrollTarget = Math.max(0, Math.min(max, scrollTarget));
        scrollY += (scrollTarget - scrollY) * 0.35f;
        if (Math.abs(scrollTarget - scrollY) < 0.5f) scrollY = scrollTarget;
        float ox = c.ox, oy = c.oy, s = Gfx.scale;
        GL11.glEnable(GL11.GL_SCISSOR_TEST);
        GL11.glScissor(Math.round((ox + X - 4) * s), Math.round(Gfx.height - (oy + bottom) * s), Math.round(784 * s), Math.round((bottom - top + 4) * s));
        boolean visible = Ui.my >= top && Ui.my < bottom;
        for (int i = 0; i < items.size(); i++) {
            float y = top + ys[i] - scrollY;
            if (items.get(i) instanceof String) {
                if (y + 20 >= top && y <= bottom) Text.draw(Text.BOLD, 11, (String) items.get(i), X, y + 4, Ui.T3, 0.9f);
                continue;
            }
            final Mod m = (Mod) items.get(i);
            float x = xs[i];
            if (y + ch < top || y > bottom) continue;
            boolean hov = visible && Ui.hover(x, y, cw, ch), on2 = m.on();
            Gfx.rrect(x, y, cw, ch, 10, Gfx.rgba(0xFFFFFF, hov ? 0.07f : on2 ? 0.045f : 0.03f));
            Gfx.outline(x, y, cw, ch, 10, Gfx.rgba(0xFFFFFF, hov ? 0.14f : on2 ? 0.09f : 0.06f));
            Ui.tile(x + 13, y + 16, 38, m.icon, on2);
            Text.draw(Text.SEMIBOLD, 14, m.name, x + 63, y + 15, on2 ? Ui.T1 : 0xFFD6DAE0);
            if (hov) {
                // The whole card opens the mod's settings.
                float sw = Text.draw(Text.SEMIBOLD, 12, "Settings", x + 63, y + 37, Ui.T2);
                Gfx.icon("right", x + 63 + sw + 1, y + 38, 13, Ui.T2);
            } else {
                Text.draw(Text.MEDIUM, 12, clip(m.description, 128), x + 63, y + 37, Ui.T3);
            }
            Ui.toggle(x + cw - 48, y + 25, on2);
            // Click areas only for the visible part of the card.
            float hy = Math.max(y, top), hh = Math.min(y + ch, bottom) - hy;
            c.hit(x, hy, cw, hh, new Runnable() { public void run() { page = m; } });
            if (y + 17 >= top && y + 53 <= bottom) c.hit(x + cw - 56, y + 17, 50, 36, new Runnable() { public void run() { m.setOn(!m.on()); } });
        }
        GL11.glDisable(GL11.GL_SCISSOR_TEST);
        if (max > 0) {
            // Thin scroll bar at the right edge of the grid.
            float view = bottom - top, bar = Math.max(40, view * view / (view + max));
            Gfx.rrect(X + 777, top + (view - bar) * (scrollY / max), 3, bar, 1.5f, Gfx.rgba(0xFFFFFF, 0.18f));
        }
    }

    private static float scrollY, scrollTarget;
    private static boolean onlyOn;

    /** One line, cut with "…" to fit the width. */
    private static String clip(String text, float width) {
        if (Text.width(Text.MEDIUM, 12, text) <= width) return text;
        String t = text;
        while (t.length() > 1 && Text.width(Text.MEDIUM, 12, t + "…") > width) t = t.substring(0, t.length() - 1);
        return t.trim() + "…";
    }

    static void scroll(int wheel) {
        if (HudEditor.active) { HudEditor.scroll(wheel); return; }
        if (tab == 0 && page == null) scrollTarget -= wheel / 120f * 70;
    }

    private static void modPage(Bridge b, Clicks c) {
        final Mod m = page;
        Ui.greyButton(X, 20, 32, 32, null, null, null);
        Gfx.icon("left", X + 8, 28, 16, Ui.T1);
        c.hit(X, 20, 32, 32, new Runnable() { public void run() { page = null; } });
        Text.draw(Text.BOLD, 20, m.name, X + 44, 16, Ui.T1);
        Text.draw(Text.MEDIUM, 12, "Mods  /  " + m.name, X + 44, 41, Ui.T3);
        Text.draw(Text.SEMIBOLD, 13, "On", 918, 27, Ui.T2);
        Ui.toggle(944, 26, m.on());
        c.hit(910, 20, 72, 32, new Runnable() { public void run() { m.setOn(!m.on()); } });

        float sy;
        if (m.hud) {
            // Live preview: in a world the box is see-through, so the mod shows on your actual game.
            Gfx.rrect(X, 72, 772, 176, 12, Gfx.rgba(0, world ? 0.08f : 0.3f));
            Gfx.outline(X, 72, 772, 176, 12, Gfx.rgba(0xFFFFFF, 0.08f));
            String lbl = world ? "Live preview  ·  on your game" : "Live preview";
            float lw = Text.width(Text.SEMIBOLD, 12, lbl) + 20;
            Gfx.rrect(X + 12, 84, lw, 24, 6, Gfx.rgba(0x0F1115, 0.8f));
            Text.centred(Text.SEMIBOLD, 12, lbl, X + 22, 84, 24, Ui.T1);
            float k = 1.4f * m.size.num() / 100f, saved = Gfx.scale;
            float[] size = m.measure(b);
            float ex = X + (772 - size[0] * k) / 2, ey = 72 + (176 - size[1] * k) / 2;
            GL11.glPushMatrix();
            GL11.glTranslatef(ex, ey, 0);
            GL11.glScalef(k, k, 1);
            Gfx.scale = saved * k;
            m.draw(b, 0, 0);
            Gfx.scale = saved;
            GL11.glPopMatrix();
            if (!m.on()) Text.draw(Text.MEDIUM, 12, "Off: turn it on to show it in game", X + 14, 222, Ui.T3);
            sy = 262;
        } else {
            Text.draw(Text.MEDIUM, 14, m.description, X, 64, Ui.T2);
            sy = 96;
        }

        // Settings in one titled card, two columns.
        final float colW = 358;
        int rows = (m.settings.size() + 1) / 2;
        Gfx.rrect(X, sy, 772, 38 + rows * 47 + 6, 12, Gfx.rgba(0xFFFFFF, 0.035f));
        Gfx.outline(X, sy, 772, 38 + rows * 47 + 6, 12, Gfx.rgba(0xFFFFFF, 0.06f));
        Text.draw(Text.BOLD, 11, "SETTINGS", X + 16, sy + 15, Ui.T3, 0.9f);
        for (int i = 0; i < m.settings.size(); i++) {
            final Setting st = m.settings.get(i);
            int col = i % 2, row = i / 2;
            float x = X + 16 + col * (colW + 24), y = sy + 30 + row * 47;
            if (st.type == Setting.SLIDER) sliderRow(c, x, y - 2, colW, st);
            else if (st.type == Setting.CHOICE) choiceRow(c, x, y, colW, st);
            else if (st.type == Setting.KEY) keyRow(c, x, y, colW, st);
            else {
                Text.draw(Text.MEDIUM, 14, st.label, x, y + 14, Ui.T1);
                Ui.toggle(x + colW - 34, y + 13, st.bool());
                c.hit(x, y + 6, colW, 34, new Runnable() { public void run() { st.set(!st.bool()); } });
            }
            if (row < rows - 1) Gfx.rect(x, y + 46, colW, 1, Gfx.rgba(0xFFFFFF, 0.06f));
        }

        String note = m.note();
        if (note != null) {
            Gfx.rrect(X, 506, 772, 38, 8, Gfx.rgba(Ui.GREY, 0.08f));
            Gfx.icon("bell", X + 12, 517, 16, Ui.T2);
            Text.centred(Text.MEDIUM, 13, note, X + 38, 506, 38, Ui.T2);
        }

        Ui.greyButton(X, 560, 172, 36, "reset", "Reset to default", null);
        c.hit(X, 560, 172, 36, new Runnable() { public void run() { m.reset(); } });
        String saved2 = "Changes save automatically";
        Text.draw(Text.MEDIUM, 12, saved2, X + 772 - Text.width(Text.MEDIUM, 12, saved2), 571, Ui.T3);
    }

    private static void settings(final Bridge b, Clicks c) {
        float tw = Text.draw(Text.BOLD, 22, "Settings", X, 20, Ui.T1);
        Text.draw(Text.MEDIUM, 13, "Saved for this installation", X + tw + 12, 28, Ui.T3);
        // Two columns of titled cards (In-game v2); rows sit 16 in from each card's edge.
        final float cardW = 380, L = X, R = X + cardW + 12, colW = cardW - 32;

        float y = card(L, 66, cardW, 3, "MENU") + 30;
        Text.draw(Text.MEDIUM, 14, "Open Kestrel menu", L + 16, y + 8, Ui.T1);
        Text.draw(Text.MEDIUM, 12, "Right Shift opens and closes it", L + 16, y + 28, Ui.T3);
        Ui.keycap(L + 16 + colW - Text.width(Text.BOLD, 11, "Right Shift") - 14, y + 15, "Right Shift");
        Gfx.rect(L + 16, y + 52, colW, 1, Gfx.rgba(0xFFFFFF, 0.06f));
        y += 53;
        row(c, L + 16, y, colW, "Custom main menu", "Kestrel buttons on the title screen", "ui.mainMenu", true, true, null);
        y += 53;
        sliderRow(c, L + 16, y - 4, colW, Config.SIZE);
        Text.draw(Text.MEDIUM, 12, "Follows your Minecraft GUI scale", L + 16, y + 28, Ui.T3);

        // Performance: each fix can be switched off if it ever causes trouble.
        Runnable reapply = new Runnable() { public void run() { Perf.apply(b); } };
        y = card(L, 66 + 193 + 12, cardW, 3, "PERFORMANCE") + 30;
        row(c, L + 16, y, colW, "Fewer GPU waits", "CPU and graphics card work at the same time", "perf.syncs", true, true, reapply);
        row(c, L + 16, y + 53, colW, "Faster clouds", b.optifine() ? "OptiFine handles clouds itself" : "Builds clouds once, not every frame", "perf.clouds", true, true, reapply);
        row(c, L + 16, y + 106, colW, "Hide hidden mobs and blocks", "Skips what's behind walls; never players", "perf.culling", true, false, reapply);

        y = card(R, 66, cardW, 4, "IN GAME") + 30;
        row(c, R + 16, y, colW, "Blur behind menus", "Light, so you can still see the game", "ui.blur", true, true, null);
        sliderRow(c, R + 16, y + 53, colW, Config.BLUR);
        Gfx.rect(R + 16, y + 53 + 52, colW, 1, Gfx.rgba(0xFFFFFF, 0.06f));
        sliderRow(c, R + 16, y + 106, colW, Config.OPACITY);
        Gfx.rect(R + 16, y + 106 + 52, colW, 1, Gfx.rgba(0xFFFFFF, 0.06f));
        row(c, R + 16, y + 159, colW, "Hide HUD while F3 is open", "So it doesn't cover the debug text", "hud.hideOnDebug", true, false, null);

        float ay = 66 + 246 + 12;
        Gfx.rrect(R, ay, cardW, 60, 12, Gfx.rgba(0xFFFFFF, 0.035f));
        Gfx.outline(R, ay, cardW, 60, 12, Gfx.rgba(0xFFFFFF, 0.06f));
        Gfx.icon("kestrel", R + 16, ay + 19, 22, Ui.T1);
        Text.draw(Text.SEMIBOLD, 14, "Kestrel " + System.getProperty("kestrel.version", Agent.VERSION), R + 50, ay + 12, Ui.T1);
        Text.draw(Text.MEDIUM, 12, "Not affiliated with Mojang or Microsoft", R + 50, ay + 32, Ui.T3);
    }

    private static int cosTab;          // 0 Kestrel capes, 1 Minecraft capes
    private static String cosPreview;   // the cape being tried on (null = the one you wear, "" = none)

    /**
     * Cosmetics, like the launcher's: Kestrel / Minecraft capes as 3D tiles on the left; click one to try it
     * on the turning player on the right, then Wear. Changes show at once and are saved when the game closes.
     */
    private static void cosmetics(final Bridge b, Clicks c) {
        float tw = Text.draw(Text.BOLD, 22, "Cosmetics", X, 20, Ui.T1);
        Text.draw(Text.MEDIUM, 13, "Click a cape to try it on, then wear it", X + tw + 12, 28, Ui.T3);
        final boolean mc = cosTab == 1;
        final List<Cape.Entry> capes = mc ? Cape.minecraft(b) : Cape.list(b);
        final String worn = mc ? Cape.mcEquipped(b) : Cape.equipped(b);
        final String shown = cosPreview == null ? worn : cosPreview;

        // Tabs
        String[] tabs = {"Kestrel capes", "Minecraft capes"};
        float tx = X;
        for (int i = 0; i < 2; i++) {
            final int n = i;
            Ui.chip(tx, 64, tabs[i], cosTab == i, null);
            c.hit(tx, 64, Ui.chipWidth(tabs[i]), 28, new Runnable() { public void run() { cosTab = n; cosPreview = null; } });
            tx += Ui.chipWidth(tabs[i]) + 6;
        }

        // Preview: you from behind, turning gently, trying on the cape.
        final float pw = 268, px = X + 772 - pw, py = 64, ph = PH - 64 - 16;
        Gfx.rrect(px, py, pw, ph, 14, Gfx.rgba(0, 0.3f));
        Gfx.outline(px, py, pw, ph, 14, Gfx.rgba(0xFFFFFF, 0.06f));
        float t = (System.currentTimeMillis() % 3600000L) / 1000f;
        String onModel = shown.isEmpty() && !mc ? Cape.mcEquipped(b) : shown; // no Kestrel cape: your Minecraft one shows
        Model.draw(b.skinTexture(), px + pw / 2, py + ph - 128, 7.6f, 180 + (float) Math.sin(t * 0.7f) * 38, -8, Mod.CAPE.on() ? Cape.preview(b, onModel) : -1);
        Text.draw(Text.MEDIUM, 11, "Cloth physics", px + 16, py + ph - 108, Ui.T2);
        Ui.toggle(px + pw - 16 - 34, py + ph - 112, Mod.CAPE.cloth.bool());
        c.hit(px + 8, py + ph - 118, pw - 16, 28, new Runnable() { public void run() { Mod.CAPE.cloth.set(!Mod.CAPE.cloth.bool()); } });
        // The one button says what clicking it does for the cape being tried on.
        String name = "";
        for (Cape.Entry e : capes) if (e.id.equals(shown)) name = e.name;
        final float bx = px + 12, by = py + ph - 64, bw = pw - 24, bh = 44;
        boolean same = shown.equals(worn), hov = Ui.hover(bx, by, bw, bh);
        String label = same ? (worn.isEmpty() ? (mc ? "No Minecraft cape shown" : "No cape on") : (mc ? "Showing " : "Wearing ") + name)
                : shown.isEmpty() ? (mc ? "Hide Minecraft cape" : "Take off cape") : (mc ? "Show " : "Wear ") + name;
        int fill = same ? Gfx.rgba(0xFFFFFF, 0.06f) : shown.isEmpty() ? Gfx.rgba(Ui.GREY, hov ? 0.26f : 0.17f) : Gfx.rgba(0x3DD879, hov ? 0.24f : 0.16f);
        Gfx.box(bx, by, bw, bh, 10, fill, Gfx.rgba(0xFFFFFF, same ? 0.05f : 0.1f), 0);
        Text.centred(Text.SEMIBOLD, 14, label, bx + (bw - Text.width(Text.SEMIBOLD, 14, label)) / 2, by, bh, same ? Ui.T3 : shown.isEmpty() ? Ui.T1 : 0xFF5BE38F);
        if (!same) c.hit(bx, by, bw, bh, new Runnable() {
            public void run() { if (mc) Cape.wearMc(b, shown); else Cape.wear(b, shown); cosPreview = null; }
        });

        // Tiles: "No cape" first, then every cape, each one in 3D on its own.
        final float gw = 772 - pw - 16, cw = (gw - 30) / 4, chh = 154, top = 106;
        if (capes.isEmpty()) {
            Gfx.rrect(X, top, gw, 120, 12, Gfx.rgba(0xFFFFFF, 0.035f));
            Gfx.icon("shirt", X + gw / 2 - 12, top + 22, 24, Ui.T3);
            String a = mc ? "No Minecraft capes here" : "No Kestrel capes yet";
            String s = mc ? "Sign in with Microsoft in the launcher to see the capes on your account." : "Capes you own show here. Link Discord in the launcher first.";
            Text.draw(Text.SEMIBOLD, 14, a, X + (gw - Text.width(Text.SEMIBOLD, 14, a)) / 2, top + 58, Ui.T1);
            Text.draw(Text.MEDIUM, 12, s, X + (gw - Text.width(Text.MEDIUM, 12, s)) / 2, top + 82, Ui.T3);
            return;
        }
        for (int i = -1; i < capes.size(); i++) {
            final String id = i < 0 ? "" : capes.get(i).id;
            int slot = i + 1;
            float x = X + (slot % 4) * (cw + 10), y = top + (slot / 4) * (chh + 10);
            if (y + chh > PH - 16) break;
            boolean sel = shown.equals(id), hovT = Ui.hover(x, y, cw, chh), wearing = worn.equals(id);
            Gfx.rrect(x, y, cw, chh, 12, Gfx.rgba(0xFFFFFF, hovT ? 0.07f : 0.04f));
            Gfx.outline(x, y, cw, chh, 12, Gfx.rgba(0xFFFFFF, sel ? 0.85f : 0.06f));
            Gfx.rrect(x + 7, y + 7, cw - 14, 100, 9, Gfx.rgba(0, 0.32f));
            if (i < 0) Gfx.icon("x", x + cw / 2 - 12, y + 7 + 38, 24, Ui.T3);
            else Model.drawCape(Cape.preview(b, id), x + cw / 2, y + 7 + 50, 4.6f, hovT ? -48 : -28, -8);
            if (wearing && i >= 0) {
                Gfx.rrect(x + cw - 26, y + 12, 16, 16, 8, 0xFFF2F3F5);
                Gfx.icon("check", x + cw - 23, y + 15, 10, 0xFF0C0D0F);
            }
            String nm = i < 0 ? "No cape" : capes.get(i).name;
            while (Text.width(Text.SEMIBOLD, 12, nm) > cw - 12 && nm.length() > 3) nm = nm.substring(0, nm.length() - 2) + "…";
            Text.draw(Text.SEMIBOLD, 12, nm, x + (cw - Text.width(Text.SEMIBOLD, 12, nm)) / 2, y + 114, Ui.T1);
            String sub = wearing ? (mc ? "Showing" : "Wearing") : i < 0 ? "Hide it" : "Yours";
            Text.draw(Text.MEDIUM, 11, sub, x + (cw - Text.width(Text.MEDIUM, 11, sub)) / 2, y + 132, Ui.T3);
            c.hit(x, y, cw, chh, new Runnable() { public void run() { cosPreview = id; } });
        }
    }

    /** Friends: who's on and where, with Join. Adding and accepting friends happens in the launcher. */
    private static void friends(final Bridge b, Clicks c) {
        float tw = Text.draw(Text.BOLD, 22, "Friends", X, 20, Ui.T1);
        final List<Friends.Friend> list = Friends.list(b);
        int on = 0;
        for (Friends.Friend f : list) if (f.online()) on++;
        if (Friends.available(b)) Text.draw(Text.MEDIUM, 13, on + " of " + list.size() + " online", X + tw + 12, 28, Ui.T3);
        float y = 66;
        int requests = Friends.incoming(b);
        if (requests > 0) {
            Gfx.rrect(X, y, 772, 44, 10, Gfx.rgba(0xFFFFFF, 0.05f));
            Gfx.outline(X, y, 772, 44, 10, Gfx.rgba(0xFFFFFF, 0.08f));
            Gfx.icon("bell", X + 14, y + 13, 18, Ui.T1);
            String s = requests + " friend request" + (requests == 1 ? "" : "s") + "  ·  accept in the Kestrel launcher";
            Text.centred(Text.SEMIBOLD, 13, s, X + 42, y, 44, Ui.T1);
            y += 56;
        }
        if (list.isEmpty()) {
            Gfx.rrect(X, y, 772, 130, 12, Gfx.rgba(0xFFFFFF, 0.035f));
            Gfx.icon("users", X + 386 - 12, y + 24, 24, Ui.T3);
            String a = Friends.available(b) ? "No friends yet" : "Link Discord to use friends";
            String s = Friends.available(b) ? "Add friends by their Minecraft name on the launcher's Friends page." : "Open the Kestrel launcher, go to Settings > Discord, then relaunch.";
            Text.draw(Text.SEMIBOLD, 14, a, X + 386 - Text.width(Text.SEMIBOLD, 14, a) / 2, y + 62, Ui.T1);
            Text.draw(Text.MEDIUM, 12, s, X + 386 - Text.width(Text.MEDIUM, 12, s) / 2, y + 86, Ui.T3);
            return;
        }
        final String here = b.server();
        int shown = 0;
        for (final Friends.Friend f : list) {
            if (y + 54 > PH - 40) break;
            Gfx.rrect(X, y, 772, 54, 10, Gfx.rgba(0xFFFFFF, Ui.hover(X, y, 772, 54) ? 0.06f : 0.035f));
            // Letter tile with a status dot: green playing, blue in the launcher, grey offline.
            Gfx.rrect(X + 10, y + 9, 36, 36, 8, Gfx.rgba(0xFFFFFF, 0.08f));
            String letter = f.name.isEmpty() ? "?" : f.name.substring(0, 1).toUpperCase();
            Text.centred(Text.BOLD, 15, letter, X + 28 - Text.width(Text.BOLD, 15, letter) / 2, y + 9, 36, Ui.T1);
            Gfx.rrect(X + 38, y + 37, 11, 11, 5.5f, 0xFF15171B);
            Gfx.rrect(X + 40, y + 39, 7, 7, 3.5f, f.playing() ? 0xFF3DD879 : f.online() ? 0xFF8FC9FF : 0xFF50545C);
            Text.draw(Text.SEMIBOLD, 14, f.name, X + 60, y + 11, Ui.T1);
            Text.draw(Text.MEDIUM, 12, Friends.status(f), X + 60, y + 31, f.playing() ? Ui.T2 : Ui.T3);
            if (f.playing() && !f.server.isEmpty()) {
                boolean same = here != null && here.equalsIgnoreCase(f.server);
                if (same) Text.centred(Text.MEDIUM, 12, "Same server", X + 772 - 14 - Text.width(Text.MEDIUM, 12, "Same server"), y, 54, Ui.T3);
                else {
                    Ui.button(X + 772 - 92, y + 10, 80, 34, null, "Join", null);
                    c.hit(X + 772 - 92, y + 10, 80, 34, new Runnable() { public void run() { close(b); b.connect(f.server); } });
                }
            }
            y += 60;
            shown++;
        }
        if (shown < list.size()) Text.draw(Text.MEDIUM, 12, "+" + (list.size() - shown) + " more on the launcher's Friends page", X, y + 4, Ui.T3);
    }

    /** A titled settings card for `rows` rows of 53; returns its top. */
    private static float card(float x, float y, float w, int rows, String title) {
        float h = 30 + rows * 53 + 4;
        Gfx.rrect(x, y, w, h, 12, Gfx.rgba(0xFFFFFF, 0.035f));
        Gfx.outline(x, y, w, h, 12, Gfx.rgba(0xFFFFFF, 0.06f));
        Text.draw(Text.BOLD, 11, title, x + 16, y + 15, Ui.T3, 0.9f);
        return y;
    }

    /** Label on the left, slider and value on the right (row height 47-53). */
    private static void sliderRow(Clicks c, float x, float y, float w, final Setting st) {
        Text.draw(Text.MEDIUM, 14, st.label, x, y + 16, Ui.T1);
        String v = st.num() + st.unit;
        Text.draw(Text.SEMIBOLD, 13, v, x + w - Text.width(Text.SEMIBOLD, 13, v), y + 16, Ui.T2);
        final float sx = x + w - 60 - 130;
        Ui.slider(sx, y + 18, 130, (st.num() - st.min) / (float) (st.max - st.min));
        c.hit(sx - 8, y + 10, 146, 32, new Runnable() { public void run() { dragging = st; dragX = sx; dragW = 130; } });
    }

    /** Label on the left, "< value >" on the right: the left half goes back, the right half forward. */
    private static void choiceRow(Clicks c, float x, float y, float w, final Setting st) {
        Text.draw(Text.MEDIUM, 14, st.label, x, y + 14, Ui.T1);
        final float bw = 176, bx = x + w - bw;
        boolean hov = Ui.hover(bx, y + 8, bw, 30);
        Gfx.box(bx, y + 8, bw, 30, 8, Gfx.rgba(Ui.GREY, hov ? 0.2f : 0.12f), Gfx.rgba(0xFFFFFF, 0.1f), 0);
        Gfx.icon("left", bx + 8, y + 15, 16, Ui.T2);
        Gfx.icon("right", bx + bw - 24, y + 15, 16, Ui.T2);
        String v = st.choice();
        Text.centred(Text.SEMIBOLD, 13, v, bx + (bw - Text.width(Text.SEMIBOLD, 13, v)) / 2, y + 8, 30, Ui.T1);
        final int n = st.choices.length;
        c.hit(bx, y + 8, bw / 2, 30, new Runnable() { public void run() { st.set((st.num() + n - 1) % n); } });
        c.hit(bx + bw / 2, y + 8, bw / 2, 30, new Runnable() { public void run() { st.set((st.num() + 1) % n); } });
    }

    /** Label on the left, the key on the right; click it, then press a key (Backspace clears it). */
    private static void keyRow(Clicks c, float x, float y, float w, final Setting st) {
        Text.draw(Text.MEDIUM, 14, st.label, x, y + 14, Ui.T1);
        boolean wait = listening == st;
        String v = wait ? "Press a key" : Setting.keyName(st.num());
        float bw = Math.max(88, Text.width(Text.SEMIBOLD, 13, v) + 28), bx = x + w - bw;
        Gfx.box(bx, y + 8, bw, 30, 8, Gfx.rgba(wait ? 0xFFFFFF : Ui.GREY, wait ? 0.14f : 0.12f), Gfx.rgba(0xFFFFFF, wait ? 0.4f : 0.16f), 0);
        Text.centred(Text.SEMIBOLD, 13, v, bx + 14, y + 8, 30, wait ? Ui.T1 : Ui.T1);
        c.hit(bx, y + 8, bw, 30, new Runnable() { public void run() { listening = st; } });
    }

    private static Setting listening;

    private static void row(Clicks c, float x, float y, float w, String label, String sub, final String key, final boolean def, boolean divider, final Runnable after) {
        Text.draw(Text.MEDIUM, 14, label, x, y + 8, Ui.T1);
        Text.draw(Text.MEDIUM, 12, sub, x, y + 28, Ui.T3);
        Ui.toggle(x + w - 34, y + 16, Config.bool(key, def));
        if (divider) Gfx.rect(x, y + 52, w, 1, Gfx.rgba(0xFFFFFF, 0.06f));
        c.hit(x, y + 4, w, 44, new Runnable() {
            public void run() {
                Config.set(key, !Config.bool(key, def));
                if (after != null) after.run();
            }
        });
    }

    private static void wrap(String text, float x, float y, float width, int color) {
        String line = "";
        int lines = 0;
        for (String word : text.split(" ")) {
            String next = line.isEmpty() ? word : line + " " + word;
            if (Text.width(Text.MEDIUM, 12, next) > width && !line.isEmpty()) {
                Text.draw(Text.MEDIUM, 12, line, x, y + lines * 16, color);
                if (++lines == 2) return;
                line = word;
            } else {
                line = next;
            }
        }
        if (!line.isEmpty()) Text.draw(Text.MEDIUM, 12, line, x, y + lines * 16, color);
    }

    /** Click areas drawn in panel coordinates, registered in screen coordinates. */
    private static final class Clicks {
        final float ox, oy;
        Clicks(float ox, float oy) { this.ox = ox; this.oy = oy; }
        void hit(float x, float y, float w, float h, Runnable r) { Ui.hit(x + ox, y + oy, w, h, r); }
    }
}
