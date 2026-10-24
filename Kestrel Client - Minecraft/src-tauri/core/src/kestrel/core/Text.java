package kestrel.core;

import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.GlyphVector;
import java.awt.font.LineMetrics;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import org.lwjgl.opengl.GL11;

/** Inter text drawn from glyph atlases built at the exact pixel size, so it stays sharp. */
final class Text {
    static final int MEDIUM = 0, SEMIBOLD = 1, BOLD = 2;
    private static final String[] FILES = {"Inter-Medium", "Inter-SemiBold", "Inter-Bold"};
    private static final String CHARS;
    static {
        StringBuilder sb = new StringBuilder();
        for (char c = 32; c < 127; c++) sb.append(c);
        sb.append("·–—…°×›");
        CHARS = sb.toString();
    }
    private static final Font[] fonts = new Font[3];
    private static final Map<Integer, Atlas> atlases = new HashMap<Integer, Atlas>();

    private static final class Atlas {
        int tex, pad;
        float ascent, lineHeight;
        final float[] advance = new float[CHARS.length()];
        final int[] gx = new int[CHARS.length()], gy = new int[CHARS.length()], gw = new int[CHARS.length()], ox = new int[CHARS.length()];
        int cell, texW, texH;
    }

    private static Font font(int weight) {
        if (fonts[weight] == null) {
            try (InputStream in = Text.class.getResourceAsStream("/kestrel/fonts/" + FILES[weight] + ".ttf")) {
                fonts[weight] = Font.createFont(Font.TRUETYPE_FONT, in);
            } catch (Exception e) {
                Log.error("font " + FILES[weight], e);
                fonts[weight] = new Font("SansSerif", weight == MEDIUM ? Font.PLAIN : Font.BOLD, 12);
            }
        }
        return fonts[weight];
    }

    private static Atlas atlas(int weight, float size) {
        int px = Math.max(6, Math.round(size * Gfx.scale));
        Integer key = weight * 10000 + px;
        Atlas a = atlases.get(key);
        if (a != null) return a;
        a = new Atlas();
        Font f = font(weight).deriveFont((float) px);
        FontRenderContext frc = new FontRenderContext(null, true, true);
        LineMetrics lm = f.getLineMetrics("Hg", frc);
        a.ascent = lm.getAscent();
        a.lineHeight = lm.getAscent() + lm.getDescent();
        a.pad = 2;
        a.cell = (int) Math.ceil(a.lineHeight) + a.pad * 2;
        int texW = px > 40 ? 1024 : 512, x = 0, y = 0;
        for (int i = 0; i < CHARS.length(); i++) {
            GlyphVector gv = f.createGlyphVector(frc, String.valueOf(CHARS.charAt(i)));
            a.advance[i] = gv.getGlyphMetrics(0).getAdvance();
            Rectangle2D b = gv.getVisualBounds();
            int left = (int) Math.max(0, Math.ceil(-b.getMinX()));
            int w = (int) Math.ceil(Math.max(a.advance[i], b.getMaxX())) + left + a.pad * 2;
            if (x + w > texW) { x = 0; y += a.cell; }
            a.gx[i] = x; a.gy[i] = y; a.gw[i] = w; a.ox[i] = left + a.pad;
            x += w;
        }
        int texH = Integer.highestOneBit(y + a.cell) * 2;
        BufferedImage img = new BufferedImage(texW, texH, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setFont(f);
        g.setColor(java.awt.Color.WHITE);
        for (int i = 0; i < CHARS.length(); i++) {
            g.drawString(String.valueOf(CHARS.charAt(i)), a.gx[i] + a.ox[i], a.gy[i] + a.pad + a.ascent);
        }
        g.dispose();
        a.texW = texW;
        a.texH = texH;
        a.tex = Gfx.upload(img, false);
        atlases.put(key, a);
        return a;
    }

    private static int index(char c) {
        int i = CHARS.indexOf(c);
        return i < 0 ? CHARS.indexOf('?') : i;
    }

    /** Draws text with its line box top at y. Returns the width in design units. */
    static float draw(int weight, float size, String s, float x, float y, int color) {
        return draw(weight, size, s, x, y, color, 0);
    }

    /** Same, with extra letter spacing (design units). */
    static float draw(int weight, float size, String s, float x, float y, int color, float spacing) {
        Atlas a = atlas(weight, size);
        float sc = Gfx.scale;
        float start = Math.round(x * sc), pen = start, top = Math.round(y * sc);
        GL11.glEnable(GL11.GL_TEXTURE_2D);
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, a.tex);
        Gfx.color(color);
        GL11.glBegin(GL11.GL_QUADS);
        for (int k = 0; k < s.length(); k++) {
            int i = index(s.charAt(k));
            float gx = Math.round(pen) - a.ox[i], gy = top - a.pad;
            float u0 = a.gx[i] / (float) a.texW, v0 = a.gy[i] / (float) a.texH;
            float u1 = (a.gx[i] + a.gw[i]) / (float) a.texW, v1 = (a.gy[i] + a.cell) / (float) a.texH;
            float x0 = gx / sc, y0 = gy / sc, x1 = (gx + a.gw[i]) / sc, y1 = (gy + a.cell) / sc;
            GL11.glTexCoord2f(u0, v0); GL11.glVertex2f(x0, y0);
            GL11.glTexCoord2f(u0, v1); GL11.glVertex2f(x0, y1);
            GL11.glTexCoord2f(u1, v1); GL11.glVertex2f(x1, y1);
            GL11.glTexCoord2f(u1, v0); GL11.glVertex2f(x1, y0);
            pen += a.advance[i] + spacing * sc;
        }
        GL11.glEnd();
        GL11.glDisable(GL11.GL_TEXTURE_2D);
        return (pen - start) / sc;
    }

    static float width(int weight, float size, String s) {
        return width(weight, size, s, 0);
    }

    static float width(int weight, float size, String s, float spacing) {
        Atlas a = atlas(weight, size);
        float w = 0;
        for (int k = 0; k < s.length(); k++) w += a.advance[index(s.charAt(k))] + spacing * Gfx.scale;
        return w / Gfx.scale;
    }

    static float lineHeight(int weight, float size) {
        return atlas(weight, size).lineHeight / Gfx.scale;
    }

    /** Draws text vertically centred in a box of height h starting at y. */
    static float centred(int weight, float size, String s, float x, float y, float h, int color) {
        return draw(weight, size, s, x, y + (h - lineHeight(weight, size)) / 2f, color);
    }
}
