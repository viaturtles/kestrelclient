import java.lang.reflect.Field;
import org.lwjgl.opengl.GL11;

/**
 * Fancy clouds (RenderGlobal.renderCloudsFancy, bfr.c(FI)V) from a cached display list.
 * Vanilla rebuilds all 64 cloud tiles (about 17,000 vertices, drawn twice) every frame. The shape
 * only changes when the clouds move a whole cell (that's a texture offset), when their colour
 * changes, or when the player crosses the cloud layer (which faces show). So the tiles are built
 * once into a display list in "cell" coordinates and each frame it is only moved by the fraction
 * of a cell the clouds have drifted. Same vertices, colours, faces and passes as vanilla.
 *
 *   bfr RenderGlobal   bfx Tessellator   bfd WorldRenderer   bms DefaultVertexFormats   bfl GlStateManager
 */
public final class KestrelClouds {
    private static final jy TEXTURE = new jy("textures/environment/clouds.png");
    private static final float T = 0.00390625f, E = 9.765625E-4f;
    private static final int[] lists = {-1, -1, -1};
    private static final long[] keys = {Long.MIN_VALUE, Long.MIN_VALUE, Long.MIN_VALUE};
    private static Field ticks;

    static boolean render(Object renderGlobal, float pt, int pass) throws Exception {
        ave mc = ave.A();
        pk view = mc.ac();                                                // getRenderViewEntity
        bdb world = mc.f;                                                 // theWorld
        if (view == null || world == null || pass < 0 || pass > 2) return false;
        if (ticks == null) {
            ticks = bfr.class.getDeclaredField("w");                      // cloudTickCounter
            ticks.setAccessible(true);
        }
        bfl.p();                                                          // disableCull
        float eyeY = (float) (view.Q + (view.t - view.Q) * pt);           // lastTickPosY, posY
        double t = ticks.getInt(renderGlobal) + pt;
        double cx = (view.p + (view.s - view.p) * pt + t * 0.03f) / 12.0; // prevPosX, posX
        double cz = (view.r + (view.u - view.r) * pt) / 12.0 + 0.33f;     // prevPosZ, posZ
        float cy = world.t.f() - eyeY + 0.33f;                            // provider.getCloudHeight()
        cx -= ns.c(cx / 2048.0) * 2048;                                   // MathHelper.floor_double
        cz -= ns.c(cz / 2048.0) * 2048;
        mc.P().a(TEXTURE);                                                // renderEngine.bindTexture
        bfl.l();                                                          // enableBlend
        bfl.a(770, 771, 1, 0);                                            // tryBlendFuncSeparate
        aui colour = world.e(pt);                                         // getCloudColour
        float r = (float) colour.a, g = (float) colour.b, b = (float) colour.c;
        if (pass != 2) {                                                  // anaglyph 3D
            float r2 = (r * 30 + g * 59 + b * 11) / 100, g2 = (r * 30 + g * 70) / 100, b2 = (r * 30 + b * 70) / 100;
            r = r2; g = g2; b = b2;
        }
        int fx0 = ns.c(cx), fz0 = ns.c(cz);
        float fracX = (float) (cx - fx0), fracZ = (float) (cz - fz0);
        int band = (cy > -5 ? 1 : 0) | (cy <= 5 ? 2 : 0);
        long key = ((long) band << 48) | ((long) Math.round(r * 255) << 32) | ((long) Math.round(g * 255) << 16) | Math.round(b * 255);
        if (lists[pass] < 0 || keys[pass] != key) {
            if (lists[pass] < 0) lists[pass] = GL11.glGenLists(1);
            build(lists[pass], band, r, g, b);
            keys[pass] = key;
        }

        bfl.a(12.0f, 1.0f, 12.0f);                                        // scale
        bfl.b(-fracX, cy, -fracZ);                                        // translate: how far the clouds have drifted
        bfl.n(GL11.GL_TEXTURE);                                           // matrixMode
        bfl.E();                                                          // pushMatrix
        bfl.b(fx0 * T, fz0 * T, 0);                                       // the whole cells, as a texture offset
        bfl.n(GL11.GL_MODELVIEW);
        for (int i = 0; i < 2; i++) {
            if (i == 0) bfl.a(false, false, false, false);                // colorMask: depth only
            else if (pass == 0) bfl.a(false, true, true, true);
            else if (pass == 1) bfl.a(true, false, false, true);
            else bfl.a(true, true, true, true);
            GL11.glCallList(lists[pass]);
        }
        bfl.n(GL11.GL_TEXTURE);
        bfl.F();                                                          // popMatrix
        bfl.n(GL11.GL_MODELVIEW);
        bfl.c(1.0f, 1.0f, 1.0f, 1.0f);                                    // color
        bfl.k();                                                          // disableBlend
        bfl.o();                                                          // enableCull
        return true;
    }

    /** The 8x8 cloud tiles exactly as vanilla makes them, with the drift and the cloud height left out. */
    private static void build(int list, int band, float r, float g, float b) {
        float r9 = r * 0.9f, g9 = g * 0.9f, b9 = b * 0.9f;
        float r7 = r * 0.7f, g7 = g * 0.7f, b7 = b * 0.7f;
        float r8 = r * 0.8f, g8 = g * 0.8f, b8 = b * 0.8f;
        bfx tess = bfx.a();
        bfd w = tess.c();
        GL11.glNewList(list, GL11.GL_COMPILE);
        w.a(7, bms.l);                                                    // begin(QUADS, POSITION_TEX_COLOR_NORMAL)
        for (int j = -3; j <= 4; j++) {
            for (int k = -3; k <= 4; k++) {
                float x = j * 8, z = k * 8;
                if ((band & 1) != 0) {                                    // underside
                    v(w, x, 0, z + 8, x, z + 8, r7, g7, b7, 0, -1, 0);
                    v(w, x + 8, 0, z + 8, x + 8, z + 8, r7, g7, b7, 0, -1, 0);
                    v(w, x + 8, 0, z, x + 8, z, r7, g7, b7, 0, -1, 0);
                    v(w, x, 0, z, x, z, r7, g7, b7, 0, -1, 0);
                }
                if ((band & 2) != 0) {                                    // top
                    v(w, x, 4 - E, z + 8, x, z + 8, r, g, b, 0, 1, 0);
                    v(w, x + 8, 4 - E, z + 8, x + 8, z + 8, r, g, b, 0, 1, 0);
                    v(w, x + 8, 4 - E, z, x + 8, z, r, g, b, 0, 1, 0);
                    v(w, x, 4 - E, z, x, z, r, g, b, 0, 1, 0);
                }
                if (j > -1) {
                    for (int i = 0; i < 8; i++) {
                        v(w, x + i, 0, z + 8, x + i + 0.5f, z + 8, r9, g9, b9, -1, 0, 0);
                        v(w, x + i, 4, z + 8, x + i + 0.5f, z + 8, r9, g9, b9, -1, 0, 0);
                        v(w, x + i, 4, z, x + i + 0.5f, z, r9, g9, b9, -1, 0, 0);
                        v(w, x + i, 0, z, x + i + 0.5f, z, r9, g9, b9, -1, 0, 0);
                    }
                }
                if (j <= 1) {
                    for (int i = 0; i < 8; i++) {
                        v(w, x + i + 1 - E, 0, z + 8, x + i + 0.5f, z + 8, r9, g9, b9, 1, 0, 0);
                        v(w, x + i + 1 - E, 4, z + 8, x + i + 0.5f, z + 8, r9, g9, b9, 1, 0, 0);
                        v(w, x + i + 1 - E, 4, z, x + i + 0.5f, z, r9, g9, b9, 1, 0, 0);
                        v(w, x + i + 1 - E, 0, z, x + i + 0.5f, z, r9, g9, b9, 1, 0, 0);
                    }
                }
                if (k > -1) {
                    for (int i = 0; i < 8; i++) {
                        v(w, x, 4, z + i, x, z + i + 0.5f, r8, g8, b8, 0, 0, -1);
                        v(w, x + 8, 4, z + i, x + 8, z + i + 0.5f, r8, g8, b8, 0, 0, -1);
                        v(w, x + 8, 0, z + i, x + 8, z + i + 0.5f, r8, g8, b8, 0, 0, -1);
                        v(w, x, 0, z + i, x, z + i + 0.5f, r8, g8, b8, 0, 0, -1);
                    }
                }
                if (k <= 1) {
                    for (int i = 0; i < 8; i++) {
                        v(w, x, 4, z + i + 1 - E, x, z + i + 0.5f, r8, g8, b8, 0, 0, 1);
                        v(w, x + 8, 4, z + i + 1 - E, x + 8, z + i + 0.5f, r8, g8, b8, 0, 0, 1);
                        v(w, x + 8, 0, z + i + 1 - E, x + 8, z + i + 0.5f, r8, g8, b8, 0, 0, 1);
                        v(w, x, 0, z + i + 1 - E, x, z + i + 0.5f, r8, g8, b8, 0, 0, 1);
                    }
                }
            }
        }
        tess.b();                                                         // draw (recorded into the list)
        GL11.glEndList();
    }

    /** One vertex: position, texture (in cloud texels), colour with vanilla's 0.8 alpha, normal. */
    private static void v(bfd w, float x, float y, float z, float u, float tv, float r, float g, float b, float nx, float ny, float nz) {
        w.b((double) x, (double) y, (double) z).a((double) (u * T), (double) (tv * T)).a(r, g, b, 0.8f).c(nx, ny, nz).d(); // pos, tex, color, normal, endVertex
    }
}
