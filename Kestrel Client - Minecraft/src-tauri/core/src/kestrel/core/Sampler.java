package kestrel.core;

import java.io.File;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bench-only sampling profiler: where the game's main thread spends its time (obfuscated names). */
final class Sampler {
    private static volatile boolean running;
    private static final Map<String, int[]> self = new HashMap<String, int[]>(), total = new HashMap<String, int[]>();
    private static int samples;

    static void start(final Thread target) {
        if (running) return;
        running = true;
        Thread t = new Thread(new Runnable() {
            public void run() {
                while (running) {
                    StackTraceElement[] st = target.getStackTrace();
                    if (st.length > 0) {
                        samples++;
                        // Self time keyed with its callers, so overloaded obfuscated methods can be told apart.
                        String k = name(st[0]);
                        for (int i = 1; i < Math.min(st.length, 4); i++) k += " < " + name(st[i]);
                        bump(self, k);
                        Set<String> seen = new HashSet<String>();
                        for (StackTraceElement e : st) if (seen.add(name(e))) bump(total, name(e));
                    }
                    try { Thread.sleep(1); } catch (InterruptedException e) { return; }
                }
            }
        }, "Kestrel sampler");
        t.setDaemon(true);
        t.start();
    }

    private static String name(StackTraceElement e) {
        return e.getClassName() + "." + e.getMethodName() + (e.getLineNumber() > 0 ? ":" + e.getLineNumber() : "");
    }

    private static void bump(Map<String, int[]> m, String k) {
        int[] c = m.get(k);
        if (c == null) m.put(k, new int[]{1});
        else c[0]++;
    }

    static void stop(String file) {
        running = false;
        try (FileWriter w = new FileWriter(new File(file))) {
            w.write("samples " + samples + "\n\n== self (top of stack) ==\n");
            write(w, self, 60);
            w.write("\n== total (anywhere in stack) ==\n");
            write(w, total, 120);
        } catch (Exception e) {
            Log.error("profile write", e);
        }
    }

    private static void write(FileWriter w, Map<String, int[]> m, int max) throws Exception {
        List<Map.Entry<String, int[]>> list = new ArrayList<Map.Entry<String, int[]>>(m.entrySet());
        Collections.sort(list, (a, b) -> b.getValue()[0] - a.getValue()[0]);
        for (int i = 0; i < Math.min(max, list.size()); i++) {
            w.write(String.format(java.util.Locale.ROOT, "%6.2f%%  %s%n", 100.0 * list.get(i).getValue()[0] / samples, list.get(i).getKey()));
        }
    }
}
