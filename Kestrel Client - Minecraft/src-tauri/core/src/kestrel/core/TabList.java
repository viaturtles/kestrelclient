package kestrel.core;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The Tab player list in Kestrel's style (Figma "Tab list"): one dark rounded panel, a row per player
 * with the Kestrel bird for Kestrel players, their head and name, and signal bars with the ping in ms.
 * Names, heads, scores and the server's header and footer are still drawn by Minecraft, so ranks and
 * colours look the same as everywhere else.
 */
final class TabList extends Mod {
    /** Other players known to use Kestrel (looked up on Kestrel's service by Others); you always count. */
    static final Set<UUID> KESTREL = Collections.synchronizedSet(new HashSet<UUID>());
    /** Ping bars in GUI pixels: bar width, and the width of all four (Ui.signal). */
    private static final float SIGNAL_UNIT = 0.9f, SIGNAL_W = 4 * SIGNAL_UNIT + 3 * SIGNAL_UNIT * 0.6f;
    /** In GUI pixels: a player strip, the gap between strips, a box's padding and the gap between boxes. */
    private static final float ROW = 9, GAP = 1, PAD = 2, BOX_GAP = 2;

    final Setting ms = toggle("ms", "Ping in ms", true);
    final Setting logo = toggle("logo", "Kestrel logo next to Kestrel players", true);
    final Setting fill = slider("boxes", "Background opacity", 20, 80, 50, "%");
    final Setting scores = toggle("scores", "Show server scores (health, points)", false);

    TabList() { super("tablist", "Tab list", "Ping in ms, cleaner", "users", true, false); }

    String note() { return "The Kestrel logo shows next to you and other Kestrel players who linked their Minecraft account."; }

    /** GuiPlayerTabOverlay.renderPlayerlist; `width` is the scaled screen width. */
    void draw(Bridge b, Object overlay, int width, Object scoreboard, Object objective) {
        if (!scores.bool()) objective = null; // the yellow numbers some servers put next to names
        List<Object> players = b.tabPlayers();
        int n = players.size();
        UUID self = b.self();
        boolean heads = b.tabHeads(), showMs = ms.bool();
        int scoreW = 0;
        float nameW = 0;
        Object[][] rows = new Object[n][];
        boolean[] bird = new boolean[n];
        for (int i = 0; i < n; i++) {
            rows[i] = b.tabPlayer(players.get(i));
            if (logo.bool()) Others.want(b, (UUID) rows[i][1]);
            bird[i] = logo.bool() && kestrel((UUID) rows[i][1], self);
            // The bird sits inline before the name, so it counts towards that row's name width.
            nameW = Math.max(nameW, b.textWidth((String) rows[i][0]) + (bird[i] ? 10 : 0));
            if ((Integer) rows[i][3] == 0) scoreW = Math.max(scoreW, b.tabScoreWidth(scoreboard, objective, players.get(i)));
        }
        int cols = 1, perCol = n;
        while (perCol > 20) perCol = (n + ++cols - 1) / cols;
        float msW = showMs ? Text.width(Text.SEMIBOLD, 6, "999") + 0.5f + Text.width(Text.MEDIUM, 5, "ms") : 0, pingW = SIGNAL_W + (showMs ? 2.5f + msW : 0) + 2;
        float colW = 1 + (heads ? 9 : 0) + nameW + 6 + (scoreW > 0 ? scoreW + 2 : 0) + pingW;
        colW = (float) Math.ceil(Math.min(colW, (width - 30 - (cols - 1) * 4f) / cols));
        float listW = cols * colW + (cols - 1) * 4;

        // Like vanilla: the header, the players and the footer each get their own dark box.
        List<String> header = b.tabHeader(overlay, width - 50), footer = b.tabFooter(overlay, width - 50);
        float textW = 0;
        for (String s : header) textW = Math.max(textW, b.textWidth(s));
        for (String s : footer) textW = Math.max(textW, b.textWidth(s));
        float boxW = Math.max(listW + PAD * 2, textW + PAD * 2 + 4);
        float x0 = (float) Math.floor(width / 2f - boxW / 2), y0 = 10;
        float headerH = header.isEmpty() ? 0 : header.size() * 9 - 1 + PAD * 2;
        float listH = perCol * (ROW + GAP) - GAP + PAD * 2;
        float footerH = footer.isEmpty() ? 0 : footer.size() * 9 - 1 + PAD * 2;
        float listY = y0 + (headerH > 0 ? headerH + BOX_GAP : 0), footerY = listY + listH + BOX_GAP;
        float lx = (float) Math.floor(width / 2f - listW / 2), ly = listY + PAD;

        int w = b.width(), h = b.height(), gui = b.guiScale();
        int box = Gfx.rgba(0, fill.num() / 100f), strip = Gfx.rgba(0xFFFFFF, 0.125f);
        // Kestrel's part: rounded boxes and strips, birds, signal bars and ms.
        Gfx.begin(w, h, gui);
        try {
            if (headerH > 0) Gfx.rrect(x0, y0, boxW, headerH, 3, box);
            Gfx.rrect(x0, listY, boxW, listH, 3, box);
            if (footerH > 0) Gfx.rrect(x0, footerY, boxW, footerH, 3, box);
            for (int i = 0; i < n; i++) {
                float rx = lx + (i / perCol) * (colW + 4), ry = ly + (i % perCol) * (ROW + GAP);
                Gfx.rrect(rx, ry, colW, ROW, 1.5f, strip);
                if (bird[i]) {
                    // The small bird (thicker strokes, made for this size) with a soft shadow so it reads on any row.
                    float bxx = rx + 1 + (heads ? 9 : 0);
                    Gfx.icon("kestrel-small", bxx + 0.5f, ry + 1, 7.5f, 0x88000000);
                    Gfx.icon("kestrel-small", bxx, ry + 0.5f, 7.5f, 0xFFFFFFFF);
                }
                int ping = (Integer) rows[i][2];
                // Right to left: grey "ms", the number in white, then the connection bars (same as the Ping HUD).
                float right = rx + colW - 2, tx = right;
                if (showMs) {
                    String num = ping < 0 ? "-" : String.valueOf(ping);
                    float uw = Text.width(Text.MEDIUM, 5, "ms"), nw = Text.width(Text.SEMIBOLD, 6, num);
                    tx = right - uw;
                    Text.centred(Text.MEDIUM, 5, "ms", tx, ry + 0.4f, ROW, Ui.T2);
                    tx -= 0.5f + nw;
                    Text.centred(Text.SEMIBOLD, 6, num, tx + 0.4f, ry + 0.4f, ROW, 0x66000000);
                    Text.centred(Text.SEMIBOLD, 6, num, tx, ry, ROW, 0xFFF2F3F5);
                    tx -= 2.5f;
                }
                Ui.signal(tx - SIGNAL_W, ry + ROW / 2 + SIGNAL_UNIT * 5.3f / 2, SIGNAL_UNIT, ping);
            }
        } finally {
            Gfx.end();
        }

        // Minecraft's part: header, heads, names, scores, footer.
        float ty = y0 + PAD;
        for (String s : header) {
            b.drawText(s, width / 2f - b.textWidth(s) / 2f, ty, -1);
            ty += 9;
        }
        for (int i = 0; i < n; i++) {
            float rx = lx + (i / perCol) * (colW + 4), ry = ly + (i % perCol) * (ROW + GAP);
            float x = rx + 1;
            Object info = players.get(i);
            if (heads) {
                b.drawHead(info, Math.round(x), Math.round(ry) + 1);
                x += 9;
            }
            if (bird[i]) x += 10;
            boolean spectator = (Integer) rows[i][3] == 1;
            b.drawText(spectator ? "§o" + rows[i][0] : (String) rows[i][0], x, ry + 1, spectator ? 0x90FFFFFF : -1);
            if (objective != null && !spectator && scoreW > 0) {
                int x2 = Math.round(rx + colW - pingW - 2), x1 = x2 - scoreW;
                if (x2 - x1 > 5) b.tabScore(overlay, objective, Math.round(ry + 1), info, x1, x2);
            }
        }
        ty = footerY + PAD;
        for (String s : footer) {
            b.drawText(s, width / 2f - b.textWidth(s) / 2f, ty, -1);
            ty += 9;
        }
    }

    private static boolean kestrel(UUID id, UUID self) {
        return id != null && (id.equals(self) || KESTREL.contains(id));
    }
}
