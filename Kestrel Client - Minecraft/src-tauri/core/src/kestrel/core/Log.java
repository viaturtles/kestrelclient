package kestrel.core;

/** Lines start with [Kestrel] so Launch Control can pick them out of the game log. */
final class Log {
    static void info(String s) {
        System.out.println("[Kestrel] " + s);
    }

    static void error(String what, Throwable t) {
        System.out.println("[Kestrel] " + what + " failed: " + t);
        t.printStackTrace(System.out);
    }
}
