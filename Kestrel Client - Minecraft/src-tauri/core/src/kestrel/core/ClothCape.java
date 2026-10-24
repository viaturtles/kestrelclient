package kestrel.core;

import org.lwjgl.opengl.GL11;

/**
 * Cloth cape: instead of vanilla's single stiff board, the cape is drawn as 16 strips. The top follows
 * vanilla's swing; each strip below lags a little behind the one above and ripples while you move, so it
 * bends like fabric. Drawn in LayerCape's place (same position and texture), for your own player.
 */
final class ClothCape {
    private static final int N = 16;          // strips, one cape pixel each
    private static final float[] ang = new float[N];
    private static long last;
    private static float phase, side;

    static void draw(Bridge b, Object player, float pt, Object texture) {
        float[] m = b.capeMotion(player, pt);
        if (m == null) return;
        long now = System.nanoTime();
        float dt = last == 0 ? 1 : Math.min(3, (now - last) / 16.6e6f); // in 60 fps frames
        last = now;
        float base = 6 + m[1] / 2 + m[0];
        float speed = Math.min(1, m[1] / 40f);
        // Sideways swing eases in and is limited, so sharp turns don't fling the cape out.
        side += (Math.max(-30, Math.min(30, m[2])) - side) * Math.min(1, dt * 0.15f);
        phase += dt * (0.06f + 0.22f * speed);
        // Top strip follows vanilla's angle; lower strips catch up more slowly and carry a travelling ripple.
        for (int i = 0; i < N; i++) {
            float wave = (float) Math.sin(phase * 2 * Math.PI - i * 0.45f) * (0.8f + 7f * speed) * (i / (float) N);
            float target = (i == 0 ? base : ang[i - 1] + (base - ang[i - 1]) * 0.15f) + wave;
            float k = Math.min(1, dt * (0.5f - i * 0.022f));
            ang[i] += (target - ang[i]) * k;
        }

        GL11.glColor4f(1, 1, 1, 1);
        b.bind(texture);
        GL11.glPushMatrix();
        GL11.glTranslatef(0, 0, 0.125f);
        GL11.glRotatef(side / 2, 0, 0, 1);
        GL11.glRotatef(-side / 2, 0, 1, 0);
        GL11.glScalef(0.0625f, 0.0625f, 0.0625f); // cape pixels
        float y = 0, z = 0;
        GL11.glBegin(GL11.GL_QUADS);
        for (int i = 0; i < N; i++) {
            double a = Math.toRadians(ang[i]);
            float dy = (float) Math.cos(a), dz = (float) Math.sin(a);
            float ny = -dz, nz = dy;                 // points away from the back
            float y2 = y + dy, z2 = z + dz;
            float v0 = (1 + i) / 32f, v1 = (2 + i) / 32f;
            // Outside (seen from behind): texture (1,1)-(11,17), the same way round as vanilla's cape.
            GL11.glNormal3f(0, ny, nz);
            quad(5, y + ny, z + nz, -5, y2 + ny, z2 + nz, 1 / 64f, 11 / 64f, v0, v1);
            // Inside (faces your back): (12,1)-(22,17).
            GL11.glNormal3f(0, -ny, -nz);
            quad(-5, y, z, 5, y2, z2, 12 / 64f, 22 / 64f, v0, v1);
            // Edges: (0,1) and (11,1), one pixel wide.
            GL11.glNormal3f(1, 0, 0);
            edge(5, y, z, y2, z2, ny, nz, 11 / 64f, 12 / 64f, v0, v1);
            GL11.glNormal3f(-1, 0, 0);
            edge(-5, y, z, y2, z2, ny, nz, 0, 1 / 64f, v0, v1);
            if (i == 0) {
                // Top: (1,0)-(11,1).
                GL11.glNormal3f(0, -1, 0);
                vtx(-5, y, z, 11 / 64f, 0); vtx(5, y, z, 1 / 64f, 0); vtx(5, y + ny, z + nz, 1 / 64f, 1 / 32f); vtx(-5, y + ny, z + nz, 11 / 64f, 1 / 32f);
            }
            if (i == N - 1) {
                // Bottom: (11,0)-(21,1).
                GL11.glNormal3f(0, dy, dz);
                vtx(5, y2, z2, 11 / 64f, 0); vtx(-5, y2, z2, 21 / 64f, 0); vtx(-5, y2 + ny, z2 + nz, 21 / 64f, 1 / 32f); vtx(5, y2 + ny, z2 + nz, 11 / 64f, 1 / 32f);
            }
            y = y2;
            z = z2;
        }
        GL11.glEnd();
        GL11.glPopMatrix();
    }

    /** A strip from (x0, ya, za) across to x1 and down to (yb, zb). */
    private static void quad(float x0, float ya, float za, float x1, float yb, float zb, float u0, float u1, float v0, float v1) {
        vtx(x0, ya, za, u0, v0); vtx(x1, ya, za, u1, v0); vtx(x1, yb, zb, u1, v1); vtx(x0, yb, zb, u0, v1);
    }

    private static void edge(float x, float ya, float za, float yb, float zb, float ny, float nz, float u0, float u1, float v0, float v1) {
        vtx(x, ya, za, u0, v0); vtx(x, ya + ny, za + nz, u1, v0); vtx(x, yb + ny, zb + nz, u1, v1); vtx(x, yb, zb, u0, v1);
    }

    private static void vtx(float x, float y, float z, float u, float v) {
        GL11.glTexCoord2f(u, v);
        GL11.glVertex3f(x, y, z);
    }
}
