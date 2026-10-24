package kestrel.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;

/**
 * Other Kestrel players around you. Players you see (and everyone in Tab) are looked up in batches on
 * Kestrel's service (GET /v1/players/kestrel, public, no account needed); Kestrel players get the bird in
 * Tab and their Kestrel cape on their back. The service address comes from kestrel/service.properties,
 * written by the launcher. All network work happens on one background thread.
 */
final class Others {
    private static final class Look { String capeId, capeUrl; int frames = 1, fps; }
    private static final class Art { BufferedImage img; Object[] textures; int frames, fps; }

    private static final long RECHECK = 5 * 60_000;
    private static final Map<UUID, Long> asked = new HashMap<UUID, Long>();
    private static final List<UUID> queue = new ArrayList<UUID>();
    private static final Map<UUID, Look> looks = new HashMap<UUID, Look>();
    private static final Map<String, Art> art = new HashMap<String, Art>();
    private static String service;
    private static Thread worker;
    private static boolean off;

    /** Look this player up soon (cheap to call every frame). */
    static void want(Bridge b, UUID id) {
        if (id == null || off) return;
        synchronized (Others.class) {
            Long t = asked.get(id);
            long now = System.currentTimeMillis();
            if (t != null && now - t < RECHECK) return;
            asked.put(id, now);
            queue.add(id);
            if (worker == null) start(b);
        }
    }

    /** This player's Kestrel cape texture, or null (unknown, not a Kestrel player, no cape, still loading). Render thread. */
    static Object cape(Bridge b, UUID id) {
        want(b, id);
        Art a;
        synchronized (Others.class) {
            Look l = looks.get(id);
            if (l == null || l.capeId == null) return null;
            a = art.get(l.capeId);
            if (a == null) {
                a = new Art();
                a.frames = l.frames;
                a.fps = l.fps;
                art.put(l.capeId, a);
                queueArt(l.capeId, l.capeUrl);
                return null;
            }
            if (a.textures == null && a.img != null) {
                // Upload on the render thread, one 2:1 texture per frame.
                int fw = a.img.getWidth(), fh = fw / 2, n = Math.max(1, Math.min(a.img.getHeight() / Math.max(1, fh), a.frames));
                Object[] out = new Object[n];
                for (int i = 0; i < n; i++) {
                    BufferedImage frame = new BufferedImage(fw, fh, BufferedImage.TYPE_INT_ARGB);
                    frame.getGraphics().drawImage(a.img.getSubimage(0, i * fh, fw, fh), 0, 0, null);
                    out[i] = b.texture("kestrel_other_" + l.capeId + "_" + i, frame);
                }
                a.textures = out;
                a.img = null;
            }
        }
        if (a.textures == null || a.textures.length == 0) return null;
        if (a.textures.length == 1 || a.fps <= 0) return a.textures[0];
        return a.textures[(int) ((System.currentTimeMillis() * a.fps / 1000) % a.textures.length)];
    }

    private static final List<String[]> artQueue = new ArrayList<String[]>();
    private static void queueArt(String id, String url) { artQueue.add(new String[]{id, url}); Others.class.notifyAll(); }

    private static void start(final Bridge b) {
        service = serviceUrl(b);
        if (service == null) { off = true; return; }
        worker = new Thread(new Runnable() { public void run() { loop(); } }, "Kestrel players");
        worker.setDaemon(true);
        worker.start();
    }

    private static void loop() {
        while (true) {
            try {
                List<UUID> batch = new ArrayList<UUID>();
                String[] job = null;
                synchronized (Others.class) {
                    if (queue.isEmpty() && artQueue.isEmpty()) Others.class.wait(2000);
                    if (!artQueue.isEmpty()) job = artQueue.remove(0);
                    while (!queue.isEmpty() && batch.size() < 100) batch.add(queue.remove(0));
                }
                if (job != null) download(job[0], job[1]);
                if (!batch.isEmpty()) lookup(batch);
                Thread.sleep(500); // batch players that show up together
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                Log.error("kestrel players", t);
                try { Thread.sleep(10_000); } catch (InterruptedException e) { return; }
            }
        }
    }

    private static final Pattern PLAYER = Pattern.compile("\\{\"uuid\":\"([0-9a-f]{32})\",\"cape\":(null|\\{[^}]*\\})\\}");
    private static final Pattern FIELD = Pattern.compile("\"(id|url|frames|fps)\":(\"([^\"]*)\"|[0-9]+)");

    private static void lookup(List<UUID> batch) throws Exception {
        StringBuilder q = new StringBuilder();
        for (UUID id : batch) q.append(q.length() == 0 ? "" : ",").append(id.toString().replace("-", ""));
        String body = get(service + "/v1/players/kestrel?uuids=" + q);
        Matcher m = PLAYER.matcher(body);
        int found = 0;
        while (m.find()) {
            String hex = m.group(1);
            UUID id = new UUID(Long.parseUnsignedLong(hex.substring(0, 16), 16), Long.parseUnsignedLong(hex.substring(16), 16));
            Look l = new Look();
            if (!m.group(2).equals("null")) {
                Matcher f = FIELD.matcher(m.group(2));
                while (f.find()) {
                    String k = f.group(1), v = f.group(3) != null ? f.group(3) : f.group(2);
                    if (k.equals("id")) l.capeId = v;
                    else if (k.equals("url")) l.capeUrl = v.replace("\\/", "/");
                    else if (k.equals("frames")) l.frames = Integer.parseInt(v);
                    else l.fps = Integer.parseInt(v);
                }
                if (l.capeUrl == null || !l.capeId.matches("[a-z0-9-]{1,40}")) l.capeId = null;
            }
            synchronized (Others.class) { looks.put(id, l); }
            TabList.KESTREL.add(id);
            found++;
        }
        if (found > 0) Log.info("kestrel players: " + found + " of " + batch.size() + " looked up");
    }

    private static void download(String id, String url) {
        try {
            // Only Kestrel's own service serves capes.
            if (!url.startsWith(service + "/")) throw new IllegalArgumentException("cape from another site: " + url);
            HttpURLConnection c = open(url);
            InputStream in = c.getInputStream();
            BufferedImage img;
            try { img = ImageIO.read(in); } finally { in.close(); }
            if (img == null || img.getWidth() < 64 || img.getWidth() > 4096 || img.getHeight() > 4096 * 8) throw new IllegalArgumentException("bad cape image");
            synchronized (Others.class) { art.get(id).img = img; }
        } catch (Exception e) {
            Log.error("cape " + id, e);
            synchronized (Others.class) { art.get(id).textures = new Object[0]; }
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestProperty("User-Agent", "KestrelCore");
        if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode() + " from " + url);
        return c;
    }

    private static String get(String url) throws Exception {
        InputStream in = open(url).getInputStream();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) {
                out.write(buf, 0, n);
                if (out.size() > 1 << 20) break;
            }
            return out.toString("UTF-8");
        } finally {
            in.close();
        }
    }

    private static String serviceUrl(Bridge b) {
        try {
            File f = new File(b.gameDir(), "kestrel/service.properties");
            if (!f.isFile()) return null;
            Properties p = new Properties();
            InputStream in = new FileInputStream(f);
            try { p.load(in); } finally { in.close(); }
            String u = p.getProperty("url", "").trim();
            while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
            return u.startsWith("https://") ? u : null;
        } catch (Exception e) {
            Log.error("service url", e);
            return null;
        }
    }
}
