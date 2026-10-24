package kestrel.core;

import java.lang.instrument.Instrumentation;

/**
 * Kestrel Core: the in-game part of Kestrel, added by the launcher to every 1.8.9 launch with
 * -javaagent:kestrel-core.jar. Works the same with and without OptiFine (LaunchWrapper).
 */
public final class Agent {
    public static final String VERSION = "0.1.0";

    public static void premain(String args, Instrumentation inst) {
        Log.info("Kestrel Core " + VERSION + " starting");
        inst.addTransformer(new Patcher());
    }
}
