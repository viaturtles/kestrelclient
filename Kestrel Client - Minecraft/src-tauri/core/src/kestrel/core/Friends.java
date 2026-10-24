package kestrel.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * Your Kestrel friends. The launcher writes <game folder>/kestrel/friends.properties at launch and every
 * 30 seconds while you play (friend.N.name / uuid / status playing|launcher|offline / server / seen,
 * count, incoming). Friend requests are accepted in the launcher.
 */
final class Friends {
    static final class Friend {
        final String name, uuid, status, server;
        final long seen;
        Friend(String name, String uuid, String status, String server, long seen) { this.name = name; this.uuid = uuid; this.status = status; this.server = server; this.seen = seen; }
        boolean playing() { return status.equals("playing"); }
        boolean online() { return !status.equals("offline"); }
    }

    private static List<Friend> list = new ArrayList<Friend>();
    private static int incoming;
    private static long modified = -1, checked;
    private static boolean present;

    /** Re-reads the file when the launcher changed it (checked at most once a second). */
    private static void ensure(Bridge b) {
        long now = System.currentTimeMillis();
        if (now - checked < 1000) return;
        checked = now;
        File f = new File(b.gameDir(), "kestrel/friends.properties");
        present = f.isFile();
        if (!present || f.lastModified() == modified) return;
        modified = f.lastModified();
        try {
            Properties p = new Properties();
            InputStream in = new FileInputStream(f);
            try { p.load(in); } finally { in.close(); }
            List<Friend> out = new ArrayList<Friend>();
            int n = num(p, "count");
            for (int i = 0; i < n; i++) {
                String k = "friend." + i + ".";
                out.add(new Friend(p.getProperty(k + "name", "?"), p.getProperty(k + "uuid", ""), p.getProperty(k + "status", "offline"),
                        p.getProperty(k + "server", "").trim(), seen(p, k + "seen")));
            }
            java.util.Collections.sort(out, new java.util.Comparator<Friend>() {
                public int compare(Friend a, Friend c) {
                    int ra = a.playing() ? 0 : a.online() ? 1 : 2, rc = c.playing() ? 0 : c.online() ? 1 : 2;
                    return ra != rc ? ra - rc : Long.compare(c.seen, a.seen);
                }
            });
            list = out;
            incoming = num(p, "incoming");
        } catch (Exception e) {
            Log.error("friends", e);
        }
    }

    /** Friends playing first, then in the launcher, then offline (most recently seen first). */
    static List<Friend> list(Bridge b) { ensure(b); return list; }
    static int incoming(Bridge b) { ensure(b); return incoming; }
    /** False when the launcher wrote no friends file (no Discord linked, or an older launcher). */
    static boolean available(Bridge b) { ensure(b); return present; }

    static String status(Friend f) {
        if (f.playing()) return f.server.isEmpty() ? "Playing Minecraft" : "Playing on " + f.server;
        if (f.online()) return "In the Kestrel launcher";
        if (f.seen <= 0) return "Offline";
        long m = (System.currentTimeMillis() / 1000 - f.seen) / 60;
        return "Offline  ·  seen " + (m < 60 ? Math.max(1, m) + "m ago" : m < 1440 ? m / 60 + "h ago" : m / 1440 + "d ago");
    }

    private static int num(Properties p, String key) { return (int) seen(p, key); }
    private static long seen(Properties p, String key) {
        try { return Long.parseLong(p.getProperty(key, "0").trim()); } catch (NumberFormatException e) { return 0; }
    }
}
