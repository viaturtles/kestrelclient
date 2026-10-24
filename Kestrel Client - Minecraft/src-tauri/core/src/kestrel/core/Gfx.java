package kestrel.core;

import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Map;
import javax.imageio.ImageIO;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL12;
import org.lwjgl.opengl.GL14;

/**
 * Drawing for Kestrel's own screens with plain OpenGL. Everything between begin() and end()
 * is in design units (pixels / scale), and all GL state is restored afterwards so Minecraft's
 * GlStateManager cache stays correct.
 */
final class Gfx {
    static float scale = 1f;
    /** Multiplies every colour's alpha (open/close fades). */
    static float alpha = 1f;
    static int width, height;
    private static int depth;
    private static final Map<Integer, Integer> corners = new HashMap<Integer, Integer>();
    private static final Map<String, Integer> images = new HashMap<String, Integer>();

    static void begin(int w, int h, float s) {
        width = w;
        height = h;
        scale = s;
        depth++;
        GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);
        GL11.glPushClientAttrib(GL11.GL_ALL_CLIENT_ATTRIB_BITS);
        GL11.glMatrixMode(GL11.GL_TEXTURE);
        GL11.glPushMatrix();
        GL11.glLoadIdentity();
        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPushMatrix();
        GL11.glLoadIdentity();
        GL11.glOrtho(0, w / s, h / s, 0, -1, 1);
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
        GL11.glPushMatrix();
        GL11.glLoadIdentity();
        GL11.glViewport(0, 0, w, h);
        GL11.glDisable(GL11.GL_DEPTH_TEST);
        GL11.glDisable(GL11.GL_LIGHTING);
        GL11.glDisable(GL11.GL_CULL_FACE);
        GL11.glDisable(GL11.GL_ALPHA_TEST);
        GL11.glDisable(GL11.GL_FOG);
        GL11.glDisable(GL11.GL_TEXTURE_2D);
        GL11.glEnable(GL11.GL_BLEND);
        GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
        GL11.glShadeModel(GL11.GL_SMOOTH);
        GL11.glTexEnvi(GL11.GL_TEXTURE_ENV, GL11.GL_TEXTURE_ENV_MODE, GL11.GL_MODULATE);
        GL11.glPixelStorei(GL11.GL_UNPACK_ALIGNMENT, 4);
        GL11.glPixelStorei(GL11.GL_UNPACK_ROW_LENGTH, 0);
        GL11.glPixelStorei(GL11.GL_UNPACK_SKIP_PIXELS, 0);
        GL11.glPixelStorei(GL11.GL_UNPACK_SKIP_ROWS, 0);
    }

    static void end() {
        if (depth == 0) return;
        depth--;
        alpha = 1f;
        GL11.glMatrixMode(GL11.GL_TEXTURE);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
        GL11.glPopMatrix();
        GL11.glPopClientAttrib();
        GL11.glPopAttrib();
    }

    // ---- colours ---------------------------------------------------------------------------

    static int rgba(int rgb, float a) {
        return (Math.max(0, Math.min(255, Math.round(a * 255))) << 24) | (rgb & 0xFFFFFF);
    }

    static void color(int argb) {
        GL11.glColor4f(((argb >> 16) & 255) / 255f, ((argb >> 8) & 255) / 255f, (argb & 255) / 255f, ((argb >>> 24) / 255f) * alpha);
    }

    static float snap(float v) {
        return Math.round(v * scale) / scale;
    }

    // ---- shapes ----------------------------------------------------------------------------

    static void rect(float x, float y, float w, float h, int c) {
        if (w <= 0 || h <= 0) return;
        color(c);
        GL11.glBegin(GL11.GL_QUADS);
        GL11.glVertex2f(x, y);
        GL11.glVertex2f(x, y + h);
        GL11.glVertex2f(x + w, y + h);
        GL11.glVertex2f(x + w, y);
        GL11.glEnd();
    }

    /** Left-to-right gradient. */
    static void gradientH(float x, float y, float w, float h, int left, int right) {
        GL11.glBegin(GL11.GL_QUADS);
        color(left);
        GL11.glVertex2f(x, y);
        GL11.glVertex2f(x, y + h);
        color(right);
        GL11.glVertex2f(x + w, y + h);
        GL11.glVertex2f(x + w, y);
        GL11.glEnd();
    }

    /** Top-to-bottom gradient. */
    static void gradientV(float x, float y, float w, float h, int top, int bottom) {
        GL11.glBegin(GL11.GL_QUADS);
        color(top);
        GL11.glVertex2f(x, y);
        color(bottom);
        GL11.glVertex2f(x, y + h);
        GL11.glVertex2f(x + w, y + h);
        color(top);
        GL11.glVertex2f(x + w, y);
        GL11.glEnd();
    }

    /** Filled rounded rectangle with anti-aliased corners. */
    static void rrect(float x, float y, float w, float h, float r, int c) {
        x = snap(x); y = snap(y); w = snap(w); h = snap(h);
        int rp = Math.round(Math.min(r, Math.min(w, h) / 2) * scale);
        if (rp < 1) { rect(x, y, w, h, c); return; }
        float rr = rp / scale;
        rect(x + rr, y, w - 2 * rr, rr, c);
        rect(x, y + rr, w, h - 2 * rr, c);
        rect(x + rr, y + h - rr, w - 2 * rr, rr, c);
        corners(x, y, w, h, rr, cornerTexture(rp, rp), c);
    }

    /** 1-pixel rounded outline, drawn inside the box. */
    static void outline(float x, float y, float w, float h, float r, int c) {
        x = snap(x); y = snap(y); w = snap(w); h = snap(h);
        int tp = Math.max(1, Math.round(scale));
        float t = tp / scale;
        int rp = Math.round(Math.min(r, Math.min(w, h) / 2) * scale);
        if (rp <= tp) {
            rect(x, y, w, t, c); rect(x, y + h - t, w, t, c);
            rect(x, y + t, t, h - 2 * t, c); rect(x + w - t, y + t, t, h - 2 * t, c);
            return;
        }
        float rr = rp / scale;
        rect(x + rr, y, w - 2 * rr, t, c);
        rect(x + rr, y + h - t, w - 2 * rr, t, c);
        rect(x, y + rr, t, h - 2 * rr, c);
        rect(x + w - t, y + rr, t, h - 2 * rr, c);
        corners(x, y, w, h, rr, cornerTexture(rp, tp), c);
    }

    /** Soft shadow around a rounded box. Drawn as rings outside it, so see-through boxes stay see-through. */
    static void shadow(float x, float y, float w, float h, float r, float strength, float drop) {
        for (int i = 1; i <= 6; i++) {
            outline(x - i, y - i, w + 2 * i, h + 2 * i, r + i, rgba(0, strength * 0.07f * (1 - i / 7f)));
        }
    }

    /** Box with fill, outline and shadow, like the launcher's buttons and cards. */
    static void box(float x, float y, float w, float h, float r, int fill, int stroke, float shadow) {
        if (shadow > 0) shadow(x, y, w, h, r, shadow, 2);
        rrect(x, y, w, h, r, fill);
        if ((stroke >>> 24) != 0) outline(x, y, w, h, r, stroke);
    }

    private static void corners(float x, float y, float w, float h, float r, int tex, int c) {
        GL11.glEnable(GL11.GL_TEXTURE_2D);
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, tex);
        color(c);
        GL11.glBegin(GL11.GL_QUADS);
        quad(x, y, r, r, 0, 0, 1, 1);
        quad(x + w - r, y, r, r, 1, 0, 0, 1);
        quad(x, y + h - r, r, r, 0, 1, 1, 0);
        quad(x + w - r, y + h - r, r, r, 1, 1, 0, 0);
        GL11.glEnd();
        GL11.glDisable(GL11.GL_TEXTURE_2D);
    }

    private static void quad(float x, float y, float w, float h, float u0, float v0, float u1, float v1) {
        GL11.glTexCoord2f(u0, v0); GL11.glVertex2f(x, y);
        GL11.glTexCoord2f(u0, v1); GL11.glVertex2f(x, y + h);
        GL11.glTexCoord2f(u1, v1); GL11.glVertex2f(x + w, y + h);
        GL11.glTexCoord2f(u1, v0); GL11.glVertex2f(x + w, y);
    }

    /** Top-left quarter of a ring (outer radius r, thickness t), 4x4 supersampled. */
    private static int cornerTexture(int r, int t) {
        Integer key = r * 1000 + t;
        Integer id = corners.get(key);
        if (id != null) return id;
        BufferedImage img = new BufferedImage(r, r, BufferedImage.TYPE_INT_ARGB);
        float inner = r - t;
        for (int py = 0; py < r; py++) {
            for (int px = 0; px < r; px++) {
                int hits = 0;
                for (int sy = 0; sy < 4; sy++) {
                    for (int sx = 0; sx < 4; sx++) {
                        float dx = r - (px + (sx + 0.5f) / 4f), dy = r - (py + (sy + 0.5f) / 4f);
                        float d = (float) Math.sqrt(dx * dx + dy * dy);
                        if (d <= r && d >= inner) hits++;
                    }
                }
                img.setRGB(px, py, ((hits * 255 / 16) << 24) | 0xFFFFFF);
            }
        }
        id = upload(img, false);
        corners.put(key, id);
        return id;
    }

    // ---- textures --------------------------------------------------------------------------

    static int upload(BufferedImage img, boolean mipmap) {
        int w = img.getWidth(), h = img.getHeight();
        int[] px = img.getRGB(0, 0, w, h, null, 0, w);
        ByteBuffer buf = BufferUtils.createByteBuffer(w * h * 4);
        for (int p : px) buf.put((byte) (p >> 16)).put((byte) (p >> 8)).put((byte) p).put((byte) (p >>> 24));
        buf.flip();
        int id = GL11.glGenTextures();
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, id);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, mipmap ? GL11.GL_LINEAR_MIPMAP_LINEAR : GL11.GL_LINEAR);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_LINEAR);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_S, GL12.GL_CLAMP_TO_EDGE);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_T, GL12.GL_CLAMP_TO_EDGE);
        if (mipmap) GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL14.GL_GENERATE_MIPMAP, GL11.GL_TRUE);
        GL11.glTexImage2D(GL11.GL_TEXTURE_2D, 0, GL11.GL_RGBA8, w, h, 0, GL11.GL_RGBA, GL11.GL_UNSIGNED_BYTE, buf);
        return id;
    }

    /** A bundled PNG from /kestrel/icons (white icons are tinted by the colour). */
    static int image(String name) {
        Integer id = images.get(name);
        if (id != null) return id;
        int tex = 0;
        try (InputStream in = Gfx.class.getResourceAsStream("/kestrel/icons/" + name + ".png")) {
            if (in != null) tex = upload(ImageIO.read(in), true);
        } catch (Exception e) {
            Log.error("image " + name, e);
        }
        images.put(name, tex);
        return tex;
    }

    static void texture(int tex, float x, float y, float w, float h, float u0, float v0, float u1, float v1, int c) {
        if (tex <= 0) return;
        GL11.glEnable(GL11.GL_TEXTURE_2D);
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, tex);
        color(c);
        GL11.glBegin(GL11.GL_QUADS);
        quad(x, y, w, h, u0, v0, u1, v1);
        GL11.glEnd();
        GL11.glDisable(GL11.GL_TEXTURE_2D);
    }

    static void icon(String name, float x, float y, float size, int c) {
        texture(image(name), snap(x), snap(y), size, size, 0, 0, 1, 1, c);
    }

    /** Skin pixels must stay sharp. */
    static void pixelated(int tex) {
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, tex);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, GL11.GL_NEAREST);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_NEAREST);
    }
}
