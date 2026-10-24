package kestrel.core;

import org.lwjgl.opengl.GL11;

/**
 * A 3D player drawn from a 64x64 skin (classic arms), with the outer layer.
 * Units are skin pixels; feet at y = 0, head top at y = -32, facing +z (the viewer).
 * Optionally with your Kestrel cape behind the back.
 */
final class Model {
    // Light from the front, a little above and to the left.
    private static final float LX = -0.35f, LY = -0.55f, LZ = 0.76f;
    private static float cy, cp, sy, sp;

    /** Draws the player with its feet at (x, y) in design units, `scale` units per skin pixel. */
    static void draw(int skin, float x, float y, float scale, float yawDeg, float pitchDeg) {
        draw(skin, x, y, scale, yawDeg, pitchDeg, -1);
    }

    /** As above, with a cape (GL texture of a Minecraft cape sheet, any resolution; -1 for none). */
    static void draw(int skin, float x, float y, float scale, float yawDeg, float pitchDeg, int cape) {
        if (skin <= 0) return;
        float yaw = (float) Math.toRadians(yawDeg), pitch = (float) Math.toRadians(pitchDeg);
        cy = (float) Math.cos(yaw); sy = (float) Math.sin(yaw);
        cp = (float) Math.cos(pitch); sp = (float) Math.sin(pitch);

        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPushMatrix();
        GL11.glLoadIdentity();
        GL11.glOrtho(0, Gfx.width / Gfx.scale, Gfx.height / Gfx.scale, 0, -2000, 2000);
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
        GL11.glPushMatrix();
        GL11.glDepthMask(true);
        GL11.glClear(GL11.GL_DEPTH_BUFFER_BIT);
        GL11.glEnable(GL11.GL_DEPTH_TEST);
        GL11.glDepthFunc(GL11.GL_LEQUAL);
        GL11.glEnable(GL11.GL_ALPHA_TEST);
        GL11.glAlphaFunc(GL11.GL_GREATER, 0.1f);
        GL11.glEnable(GL11.GL_TEXTURE_2D);
        Gfx.pixelated(skin);
        GL11.glTranslatef(x, y - 16 * scale, 0);
        GL11.glScalef(scale, scale, scale);
        GL11.glRotatef(pitchDeg, 1, 0, 0);
        GL11.glRotatef(yawDeg, 0, 1, 0);
        GL11.glTranslatef(0, 16, 0);
        GL11.glBegin(GL11.GL_QUADS);
        // Base layer
        box(-4, -32, -4, 8, 8, 8, 0, 0, 0);      // head
        box(-4, -24, -2, 8, 12, 4, 16, 16, 0);   // body
        box(-8, -24, -2, 4, 12, 4, 40, 16, 0);   // right arm
        box(4, -24, -2, 4, 12, 4, 32, 48, 0);    // left arm
        box(-4, -12, -2, 4, 12, 4, 0, 16, 0);    // right leg
        box(0, -12, -2, 4, 12, 4, 16, 48, 0);    // left leg
        // Outer layer
        box(-4, -32, -4, 8, 8, 8, 32, 0, 0.5f);  // hat
        box(-4, -24, -2, 8, 12, 4, 16, 32, 0.25f);
        box(-8, -24, -2, 4, 12, 4, 40, 32, 0.25f);
        box(4, -24, -2, 4, 12, 4, 48, 48, 0.25f);
        box(-4, -12, -2, 4, 12, 4, 0, 32, 0.25f);
        box(0, -12, -2, 4, 12, 4, 0, 48, 0.25f);
        GL11.glEnd();
        if (cape > 0) {
            // Hangs from the shoulders behind the back, tilted out a little. Smooth filtering for HD capes.
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, cape);
            GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_LINEAR);
            texH = 32;
            GL11.glBegin(GL11.GL_QUADS);
            capeBox((float) Math.toRadians(8));
            GL11.glEnd();
            texH = 64;
        }
        GL11.glDisable(GL11.GL_TEXTURE_2D);
        GL11.glDisable(GL11.GL_ALPHA_TEST);
        GL11.glDisable(GL11.GL_DEPTH_TEST);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
    }

    /** A textured box at (x, y, z) of size (w, h, d), skin texture offset (u, v), grown by g. */
    private static void box(float x, float y, float z, float w, float h, float d, float u, float v, float g) {
        float x0 = x - g, y0 = y - g, z0 = z - g, x1 = x + w + g, y1 = y + h + g, z1 = z + d + g;
        // front (+z), back (-z)
        face(0, 0, 1, u + d, v + d, w, h, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
        face(0, 0, -1, u + 2 * d + w, v + d, w, h, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0);
        // right (-x), left (+x)
        face(-1, 0, 0, u, v + d, d, h, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
        face(1, 0, 0, u + d + w, v + d, d, h, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1);
        // top (-y), bottom (+y)
        face(0, -1, 0, u + d, v, w, d, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1);
        face(0, 1, 0, u + d + w, v, w, d, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
    }

    /** Just a cape in 3D (cosmetics tiles), centred on (x, y), `scale` units per cape pixel. */
    static void drawCape(int cape, float x, float y, float scale, float yawDeg, float pitchDeg) {
        if (cape <= 0) return;
        float yaw = (float) Math.toRadians(yawDeg), pitch = (float) Math.toRadians(pitchDeg);
        cy = (float) Math.cos(yaw); sy = (float) Math.sin(yaw);
        cp = (float) Math.cos(pitch); sp = (float) Math.sin(pitch);
        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPushMatrix();
        GL11.glLoadIdentity();
        GL11.glOrtho(0, Gfx.width / Gfx.scale, Gfx.height / Gfx.scale, 0, -2000, 2000);
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
        GL11.glPushMatrix();
        GL11.glDepthMask(true);
        GL11.glClear(GL11.GL_DEPTH_BUFFER_BIT);
        GL11.glEnable(GL11.GL_DEPTH_TEST);
        GL11.glDepthFunc(GL11.GL_LEQUAL);
        GL11.glEnable(GL11.GL_TEXTURE_2D);
        GL11.glBindTexture(GL11.GL_TEXTURE_2D, cape);
        GL11.glTranslatef(x, y, 0);
        GL11.glScalef(scale, scale, scale);
        GL11.glRotatef(pitchDeg, 1, 0, 0);
        GL11.glRotatef(yawDeg + 180, 0, 1, 0); // the outside of the cape faces you
        GL11.glTranslatef(0, 16, 2.55f);       // centre the cape on the origin
        texH = 32;
        GL11.glBegin(GL11.GL_QUADS);
        capeBox(0);
        GL11.glEnd();
        texH = 64;
        GL11.glDisable(GL11.GL_TEXTURE_2D);
        GL11.glDisable(GL11.GL_DEPTH_TEST);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_PROJECTION);
        GL11.glPopMatrix();
        GL11.glMatrixMode(GL11.GL_MODELVIEW);
    }

    /** Texture height in pixels for the UVs (64 for skins, 32 for capes). */
    private static float texH = 64;

    /** The cape: 10x16x1 from the back of the shoulders, tilted `a` radians away from the back. */
    private static void capeBox(float a) {
        float c = (float) Math.cos(a), s = (float) Math.sin(a);
        float yT = -24, yB = -24 + 16 * c, zIn = -2.05f, zOut = -3.05f, dz = -16 * s;
        // outside (faces away from the back): (1,1) 10x16; inside: (12,1)
        face(0, 0, -1, 1, 1, 10, 16, 5, yT, zOut, -5, yT, zOut, -5, yB, zOut + dz, 5, yB, zOut + dz);
        face(0, 0, 1, 12, 1, 10, 16, -5, yT, zIn, 5, yT, zIn, 5, yB, zIn + dz, -5, yB, zIn + dz);
        // edges (0,1) and (11,1), top (1,0) and bottom (11,0)
        face(1, 0, 0, 11, 1, 1, 16, 5, yT, zIn, 5, yT, zOut, 5, yB, zOut + dz, 5, yB, zIn + dz);
        face(-1, 0, 0, 0, 1, 1, 16, -5, yT, zOut, -5, yT, zIn, -5, yB, zIn + dz, -5, yB, zOut + dz);
        face(0, -1, 0, 1, 0, 10, 1, 5, yT, zIn, -5, yT, zIn, -5, yT, zOut, 5, yT, zOut);
        face(0, 1, 0, 11, 0, 10, 1, 5, yB, zOut + dz, -5, yB, zOut + dz, -5, yB, zIn + dz, 5, yB, zIn + dz);
    }

    /** One quad: corners in order top-left, top-right, bottom-right, bottom-left of its texture rect. */
    private static void face(float nx, float ny, float nz, float u, float v, float tw, float th,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy2, float cz, float dx, float dy, float dz) {
        // Normal after the same rotations as the model (yaw around y, then pitch around x).
        float rx = nx * cy + nz * sy, rz = -nx * sy + nz * cy;
        float ry = ny * cp - rz * sp;
        rz = ny * sp + rz * cp;
        float light = Math.max(0, rx * LX + ry * LY + rz * LZ);
        float shade = 0.55f + 0.45f * light;
        GL11.glColor4f(shade, shade, shade, Gfx.alpha);
        float u0 = u / 64f, v0 = v / texH, u1 = (u + tw) / 64f, v1 = (v + th) / texH;
        GL11.glTexCoord2f(u0, v0); GL11.glVertex3f(ax, ay, az);
        GL11.glTexCoord2f(u1, v0); GL11.glVertex3f(bx, by, bz);
        GL11.glTexCoord2f(u1, v1); GL11.glVertex3f(cx, cy2, cz);
        GL11.glTexCoord2f(u0, v1); GL11.glVertex3f(dx, dy, dz);
    }
}
