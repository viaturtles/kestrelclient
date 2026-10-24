package kestrel.core;

import java.io.File;
import java.lang.reflect.Method;

/**
 * Runs the install step of an OptiFine jar the player downloaded from optifine.net, without its
 * window: the same optifine.Installer.doInstall(minecraftDir) its Install button calls. The launcher
 * points it at a private folder (not the real .minecraft) and then imports the result.
 *   java -Djava.awt.headless=true -cp "OptiFine.jar;kestrel-core.jar" kestrel.core.OptiFineSetup <dir>
 */
public final class OptiFineSetup {
    public static void main(String[] args) throws Exception {
        File dir = new File(args[0]);
        Method install = Class.forName("optifine.Installer").getMethod("doInstall", File.class);
        Object ok = install.invoke(null, dir);
        if (Boolean.FALSE.equals(ok)) {
            System.out.println("KESTREL_FAILED");
            System.exit(1);
        }
        System.out.println("KESTREL_OK");
    }
}
