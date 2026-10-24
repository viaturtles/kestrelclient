import java.util.IdentityHashMap;

/**
 * Entity and block-entity culling: skips drawing mobs, items, chests, signs, skulls... that are
 * completely hidden behind solid blocks (vanilla 1.8.9 draws them anyway).
 *
 * It only skips something when no straight line from the camera reaches any point on its box
 * through non-solid blocks. Things that come back into view are checked every frame, so nothing
 * pops in late; things already visible are re-checked every 50 ms.
 * Never culled: players and anything with a custom name (their name tags show through walls in
 * vanilla), and the camera's own entity.
 *
 *   pk Entity   wn EntityPlayer   akw TileEntity   aug AxisAlignedBB   amy Chunk   afh Block
 */
public final class KestrelCull {
    private static final long VISIBLE_NANOS = 50_000_000L;
    private static final IdentityHashMap<Object, long[]> visibleUntil = new IdentityHashMap<Object, long[]>();
    private static long lastClear;
    private static double cx, cy, cz;
    private static adm world;
    private static amy chunk;
    private static int chunkX = Integer.MIN_VALUE, chunkZ;

    static boolean hideEntity(Object o) {
        pk e = (pk) o;
        if (e instanceof wn || e.l_()) return false;                      // players; hasCustomName
        ave mc = ave.A();
        if (e == mc.ac()) return false;                                   // getRenderViewEntity
        aug b = e.aR();                                                   // getEntityBoundingBox
        return hidden(o, b.a - 0.05, b.b - 0.05, b.c - 0.05, b.d + 0.05, b.e + 0.05, b.f + 0.05);
    }

    static boolean hideTile(Object o) {
        cj p = ((akw) o).v();                                             // TileEntity.getPos
        // Half a block of margin: double chests, banners and signs reach past their own block.
        return hidden(o, p.n() - 0.5, p.o() - 0.5, p.p() - 0.5, p.n() + 1.5, p.o() + 1.5, p.p() + 1.5);
    }

    private static boolean hidden(Object key, double x0, double y0, double z0, double x1, double y1, double z1) {
        long now = System.nanoTime();
        if (now - lastClear > 5_000_000_000L) { visibleUntil.clear(); lastClear = now; }
        long[] until = visibleUntil.get(key);
        if (until != null && until[0] > now) return false;
        ave mc = ave.A();
        if (mc.f != world) { world = mc.f; chunkX = Integer.MIN_VALUE; } // theWorld
        if (world == null) return false;
        biu rm = mc.af();                                                 // getRenderManager
        aui eye = auz.a();                                                // ActiveRenderInfo.getPosition: camera offset
        cx = rm.h + eye.a; cy = rm.i + eye.b; cz = rm.j + eye.c;          // viewerPos + offset
        if (cx > x0 - 1 && cx < x1 + 1 && cy > y0 - 1 && cy < y1 + 1 && cz > z0 - 1 && cz < z1 + 1) return remember(key, until, now);
        // Points on the box's surface, at most a block apart.
        int nx = steps(x1 - x0), ny = steps(y1 - y0), nz = steps(z1 - z0);
        for (int i = 0; i < nx; i++) {
            double x = x0 + (x1 - x0) * i / (nx - 1);
            for (int j = 0; j < ny; j++) {
                double y = y0 + (y1 - y0) * j / (ny - 1);
                for (int k = 0; k < nz; k++) {
                    boolean surface = i == 0 || i == nx - 1 || j == 0 || j == ny - 1 || k == 0 || k == nz - 1;
                    if (surface && clear(x, y, z0 + (z1 - z0) * k / (nz - 1))) return remember(key, until, now);
                }
            }
        }
        return true;
    }

    private static int steps(double len) {
        return Math.max(2, Math.min(4, (int) Math.ceil(len) + 1));
    }

    private static boolean remember(Object key, long[] until, long now) {
        if (until == null) visibleUntil.put(key, until = new long[1]);
        until[0] = now + VISIBLE_NANOS;
        return false;
    }

    /** True when the straight line from the camera to (px, py, pz) passes no solid block. */
    private static boolean clear(double px, double py, double pz) {
        double dx = px - cx, dy = py - cy, dz = pz - cz;
        int x = floor(cx), y = floor(cy), z = floor(cz);
        int tx = floor(px), ty = floor(py), tz = floor(pz);
        int sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        double ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        double mx = ax == 0 ? Double.MAX_VALUE : (dx > 0 ? x + 1 - cx : cx - x) / ax;
        double my = ay == 0 ? Double.MAX_VALUE : (dy > 0 ? y + 1 - cy : cy - y) / ay;
        double mz = az == 0 ? Double.MAX_VALUE : (dz > 0 ? z + 1 - cz : cz - z) / az;
        double ddx = ax == 0 ? Double.MAX_VALUE : 1 / ax, ddy = ay == 0 ? Double.MAX_VALUE : 1 / ay, ddz = az == 0 ? Double.MAX_VALUE : 1 / az;
        for (int guard = 0; guard < 600; guard++) {
            if (x == tx && y == ty && z == tz) return true;
            if (mx < my && mx < mz) { if (mx > 1) return true; x += sx; mx += ddx; }
            else if (my < mz) { if (my > 1) return true; y += sy; my += ddy; }
            else { if (mz > 1) return true; z += sz; mz += ddz; }
            if (x == tx && y == ty && z == tz) return true;           // the target's own block doesn't block
            if (solid(x, y, z)) return false;
        }
        return true;
    }

    private static boolean solid(int x, int y, int z) {
        if (y < 0 || y > 255) return false;
        int ccx = x >> 4, ccz = z >> 4;
        if (ccx != chunkX || ccz != chunkZ || chunk == null) {
            chunk = world.a(ccx, ccz);                                    // getChunkFromChunkCoords
            chunkX = ccx;
            chunkZ = ccz;
        }
        return chunk.a(x, y, z).c();                                      // getBlock(x, y, z).isOpaqueCube()
    }

    private static int floor(double v) {
        int i = (int) v;
        return v < i ? i - 1 : i;
    }
}
