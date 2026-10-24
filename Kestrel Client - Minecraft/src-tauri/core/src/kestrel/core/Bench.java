package kestrel.core;

import java.io.File;
import java.io.FileWriter;
import java.util.Arrays;

/**
 * Repeatable FPS benchmark, only active with -Dkestrel.bench=<result.json>.
 * Creates/opens a fixed-seed creative world, fixes time and weather, lets chunks load,
 * then turns the camera a full circle while recording every frame. Writes the result and quits.
 */
final class Bench {
    static final String OUT = System.getProperty("kestrel.bench");
    static final String PROFILE = System.getProperty("kestrel.profile");
    private static final long WARMUP = 25_000, MEASURE = 40_000;
    private static final int SEED = 4417;
    private static boolean started, commands, shot, fixedShot;
    private static long joined, last;
    private static final long[] frames = new long[200_000];
    private static int count;

    static void menu(Bridge b) {
        if (OUT == null || started) return;
        started = true;
        Log.info("bench: opening the bench world");
        b.createWorld("kestrel-bench", SEED);
    }

    static void hud(Bridge b) {
        if (OUT == null) return;
        long now = System.nanoTime();
        if (joined == 0) joined = now;
        long t = (now - joined) / 1_000_000;
        if (!commands && t > 2000) {
            commands = true;
            for (String c : new String[]{"/gamerule doDaylightCycle false", "/gamerule doMobSpawning false", "/time set 6000", "/weather clear 1000000", "/kill @e[type=!Player]"}) b.chat(c);
            if ("lobby".equals(SCENE) || "town".equals(SCENE)) queue = lobby();
            if ("town".equals(SCENE)) {
                // A stone room around the player with one doorway: most of the lobby is behind walls.
                queue.add("/fill ~-6 ~-1 ~-6 ~6 ~5 ~6 stone 0 hollow");
                queue.add("/fill ~-1 ~ ~6 ~1 ~2 ~6 air");
            }
        }
        // A few commands per frame so the chat doesn't drop any.
        for (int i = 0; i < 3 && queue != null && qi < queue.size() && t > 3000; i++) b.chat(queue.get(qi++));
        if (t < WARMUP) {
            b.look(0, 8);
            // Same moment and view every run, to compare pictures against vanilla.
            if (!fixedShot && t > WARMUP - 1500) { fixedShot = true; Test.shot(b, OUT.replace(".json", "-fixed")); }
            // A/B in one run: a frame with culling off, then the next frame with it on (same scene, same moment).
            if (fixedShot && ab < 3 && AB != null) {
                if (ab == 0) { Hooks.culling &= !AB.equals("culling"); }
                else if (ab == 1) { Test.shot(b, OUT.replace(".json", "-A")); Perf.apply(b); }
                else Test.shot(b, OUT.replace(".json", "-B"));
                ab++;
            }
            last = now;
            return;
        }
        long m = t - WARMUP;
        if (m <= MEASURE) {
            if (PROFILE != null) Sampler.start(Thread.currentThread());
            if (!shot && m > MEASURE / 8) { shot = true; Test.shot(b, OUT.replace(".json", "")); }
            b.look(360f * m / MEASURE, 8);
            if (count < frames.length) frames[count++] = now - last;
            last = now;
            return;
        }
        if (count > 0) finish(b);
    }

    static final String SCENE = System.getProperty("kestrel.bench.scene", "plain");
    static final String AB = System.getProperty("kestrel.bench.ab");
    private static int ab;
    private static java.util.List<String> queue;
    private static int qi;

    /** A busy server lobby: name-tagged armor stands in armor, mobs, chests and signs around the player. */
    private static java.util.List<String> lobby() {
        java.util.List<String> c = new java.util.ArrayList<String>();
        java.util.Random r = new java.util.Random(7);
        String[] armor = {"311", "307", "315", "299"}; // chestplates by id (chat commands max 100 characters)
        String[] mobs = {"Villager", "Pig", "Sheep", "Cow", "Chicken", "Wolf"};
        for (int i = 0; i < 160; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = 4 + r.nextDouble() * 22;
            int x = (int) Math.round(Math.cos(a) * d), z = (int) Math.round(Math.sin(a) * d);
            String at = "~" + x + " ~ ~" + z;
            if (i % 2 == 0) {
                c.add("/summon ArmorStand " + at + " {CustomName:P" + i + ",CustomNameVisible:1,Equipment:[{},{},{},{id:" + armor[(i / 2) % 4] + "}]}");
            } else {
                c.add("/summon " + mobs[(i / 2) % mobs.length] + " " + at + " {NoAI:1}");
            }
        }
        for (int i = 0; i < 60; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = 3 + r.nextDouble() * 18;
            int x = (int) Math.round(Math.cos(a) * d), z = (int) Math.round(Math.sin(a) * d);
            c.add(i % 2 == 0 ? "/setblock ~" + x + " ~1 ~" + z + " chest" : "/setblock ~" + x + " ~1 ~" + z + " standing_sign 0 replace {Text1:\"{text:\\\"Kestrel\\\"}\"}");
        }
        return c;
    }

    private static void finish(Bridge b) {
        if (PROFILE != null) Sampler.stop(PROFILE);
        long[] f = Arrays.copyOf(frames, count);
        count = 0;
        long total = 0;
        for (long x : f) total += x;
        Arrays.sort(f);
        int n = f.length;
        double avgMs = total / 1e6 / n;
        // 1% low: average FPS over the slowest 1% of frames.
        int worst = Math.max(1, n / 100);
        long worstTotal = 0;
        for (int i = n - worst; i < n; i++) worstTotal += f[i];
        double low1 = 1000.0 / (worstTotal / 1e6 / worst);
        String json = String.format(java.util.Locale.ROOT,
            "{\"frames\":%d,\"avgFps\":%.1f,\"low1Fps\":%.1f,\"p50Ms\":%.2f,\"p99Ms\":%.2f,\"maxMs\":%.2f}",
            n, 1000.0 / avgMs, low1, f[n / 2] / 1e6, f[(int) (n * 0.99)] / 1e6, f[n - 1] / 1e6);
        Log.info("bench result " + json);
        try (FileWriter w = new FileWriter(new File(OUT))) {
            w.write(json);
        } catch (Exception e) {
            Log.error("bench write", e);
        }
        b.quit();
    }
}
