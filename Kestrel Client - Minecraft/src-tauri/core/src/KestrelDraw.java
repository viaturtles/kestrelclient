import java.nio.ByteBuffer;
import java.util.List;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL15;
import org.lwjgl.opengl.GLContext;

/**
 * WorldVertexBufferUploader.draw (bfe.a) through one streaming vertex buffer.
 * Vanilla draws the Tessellator's vertices straight from main memory, so the driver has to copy
 * and synchronise on every small draw (entity shadows, name tag backgrounds, held items, sky,
 * particles...). Here each draw is appended to a 4 MB GPU buffer and the buffer is orphaned
 * when it fills up, so the CPU never waits. Same vertex formats, states and order as vanilla.
 *
 *   bfd WorldRenderer   bmu VertexFormat   bmv VertexFormatElement   bqs OpenGlHelper   bfl GlStateManager
 */
public final class KestrelDraw {
    private static final int CAPACITY = 4 << 20;
    private static int vbo = -1, offset;
    private static boolean checked, supported;

    /** True when drawn here; false means vanilla should draw it (too big, or no GL 1.5). */
    static boolean draw(bfd wr) {
        if (!checked) {
            checked = true;
            supported = GLContext.getCapabilities().OpenGL15;
        }
        int count = wr.h();                                               // getVertexCount
        if (count <= 0) { wr.b(); return true; }                          // reset
        bmu format = wr.g();                                              // getVertexFormat
        int stride = format.g();                                          // getNextOffset
        int bytes = count * stride;
        if (!supported || bytes > CAPACITY) return false;
        ByteBuffer data = wr.f();                                         // getByteBuffer
        if (vbo < 0) {
            vbo = GL15.glGenBuffers();
            GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, vbo);
            GL15.glBufferData(GL15.GL_ARRAY_BUFFER, CAPACITY, GL15.GL_STREAM_DRAW);
        } else {
            GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, vbo);
        }
        if (offset + bytes > CAPACITY) {
            GL15.glBufferData(GL15.GL_ARRAY_BUFFER, CAPACITY, GL15.GL_STREAM_DRAW); // orphan: fresh memory, no wait
            offset = 0;
        }
        int oldLimit = data.limit();
        data.position(0).limit(bytes);
        GL15.glBufferSubData(GL15.GL_ARRAY_BUFFER, offset, data);
        data.limit(oldLimit).position(0);

        List<bmv> elements = format.h();                                  // getElements
        for (int i = 0; i < elements.size(); i++) {
            bmv e = elements.get(i);
            int type = e.a().c(), index = e.d();                          // getType().getGlConstant(), getIndex()
            long at = offset + format.d(i);                               // getOffset(i)
            switch (e.b()) {                                              // getUsage()
                case a:                                                   // POSITION
                    GL11.glVertexPointer(e.c(), type, stride, at);
                    GL11.glEnableClientState(GL11.GL_VERTEX_ARRAY);
                    break;
                case d:                                                   // UV
                    bqs.l(bqs.q + index);                                 // setClientActiveTexture
                    GL11.glTexCoordPointer(e.c(), type, stride, at);
                    GL11.glEnableClientState(GL11.GL_TEXTURE_COORD_ARRAY);
                    bqs.l(bqs.q);
                    break;
                case c:                                                   // COLOR
                    GL11.glColorPointer(e.c(), type, stride, at);
                    GL11.glEnableClientState(GL11.GL_COLOR_ARRAY);
                    break;
                case b:                                                   // NORMAL
                    GL11.glNormalPointer(type, stride, at);
                    GL11.glEnableClientState(GL11.GL_NORMAL_ARRAY);
                    break;
                default:
                    break;
            }
        }
        GL11.glDrawArrays(wr.i(), 0, count);                              // getDrawMode
        for (int i = 0; i < elements.size(); i++) {
            bmv e = elements.get(i);
            switch (e.b()) {
                case a: GL11.glDisableClientState(GL11.GL_VERTEX_ARRAY); break;
                case d:
                    bqs.l(bqs.q + e.d());
                    GL11.glDisableClientState(GL11.GL_TEXTURE_COORD_ARRAY);
                    bqs.l(bqs.q);
                    break;
                case c: GL11.glDisableClientState(GL11.GL_COLOR_ARRAY); bfl.G(); break; // resetColor
                case b: GL11.glDisableClientState(GL11.GL_NORMAL_ARRAY); break;
                default: break;
            }
        }
        GL15.glBindBuffer(GL15.GL_ARRAY_BUFFER, 0);
        offset += (bytes + 63) & ~63;
        wr.b();                                                           // reset
        return true;
    }
}
