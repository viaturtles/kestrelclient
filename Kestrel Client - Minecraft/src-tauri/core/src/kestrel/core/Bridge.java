package kestrel.core;

import java.io.File;
import java.util.UUID;

/**
 * Everything Kestrel needs from Minecraft. Implemented by KestrelBridge (default package),
 * which is compiled against the obfuscated 1.8.9 client and loaded in the game's class loader.
 */
public interface Bridge {
    int width();
    int height();
    boolean inWorld();
    boolean screenOpen();
    boolean debugShown();
    /** Minecraft's current GUI scale factor (1-4+), the same one vanilla menus use. */
    int guiScale();

    void openPanel();
    /** Shows a screen (null closes the current one). */
    void display(Object screen);
    void singleplayer(Object parent);
    void multiplayer(Object parent);
    void options(Object parent);
    void quit();
    /** Opens a singleplayer world by its folder name. */
    void openWorld(String folder);
    /** Opens (or first creates) a creative world with cheats from a fixed seed. */
    void createWorld(String folder, long seed);
    /** Sends a chat line or command as the player. */
    void chat(String message);
    /** Points the player's camera. */
    void look(float yaw, float pitch);

    String username();
    int fps();
    /** Player x, y, z, yaw, or null outside a world. */
    double[] position();

    /** Draws the vanilla title-screen panorama of a GuiMainMenu. */
    void skybox(Object menu, float partialTicks);
    void tickMenu(Object menu);
    /** GL id of the player's skin (64x64), or -1. Call outside Gfx.begin/end. */
    int skinTexture();
    /** Blurs the game behind menus with the given radius (vanilla uses 20); 0 turns it off. */
    void blur(float radius);
    File gameDir();
    /** True for the player you're playing as. */
    boolean isLocalPlayer(Object player);
    /** A player entity's UUID. */
    UUID uuid(Object player);
    /** Uploads an image as a game texture; returns its ResourceLocation. Render thread only. */
    Object texture(String name, java.awt.image.BufferedImage img);
    /** 0 first person, 1 behind, 2 in front (F5). */
    void thirdPerson(int view);
    void bind(Object location);
    /** The GL texture id behind a ResourceLocation (loading it if needed), or -1. */
    int glTexture(Object location);
    /** The cape Minecraft itself gives the player (their Minecraft cape), or null. */
    Object vanillaCape(Object player);
    /** Vanilla's cape swing {up/down, forward, sideways} in degrees-ish; null when invisible. */
    float[] capeMotion(Object player, float partialTicks);

    // ---- performance ----
    void glErrorChecks(boolean on);
    /** Draws a WorldRenderer through the streaming buffer; false = let vanilla draw it. */
    boolean draw(Object worldRenderer);
    /** Renders fancy clouds from Kestrel's cache; false = let vanilla do it. */
    boolean clouds(Object renderGlobal, float partialTicks, int pass) throws Exception;
    /** True when this entity / block entity is completely hidden behind blocks (see KestrelCull). */
    boolean hideEntity(Object entity);
    boolean hideTile(Object tileEntity);
    /** True when OptiFine is installed (it changes some of the same code). */
    boolean optifine();

    // ---- gameplay mods (Tools) ----
    /** Address of the server you're playing on; null in singleplayer and menus. */
    String server();
    /** Your ping on this server in ms, or -1. */
    int ping();
    int dimension();
    float gamma();
    void gamma(float value);
    boolean smoothCamera();
    void smoothCamera(boolean on);
    /** Key code of a key binding: "sprint", "sneak", or a binding's own name such as "of.key.zoom"; 0 if none. */
    int keyCode(String binding);
    /** Presses or releases every key binding on this key code (KeyBinding.setKeyBindState). */
    void holdKey(int code, boolean down);
    /** Every key binding's name and key code. */
    java.util.Map<String, Integer> keybinds();
    /** Sets key codes by binding name (unknown names are skipped) and saves options.txt. */
    void keybinds(java.util.Map<String, Integer> codes);
    /** Ender eyes flying in the world: {entity id, x, y, z} each. */
    java.util.List<double[]> enderEyes();
    /** Draws the block outline Kestrel's way; false = let vanilla draw it. */
    boolean outline(Object player, Object hit, float partialTicks, int rgb, float alpha, float width, float fill);

    // ---- chat ----
    /**
     * A Kestrel chat line: grey "Kestrel" tag, text, then [buttons]. Actions: "open:<file>" or
     * "run:<command>". Returns the chat component.
     */
    Object chatLine(String text, String[] buttons, String[] actions);
    /** Adds a chat line only you see. */
    void print(Object component);
    String chatText(Object component);
    /** The first "run command" click action in a chat message, or null. */
    String chatCommand(Object component);
    /** A copy of the message with an optional grey prefix and suffix. */
    Object chatDecorate(Object component, String prefix, String suffix);
    /** GuiNewChat.printChatMessageWithOptionalDeletion. */
    void chatPrint(Object chatGui, Object component, int id);
    /** Text of the whole chat message under the mouse in the chat screen, or null. */
    String chatMessageAt(int mouseX, int mouseY);
    /** Text typed in the chat screen's input box. */
    String chatInput(Object chatScreen);
    void chatInput(Object chatScreen, String text);
    /** Draws the chat with only the messages containing `query` (case-insensitive). */
    void chatDrawFiltered(Object chatGui, int updateCounter, String query);
    void copy(String text);

    // ---- Tab list (all positions in GUI pixels) ----
    /** Players in the Tab list, sorted like vanilla (teams, then names), at most 80. */
    java.util.List<Object> tabPlayers();
    /** {formatted name, uuid, ping ms, spectator 1/0}. */
    Object[] tabPlayer(Object info);
    /** The server's Tab header and footer, wrapped to `width` (formatted lines; empty when none). */
    java.util.List<String> tabHeader(Object overlay, int width);
    java.util.List<String> tabFooter(Object overlay, int width);
    /** True when heads are shown (vanilla: singleplayer or an online-mode server). */
    boolean tabHeads();
    void drawHead(Object info, int x, int y);
    /** Width of the objective's value (0 = none, hearts = 90). */
    int tabScoreWidth(Object scoreboard, Object objective, Object info);
    /** Vanilla's score / hearts drawing between x1 and x2. */
    void tabScore(Object overlay, Object objective, int y, Object info, int x1, int x2);
    int textWidth(String formatted);
    /** Minecraft's font with shadow. */
    void drawText(String formatted, float x, float y, int argb);
    UUID self();
    /** GuiIngame's GuiPlayerTabOverlay. */
    Object tabOverlay();

    // ---- pause menu ----
    /** Adds vanilla buttons to the pause menu: {id, x offset from centre, y offset from height/4, width, label}. */
    void addButtons(Object screen, Object[][] buttons);
    int buttonId(Object button);
    void resourcePacks(Object parent);
    /** Leaves and joins the same server again. */
    void reconnect();
    /** Leaves the current world or server (if any) and joins this server. */
    void connect(String address);
}
