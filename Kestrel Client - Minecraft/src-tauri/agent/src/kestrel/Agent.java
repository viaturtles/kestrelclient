package kestrel;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Kestrel quick play for Minecraft 1.8.9: opens a singleplayer world as soon as the
 * title screen appears. Loaded with -javaagent:kestrel-agent.jar=<base64 world folder>.
 *
 * 1.8.9 (obfuscated) names, checked against the official client jar:
 *   ave        = Minecraft         ave.A()             = getMinecraft()
 *   ave.m      = currentScreen     aya                 = GuiMainMenu
 *   ave.a(Runnable)                = addScheduledTask
 *   ave.a(String, String, adp)     = launchIntegratedServer(folder, name, settings)
 */
public final class Agent {
    public static void premain(String args) {
        if (args == null || args.isEmpty()) return;
        final String folder;
        try {
            folder = new String(Base64.getDecoder().decode(args), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            log("bad world argument");
            return;
        }
        Thread t = new Thread(() -> run(folder), "Kestrel-QuickPlay");
        t.setDaemon(true);
        t.start();
    }

    private static void run(String folder) {
        long deadline = System.currentTimeMillis() + 5 * 60_000L;
        while (System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(250);
                ClassLoader loader = gameLoader();
                if (loader == null) continue;
                Class<?> mc = Class.forName("ave", false, loader);
                Object game = mc.getMethod("A").invoke(null);
                if (game == null) continue;
                Field screenField = mc.getField("m");
                Object screen = screenField.get(game);
                if (screen == null || !screen.getClass().getName().equals("aya")) continue;
                Class<?> settings = Class.forName("adp", false, loader);
                Method launch = mc.getMethod("a", String.class, String.class, settings);
                Method schedule = mc.getMethod("a", Runnable.class);
                schedule.invoke(game, (Runnable) () -> {
                    try {
                        launch.invoke(game, folder, folder, null);
                    } catch (Throwable e) {
                        log("could not open world: " + e);
                    }
                });
                log("opening world " + folder);
                return;
            } catch (ClassNotFoundException e) {
                // Game classes aren't loaded yet.
            } catch (Throwable e) {
                log("quick play stopped: " + e);
                return;
            }
        }
        log("title screen never appeared; world not opened");
    }

    /** The class loader Minecraft runs in (LaunchWrapper's when OptiFine is used). */
    private static ClassLoader gameLoader() {
        try {
            Class<?> launch = Class.forName("net.minecraft.launchwrapper.Launch");
            return (ClassLoader) launch.getField("classLoader").get(null); // null until LaunchWrapper starts
        } catch (ClassNotFoundException e) {
            return ClassLoader.getSystemClassLoader(); // vanilla
        } catch (Throwable e) {
            return null;
        }
    }

    private static void log(String s) {
        System.out.println("[Kestrel] " + s);
    }
}
