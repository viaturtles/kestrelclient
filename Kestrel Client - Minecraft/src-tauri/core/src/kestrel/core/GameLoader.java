package kestrel.core;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Loads KestrelBridge and KestrelScreen (default package) on top of the game's class loader.
 * They can't share a loader with the game: Minecraft's jar is signed, and Java refuses unsigned
 * classes in the same package. Everything else is asked from the game's loader as usual.
 */
final class GameLoader extends ClassLoader {
    GameLoader(ClassLoader game) {
        super(game);
    }

    @Override
    protected synchronized Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (!name.startsWith("Kestrel") || name.indexOf('.') >= 0) return super.loadClass(name, resolve);
        Class<?> c = findLoadedClass(name);
        if (c == null) {
            try (InputStream in = GameLoader.class.getResourceAsStream("/" + name + ".class")) {
                if (in == null) throw new ClassNotFoundException(name);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                byte[] bytes = out.toByteArray();
                c = defineClass(name, bytes, 0, bytes.length);
            } catch (ClassNotFoundException e) {
                throw e;
            } catch (Exception e) {
                throw new ClassNotFoundException(name, e);
            }
        }
        if (resolve) resolveClass(c);
        return c;
    }
}
