package kestrel.core;

import java.nio.FloatBuffer;
import java.nio.IntBuffer;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL11;

/**
 * A CPU copy of OpenGL's modelview and projection matrices, kept in step with every matrix call
 * Minecraft makes through GlStateManager (plus gluPerspective). Vanilla reads the camera matrices
 * back from the GPU each frame, which makes the CPU wait for the GPU to finish; with this copy
 * those reads are answered instantly. A real readback every few seconds checks the copy, and any
 * mismatch (another mod changing matrices behind our back) turns the copy off for the session.
 * Matrices are column-major float[16], like OpenGL.
 */
public final class Mat {
    private static final int MODELVIEW = GL11.GL_MODELVIEW, PROJECTION = GL11.GL_PROJECTION;
    private static final float[][] mv = new float[64][16], pr = new float[16][16];
    private static int mvTop, prTop, mode = MODELVIEW;
    private static final int[] viewport = new int[4];
    private static boolean viewportKnown;
    /** Serve readbacks from the copy (Settings > Performance). Tracking always runs. */
    static volatile boolean serve;
    private static boolean broken;
    private static int reads;
    private static final FloatBuffer check = BufferUtils.createFloatBuffer(16);
    private static final float[] tmp = new float[16], scratch = new float[16];

    /** A zeroed scratch matrix (render thread only). */
    private static float[] op() {
        java.util.Arrays.fill(scratch, 0);
        return scratch;
    }

    static {
        identity(mv[0]);
        identity(pr[0]);
    }

    private static float[] cur() {
        if (mode == MODELVIEW) return mv[mvTop];
        if (mode == PROJECTION) return pr[prTop];
        return null; // texture/color matrices aren't tracked
    }

    private static void identity(float[] m) {
        for (int i = 0; i < 16; i++) m[i] = (i % 5 == 0) ? 1 : 0;
    }

    /** m = m * b */
    private static void mul(float[] m, float[] b) {
        for (int c = 0; c < 4; c++) {
            float b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
            for (int r = 0; r < 4; r++) tmp[c * 4 + r] = m[r] * b0 + m[4 + r] * b1 + m[8 + r] * b2 + m[12 + r] * b3;
        }
        System.arraycopy(tmp, 0, m, 0, 16);
    }

    // ---- called at the start of GlStateManager's matrix methods ----

    public static void matrixMode(int m) { mode = m; }

    public static void loadIdentity() { float[] m = cur(); if (m != null) identity(m); }

    public static void pushMatrix() {
        if (mode == MODELVIEW && mvTop < mv.length - 1) { System.arraycopy(mv[mvTop], 0, mv[mvTop + 1], 0, 16); mvTop++; }
        else if (mode == PROJECTION && prTop < pr.length - 1) { System.arraycopy(pr[prTop], 0, pr[prTop + 1], 0, 16); prTop++; }
    }

    public static void popMatrix() {
        if (mode == MODELVIEW && mvTop > 0) mvTop--;
        else if (mode == PROJECTION && prTop > 0) prTop--;
    }

    public static void translate(float x, float y, float z) {
        float[] m = cur();
        if (m == null) return;
        for (int r = 0; r < 4; r++) m[12 + r] += m[r] * x + m[4 + r] * y + m[8 + r] * z;
    }

    public static void translate(double x, double y, double z) { translate((float) x, (float) y, (float) z); }

    public static void scale(float x, float y, float z) {
        float[] m = cur();
        if (m == null) return;
        for (int r = 0; r < 4; r++) { m[r] *= x; m[4 + r] *= y; m[8 + r] *= z; }
    }

    public static void scale(double x, double y, double z) { scale((float) x, (float) y, (float) z); }

    public static void rotate(float angle, float x, float y, float z) {
        float[] m = cur();
        if (m == null) return;
        float len = (float) Math.sqrt(x * x + y * y + z * z);
        if (len == 0) return;
        x /= len; y /= len; z /= len;
        double a = Math.toRadians(angle);
        float c = (float) Math.cos(a), s = (float) Math.sin(a), t = 1 - c;
        float[] r = op();
        r[0] = x * x * t + c;     r[4] = x * y * t - z * s; r[8] = x * z * t + y * s;
        r[1] = y * x * t + z * s; r[5] = y * y * t + c;     r[9] = y * z * t - x * s;
        r[2] = x * z * t - y * s; r[6] = y * z * t + x * s; r[10] = z * z * t + c;
        r[15] = 1;
        mul(m, r);
    }

    public static void multMatrix(FloatBuffer b) {
        float[] m = cur();
        if (m == null) return;
        float[] o = op();
        int p = b.position();
        for (int i = 0; i < 16; i++) o[i] = b.get(p + i);
        mul(m, o);
    }

    public static void ortho(double l, double r, double b, double t, double n, double f) {
        float[] m = cur();
        if (m == null) return;
        float[] o = op();
        o[0] = (float) (2 / (r - l));
        o[5] = (float) (2 / (t - b));
        o[10] = (float) (-2 / (f - n));
        o[12] = (float) (-(r + l) / (r - l));
        o[13] = (float) (-(t + b) / (t - b));
        o[14] = (float) (-(f + n) / (f - n));
        o[15] = 1;
        mul(m, o);
    }

    /** Same maths as org.lwjgl.util.glu.Project.gluPerspective. */
    public static void perspective(float fovy, float aspect, float near, float far) {
        float[] m = cur();
        if (m == null) return;
        double rad = Math.toRadians(fovy / 2);
        float dz = far - near, sin = (float) Math.sin(rad);
        if (dz == 0 || sin == 0 || aspect == 0) return;
        float cot = (float) Math.cos(rad) / sin;
        float[] o = op();
        o[0] = cot / aspect;
        o[5] = cot;
        o[10] = -(far + near) / dz;
        o[11] = -1;
        o[14] = -2 * near * far / dz;
        mul(m, o);
    }

    public static void viewport(int x, int y, int w, int h) {
        viewport[0] = x; viewport[1] = y; viewport[2] = w; viewport[3] = h;
        viewportKnown = true;
    }

    // ---- readbacks ----

    /** GlStateManager.getFloat: true when answered from the copy (the GPU isn't asked). */
    public static boolean getFloat(int name, FloatBuffer out) {
        if (!serve || broken || (name != GL11.GL_MODELVIEW_MATRIX && name != GL11.GL_PROJECTION_MATRIX)) return false;
        float[] m = name == GL11.GL_MODELVIEW_MATRIX ? mv[mvTop] : pr[prTop];
        if (++reads % 2000 == 1 && !matches(name, m)) return false;
        int p = out.position();
        for (int i = 0; i < 16; i++) out.put(p + i, m[i]);
        return true;
    }

    /** Replaces GL11.glGetInteger in ActiveRenderInfo (the viewport). */
    public static void glGetInteger(int name, IntBuffer out) {
        if (serve && !broken && viewportKnown && name == GL11.GL_VIEWPORT) {
            int p = out.position();
            for (int i = 0; i < 4; i++) out.put(p + i, viewport[i]);
            return;
        }
        GL11.glGetInteger(name, out);
    }

    private static boolean matches(int name, float[] m) {
        check.clear();
        GL11.glGetFloat(name, check);
        for (int i = 0; i < 16; i++) {
            float a = check.get(i), d = Math.abs(a - m[i]);
            if (d > 1e-3f && d > Math.abs(a) * 1e-3f) {
                broken = true;
                Log.info("matrix copy out of step (another mod changes matrices directly); using the GPU's again");
                return false;
            }
        }
        return true;
    }
}
