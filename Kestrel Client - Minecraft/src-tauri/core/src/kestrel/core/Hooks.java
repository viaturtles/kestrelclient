package kestrel.core;

import org.lwjgl.input.Keyboard;

/**
 * Entry points called from Minecraft's code (see Patcher) and from KestrelScreen.
 * Any failure turns that part of Kestrel off for the session instead of crashing the game.
 */
public final class Hooks {
    static volatile ClassLoader loader;
    private static Bridge mc;
    private static boolean menuBroken, hudBroken, panelBroken;
    private static boolean rshiftWasDown;

    static Bridge mc() throws Exception {
        if (mc == null) {
            mc = (Bridge) new GameLoader(loader).loadClass("KestrelBridge").newInstance();
            Config.load(mc.gameDir());
            Perf.apply(mc);
            Log.info("ready");
        }
        return mc;
    }

    /** True once per Right Shift press. */
    private static boolean rshiftPressed() {
        boolean down = Keyboard.isKeyDown(Keyboard.KEY_RSHIFT);
        boolean pressed = down && !rshiftWasDown;
        rshiftWasDown = down;
        return pressed;
    }

    // ---- rendering -------------------------------------------------------------------------

    /** Set by Perf: draw the Tessellator through Kestrel's streaming buffer. */
    static volatile boolean streamDraw;

    /** WorldVertexBufferUploader.draw: true when Kestrel drew it. */
    public static boolean draw(Object uploader, Object worldRenderer) {
        if (!streamDraw || mc == null) return false;
        try {
            return mc.draw(worldRenderer);
        } catch (Throwable t) {
            streamDraw = false;
            Log.error("streaming draw (back to vanilla)", t);
            return false;
        }
    }

    /** Set by Perf: fancy clouds from a cached display list. */
    static volatile boolean cachedClouds;

    /** RenderGlobal.renderCloudsFancy: true when Kestrel drew the clouds. */
    public static boolean clouds(Object renderGlobal, float partialTicks, int pass) {
        if (!cachedClouds || mc == null) return false;
        try {
            return mc.clouds(renderGlobal, partialTicks, pass);
        } catch (Throwable t) {
            cachedClouds = false;
            Log.error("cached clouds (back to vanilla)", t);
            return false;
        }
    }

    /** Set by Perf: don't draw entities and block entities hidden behind blocks. */
    static volatile boolean culling;

    /** RenderManager.shouldRender: true = hidden behind blocks, don't draw it. */
    public static boolean skipEntity(Object renderManager, Object entity) {
        if (!culling || mc == null) return false;
        try {
            return mc.hideEntity(entity);
        } catch (Throwable t) {
            culling = false;
            Log.error("entity culling (back to vanilla)", t);
            return false;
        }
    }

    /** TileEntityRendererDispatcher.renderTileEntity: true = hidden behind blocks, skip it. */
    public static boolean skipTile(Object dispatcher, Object tile, float partialTicks, int destroyStage) {
        if (!culling || mc == null || destroyStage >= 0) return false;
        try {
            return mc.hideTile(tile);
        } catch (Throwable t) {
            culling = false;
            Log.error("block entity culling (back to vanilla)", t);
            return false;
        }
    }

    // ---- gameplay mods (Tools) -------------------------------------------------------------

    private static boolean tickBroken;
    private static String lastServer;

    /** Minecraft.runTick, at the start of every client tick. */
    public static void tick() {
        if (tickBroken || loader == null) return;
        try {
            Bridge b = mc();
            String server = b.inWorld() ? b.server() : null;
            if (server == null ? lastServer != null : !server.equals(lastServer)) Mod.Tps.restart();
            lastServer = server;
            for (Mod m : Mod.ALL) m.tick(b);
        } catch (Throwable t) {
            tickBroken = true;
            Log.error("mod ticks", t);
        }
    }

    /** EntityRenderer.getFOVModifier's result (useFOVSetting is false for the hand). */
    public static float fov(float fov, boolean world) {
        if (mc == null) return fov;
        try {
            return Mod.ZOOM.fov(mc, fov, world);
        } catch (Throwable t) {
            Log.error("zoom", t);
            return fov;
        }
    }

    /** EntityRenderer.hurtCameraEffect: true = skip the shake. */
    public static boolean hurtShake(Object renderer, float partialTicks) {
        return Mod.DAMAGE.on() && !Mod.DAMAGE.shake.bool();
    }

    /** RendererLivingEntity.setBrightness: the four FloatBuffer.put calls of the red hurt tint. */
    public static java.nio.FloatBuffer hurt0(java.nio.FloatBuffer buf, float v) { return buf.put(v == 1f ? Mod.DAMAGE.tint(0, v) : v); }
    public static java.nio.FloatBuffer hurt1(java.nio.FloatBuffer buf, float v) { return buf.put(v == 0f ? Mod.DAMAGE.tint(1, v) : v); }
    public static java.nio.FloatBuffer hurt2(java.nio.FloatBuffer buf, float v) { return buf.put(v == 0f ? Mod.DAMAGE.tint(2, v) : v); }
    public static java.nio.FloatBuffer hurt3(java.nio.FloatBuffer buf, float v) { return buf.put(v == 0.3f ? Mod.DAMAGE.tint(3, v) : v); }

    /** GuiIngame.showCrosshair's result: Kestrel draws its own crosshair in the HUD instead. */
    public static boolean crosshair(boolean vanilla) {
        Mod.CROSSHAIR.vanilla = vanilla;
        return vanilla && !Mod.CROSSHAIR.on();
    }

    /** RenderGlobal.drawSelectionBox: true when Kestrel drew the outline. */
    public static boolean outline(Object renderGlobal, Object player, Object hit, int pass, float partialTicks) {
        Tools.Outline o = Mod.OUTLINE;
        if (mc == null || pass != 0 || !o.on()) return false;
        try {
            return mc.outline(player, hit, partialTicks, o.rgb(), o.alpha.num() / 100f, o.width.num(), o.fill.bool() ? o.fillAlpha.num() / 100f : 0);
        } catch (Throwable t) {
            Log.error("block outline", t);
            return false;
        }
    }

    /** ScreenShotHelper.saveScreenshot's chat message. */
    private static boolean capeBroken;

    /** AbstractClientPlayer.getLocationCape: your Kestrel cape on your own player. */
    public static Object cape(Object current, Object player) {
        if (capeBroken || mc == null) return current;
        try {
            if (!Mod.CAPE.on()) return current;
            if (!mc.isLocalPlayer(player)) {
                // Other Kestrel players wear their Kestrel cape over their Minecraft one.
                Object theirs = Others.cape(mc, mc.uuid(player));
                return theirs != null ? theirs : current;
            }
            Object own = Cape.location(mc);
            return own == Cape.NONE ? null : own != null ? own : current;
        } catch (Throwable t) {
            capeBroken = true;
            Log.error("cape", t);
            return current;
        }
    }

    /** LayerCape.doRenderLayer: true when Kestrel drew your cape as cloth. */
    public static boolean capeLayer(Object layer, Object player, float limbSwing, float limbSwingAmount, float partialTicks) {
        if (capeBroken || mc == null) return false;
        try {
            if (!Mod.CAPE.on() || !Mod.CAPE.cloth.bool() || !mc.isLocalPlayer(player)) return false;
            Object tex = Cape.location(mc);
            if (tex == Cape.NONE) return true; // hidden in game: draw nothing
            if (tex == null) tex = mc.vanillaCape(player); // cloth physics for your Minecraft cape too
            if (tex == null) return false;
            ClothCape.draw(mc, player, partialTicks, tex);
            return true;
        } catch (Throwable t) {
            capeBroken = true;
            Log.error("cloth cape", t);
            return false;
        }
    }

    public static Object screenshot(Object message) {
        if (mc == null) return message;
        try {
            return Mod.SCREENSHOTS.saved(mc, message);
        } catch (Throwable t) {
            Log.error("screenshot", t);
            return message;
        }
    }

    /** EntityPlayerSP.sendChatMessage: true when Kestrel handled it (its own /kestrel commands). */
    public static boolean send(Object player, String msg) {
        if (mc == null) return false;
        try {
            Mod.REQUEUE.sent(msg);
            if (!msg.startsWith("/kestrel ")) return false;
            String arg = msg.substring(9).trim();
            if (arg.startsWith("copyshot ")) Tools.Screenshots.copy(new java.io.File(arg.substring(9)));
            else if (arg.equals("reset")) Mod.TRIANGULATION.reset();
            return true;
        } catch (Throwable t) {
            Log.error("chat command", t);
            return false;
        }
    }

    private static boolean chatBroken;

    /** GuiNewChat.printChatMessageWithOptionalDeletion: true when Kestrel printed (or hid) it. */
    public static boolean chat(Object gui, Object component, int id) {
        if (chatBroken || mc == null) return false;
        try {
            String text = mc.chatText(component);
            if (id == 0) {
                Mod.AUTO_GG.chat(mc, text);
                Mod.REQUEUE.chat(mc, component, text);
                if (Mod.ALERTS.chat(mc, text)) return true;
            }
            return Mod.CHAT.print(mc, gui, component, id);
        } catch (Throwable t) {
            chatBroken = true;
            Log.error("chat (back to vanilla)", t);
            return false;
        }
    }

    /** GuiNewChat.drawChat: true when Kestrel drew it (searching). */
    public static boolean drawChat(Object gui, int updateCounter) {
        Tools.Chat c = Mod.CHAT;
        if (chatBroken || mc == null || !c.searching || drawingChat) return false;
        try {
            if (!mc.screenOpen()) {
                c.searching = false;
                return false;
            }
            drawingChat = true;
            mc.chatDrawFiltered(gui, updateCounter, query);
            return true;
        } catch (Throwable t) {
            c.searching = false;
            Log.error("chat search", t);
            return false;
        } finally {
            drawingChat = false;
        }
    }

    private static boolean drawingChat;

    private static String query = "";

    /** GuiChat.keyTyped: true when Kestrel used the key (Ctrl+F search). */
    public static boolean chatKey(Object screen, char c, int key) {
        Tools.Chat ch = Mod.CHAT;
        if (chatBroken || mc == null || !ch.on() || !ch.search.bool()) return false;
        boolean ctrl = Keyboard.isKeyDown(Keyboard.KEY_LCONTROL) || Keyboard.isKeyDown(Keyboard.KEY_RCONTROL);
        if (key == Keyboard.KEY_F && ctrl) {
            ch.searching = !ch.searching;
            query = "";
            mc.chatInput(screen, "");
            return true;
        }
        if (ch.searching && (key == Keyboard.KEY_RETURN || key == Keyboard.KEY_NUMPADENTER)) {
            ch.searching = false; // Enter ends the search instead of sending the search words
            mc.chatInput(screen, "");
            return true;
        }
        return false;
    }

    /** GuiChat.mouseClicked: right-click copies the message under the mouse. */
    public static boolean chatClick(Object screen, int x, int y, int button) {
        Tools.Chat ch = Mod.CHAT;
        if (chatBroken || mc == null || button != 1 || !ch.on() || !ch.copy.bool()) return false;
        try {
            String text = mc.chatMessageAt(org.lwjgl.input.Mouse.getX(), org.lwjgl.input.Mouse.getY());
            if (text == null) return false;
            mc.copy(text.replaceAll("§.", ""));
            Toasts.show("Message copied", null, "copy");
            return true;
        } catch (Throwable t) {
            Log.error("chat copy", t);
            return false;
        }
    }

    /** GuiChat.drawScreen, after vanilla: keeps the search words and shows that search is on. */
    public static void chatDrawn(Object screen) {
        if (mc == null || !Mod.CHAT.searching) return;
        try {
            query = mc.chatInput(screen);
            int w = mc.width(), h = mc.height();
            float s = 0.7f + 0.3f * mc.guiScale();
            Gfx.begin(w, h, s);
            try {
                String label = "Searching chat", hint = "Ctrl+F or Enter to stop";
                float lw = Text.width(Text.SEMIBOLD, 12, label) + Text.width(Text.MEDIUM, 11, hint) + 52;
                // Right side, just above the input box (the chat lines are on the left).
                float x = w / s - lw - 4, y = h / s - 14 * mc.guiScale() / s - 32;
                Gfx.box(x, y, lw, 26, 6, Gfx.rgba(Ui.BUTTON, 0.92f), Gfx.rgba(0xFFFFFF, 0.1f), 0);
                Gfx.icon("search", x + 8, y + 6, 14, Ui.T1);
                float tw = Text.centred(Text.SEMIBOLD, 12, label, x + 28, y, 26, Ui.T1);
                Text.centred(Text.MEDIUM, 11, hint, x + 36 + tw, y, 26, Ui.T3);
            } finally {
                Gfx.end();
            }
        } catch (Throwable t) {
            Log.error("chat search label", t);
        }
    }

    private static boolean tabBroken;

    /** GuiPlayerTabOverlay.renderPlayerlist: true when Kestrel drew the list. */
    public static boolean tabList(Object overlay, int width, Object scoreboard, Object objective) {
        if (tabBroken || mc == null || !Mod.TABLIST.on()) return false;
        try {
            Mod.TABLIST.draw(mc, overlay, width, scoreboard, objective);
            return true;
        } catch (Throwable t) {
            Gfx.end();
            tabBroken = true;
            Log.error("Tab list (back to vanilla)", t);
            return false;
        }
    }

    /** GuiIngameMenu.initGui, after vanilla. */
    public static void pauseInit(Object screen) {
        if (mc == null) return;
        try {
            Mod.PAUSE.init(mc, screen);
        } catch (Throwable t) {
            Log.error("pause menu", t);
        }
    }

    /** GuiIngameMenu.actionPerformed: true for Kestrel's buttons. */
    public static boolean pauseAction(Object screen, Object button) {
        if (mc == null) return false;
        try {
            return Mod.PAUSE.action(mc, screen, mc.buttonId(button));
        } catch (Throwable t) {
            Log.error("pause menu button", t);
            return false;
        }
    }

    /** NetHandlerPlayClient.handleTimeUpdate: runs on the network thread first (when it arrives), then again on the game's. */
    public static boolean timeUpdate(Object handler, Object packet) {
        if (!"Client thread".equals(Thread.currentThread().getName())) Mod.Tps.timeUpdate();
        return false;
    }

    // ---- main menu -------------------------------------------------------------------------

    public static boolean menuDraw(Object menu, int mouseX, int mouseY, float partialTicks) {
        if (menuBroken) return false;
        try {
            Bridge b = mc();
            if (!Config.customMenu()) return false;
            if (rshiftPressed()) Panel.open(b, menu, 0);
            MainMenu.draw(b, menu, partialTicks);
            Test.menu(b, menu);
            Bench.menu(b);
            return true;
        } catch (Throwable t) {
            Gfx.end();
            menuBroken = true;
            Log.error("main menu (using the vanilla one)", t);
            return false;
        }
    }

    public static boolean menuClick(Object menu, int mouseX, int mouseY, int button) {
        if (menuBroken || mc == null || !Config.customMenu()) return false;
        try {
            if (button == 0) Ui.click();
        } catch (Throwable t) {
            Log.error("main menu click", t);
        }
        return true;
    }

    // ---- HUD -------------------------------------------------------------------------------

    public static void hud(float partialTicks) {
        if (hudBroken) return;
        try {
            Bridge b = mc();
            if (rshiftPressed()) {
                if (Panel.isOpen()) Panel.close(b);
                else if (!b.screenOpen()) Panel.open(b, null, 0);
            }
            Hud.draw(b);
            Test.hud(b);
            Bench.hud(b);
        } catch (Throwable t) {
            Gfx.end();
            hudBroken = true;
            Log.error("HUD", t);
        }
    }

    // ---- Kestrel panel (KestrelScreen) -----------------------------------------------------

    public static void panelInit() {
        try {
            Panel.init(mc());
        } catch (Throwable t) {
            Log.error("panel", t);
        }
    }

    public static void panelDraw(float partialTicks) {
        try {
            Bridge b = mc();
            // In a world the HUD hook watches Right Shift; on the title screen this does.
            if (!b.inWorld() && rshiftPressed()) { Panel.close(b); return; }
            if (panelBroken) { Panel.close(b); return; }
            Panel.draw(b, partialTicks);
            Test.panel(b);
        } catch (Throwable t) {
            Gfx.end();
            panelBroken = true;
            Log.error("panel", t);
        }
    }

    public static void panelKey(char c, int key) {
        try {
            Panel.key(mc(), c, key);
        } catch (Throwable t) {
            Log.error("panel key", t);
        }
    }

    public static void panelMouse(int button, boolean down) {
        try {
            Panel.mouse(mc(), button, down);
        } catch (Throwable t) {
            Log.error("panel click", t);
        }
    }

    public static void panelScroll(int amount) {
        Panel.scroll(amount);
    }

    public static void panelTick() {
        try {
            Panel.tick(mc());
        } catch (Throwable t) {
            Log.error("panel tick", t);
        }
    }

    public static void panelClosed() {
        try {
            Panel.closed(mc());
        } catch (Throwable t) {
            Log.error("panel close", t);
        }
    }
}
