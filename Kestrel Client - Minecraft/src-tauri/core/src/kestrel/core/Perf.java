package kestrel.core;

/**
 * Kestrel's performance fixes. Each one can be switched off in Settings > Performance, and the
 * bench can force a set with -Dkestrel.perf=all|none|name,name.
 */
final class Perf {
    private static final String FORCE = System.getProperty("kestrel.perf");

    static boolean on(String name) {
        if (FORCE != null) return FORCE.equals("all") || FORCE.contains(name);
        return Config.bool("perf." + name, true);
    }

    /** Applied once the game is ready, and again whenever settings change. */
    static void apply(Bridge b) {
        // Fewer GPU waits: vanilla asks the GPU for errors and for the camera matrices every frame,
        // and each question makes the CPU wait until the GPU has finished all its work.
        boolean syncs = on("syncs");
        b.glErrorChecks(!syncs);
        Mat.serve = syncs;
        // Cached clouds: vanilla rebuilds every fancy cloud tile each frame; Kestrel builds them once
        // and only moves them. OptiFine has its own cloud renderer, so not with it.
        Hooks.cachedClouds = on("clouds") && !b.optifine();
        // Culling: vanilla draws mobs, chests, signs... even when they're completely behind walls.
        Hooks.culling = on("culling");
        // Batched text (one draw per string instead of per letter) measured no gain; removed.
        // A cached chunk search (only redoing vanilla's per-frame chunk walk when the camera changes
        // block) was tried and measured slower than vanilla's once the GPU waits were gone; removed.
        // Streaming draws (KestrelDraw) measured no gain once the GPU waits were gone (the wait just
        // moved to the next GL call), so they stay off. Kept for testing: -Dkestrel.perf=stream.
        Hooks.streamDraw = FORCE != null && FORCE.contains("stream") && !b.optifine();
    }
}
