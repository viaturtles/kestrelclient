package kestrel.core;

import java.util.ArrayList;
import java.util.List;

/** Small notices in the top-right corner of the HUD (screenshots, friends, requeue). */
final class Toasts {
    private static final long SHOW = 4000, SLIDE = 220;
    private static final List<Object[]> live = new ArrayList<Object[]>(); // {title, sub, icon, started}

    static synchronized void show(String title, String sub, String icon) {
        live.add(new Object[]{title, sub, icon, 0L});
        while (live.size() > 3) live.remove(0);
    }

    /** Draws in design units between Gfx.begin and end; W is the screen width in those units. */
    static synchronized void draw(float W) {
        long now = System.currentTimeMillis();
        float y = 8;
        for (int i = 0; i < live.size(); i++) {
            Object[] t = live.get(i);
            if ((Long) t[3] == 0L) t[3] = now; // the clock starts when it's first drawn
            long age = now - (Long) t[3];
            if (age > SHOW) {
                live.remove(i--);
                continue;
            }
            float in = Math.min(1, age / (float) SLIDE), out = Math.min(1, (SHOW - age) / (float) SLIDE);
            float k = Math.min(in, out), e = 1 - (1 - k) * (1 - k) * (1 - k);
            String title = (String) t[0], sub = (String) t[1];
            float w = Math.max(Text.width(Text.SEMIBOLD, 13, title), sub == null ? 0 : Text.width(Text.MEDIUM, 11, sub)) + 58;
            float h = sub == null ? 36 : 46;
            float x = W - 8 - w + (1 - e) * (w + 12);
            Gfx.alpha = e;
            Gfx.box(x, y, w, h, 8, Gfx.rgba(0x141519, 0.92f), Gfx.rgba(0xFFFFFF, 0.08f), 0.8f);
            Gfx.rrect(x + 8, y + (h - 28) / 2, 28, 28, 6, Gfx.rgba(0xFFFFFF, 0.06f));
            // Thin line along the bottom shows how long the notice stays.
            float left = 1 - Math.min(1, age / (float) SHOW);
            Gfx.rect(x + 6, y + h - 1.6f, (w - 12) * left, 1.2f, Gfx.rgba(0xFFFFFF, 0.28f));
            Gfx.icon((String) t[2], x + 14, y + (h - 16) / 2, 16, Ui.T1);
            if (sub == null) {
                Text.centred(Text.SEMIBOLD, 13, title, x + 46, y, h, Ui.T1);
            } else {
                Text.draw(Text.SEMIBOLD, 13, title, x + 46, y + 7, Ui.T1);
                Text.draw(Text.MEDIUM, 11, sub, x + 46, y + 25, Ui.T2);
            }
            Gfx.alpha = 1;
            y += (h + 6) * e;
        }
    }
}
