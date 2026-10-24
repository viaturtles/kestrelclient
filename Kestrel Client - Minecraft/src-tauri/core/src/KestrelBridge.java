import com.mojang.authlib.GameProfile;
import com.mojang.authlib.minecraft.MinecraftProfileTexture;
import java.io.File;
import java.lang.reflect.Method;
import java.util.Map;
import kestrel.core.Bridge;
import org.lwjgl.opengl.GL11;

/**
 * Kestrel's access to Minecraft 1.8.9, written against the obfuscated client (MCP names in comments).
 * Lives in the default package because the game's classes do; loaded in the game's class loader.
 *
 *   ave  Minecraft          axu  GuiScreen       aya  GuiMainMenu     avh  GameSettings
 *   axv  GuiSelectWorld     azh  GuiMultiplayer  axn  GuiOptions      bfl  GlStateManager
 *   bfk  EntityRenderer     jy   ResourceLocation bmz DefaultPlayerSkin bmj TextureManager
 */
public class KestrelBridge implements Bridge {
    private Method skybox, loadShader;
    private java.lang.reflect.Field shaders;
    private jy skin;
    private boolean skinRequested, blurOn;

    private static ave mc() {
        return ave.A(); // getMinecraft
    }

    public int width() { return mc().d; }   // displayWidth
    public int height() { return mc().e; }  // displayHeight
    public boolean inWorld() { return mc().f != null && mc().h != null; } // theWorld, thePlayer
    public boolean screenOpen() { return mc().m != null; }                // currentScreen
    public boolean debugShown() { return mc().t.aC; }                     // gameSettings.showDebugInfo
    public int guiScale() { return new avr(mc()).e(); }                  // new ScaledResolution(mc).getScaleFactor()

    public void openPanel() { mc().a(new KestrelScreen()); }              // displayGuiScreen
    public void display(Object screen) { mc().a((axu) screen); }
    public void singleplayer(Object parent) { mc().a(new axv((axu) parent)); }
    public void multiplayer(Object parent) { mc().a(new azh((axu) parent)); }
    public void options(Object parent) { mc().a(new axn((axu) parent, mc().t)); }
    public void quit() { mc().m(); }                                      // shutdown
    public void openWorld(String folder) { mc().a(folder, folder, (adp) null); } // launchIntegratedServer
    public void createWorld(String folder, long seed) {
        mc().a(folder, folder, new adp(seed, adp.a.c, true, false, adr.b).b()); // WorldSettings(seed, CREATIVE, structures, !hardcore, DEFAULT).enableCommands()
    }
    public void chat(String message) { if (mc().h != null) mc().h.e(message); } // thePlayer.sendChatMessage
    public void look(float yaw, float pitch) {
        pk p = mc().h;
        if (p == null) return;
        p.y = p.A = yaw;                                                  // rotationYaw, prevRotationYaw
        p.z = p.B = pitch;                                                // rotationPitch, prevRotationPitch
    }

    public String username() { return mc().L().c(); }                     // getSession().getUsername()
    public int fps() { return ave.ai(); }                                 // getDebugFPS

    public double[] position() {
        pk p = mc().h;
        if (p == null) return null;
        return new double[]{p.s, p.t, p.u, p.y};                          // posX, posY, posZ, rotationYaw
    }

    public void skybox(Object menu, float partialTicks) {
        try {
            if (skybox == null) {
                skybox = aya.class.getDeclaredMethod("c", int.class, int.class, float.class); // renderSkybox
                skybox.setAccessible(true);
            }
            bfl.c();                                                      // disableAlpha
            skybox.invoke(menu, 0, 0, partialTicks);
            bfl.d();                                                      // enableAlpha
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void tickMenu(Object menu) { ((aya) menu).e(); }              // updateScreen (moves the panorama)

    public int skinTexture() {
        final ave m = mc();
        try {
            if (!skinRequested) {
                skinRequested = true;
                skin = bmz.a();                                           // getDefaultSkinLegacy (Steve)
                // The launcher saves your skin as kestrel/skin.png at every launch: no Mojang request needed
                // (the session server rate-limits quick relaunches and then gives back no skin at all).
                try {
                    java.io.File f = new java.io.File(gameDir(), "kestrel/skin.png");
                    java.awt.image.BufferedImage img = f.isFile() ? javax.imageio.ImageIO.read(f) : null;
                    if (img != null && img.getWidth() == 64 && img.getHeight() == 64) {
                        skin = (jy) texture("kestrel_own_skin", img);
                        return skinTexture();
                    }
                } catch (Throwable e) {
                    System.out.println("[Kestrel] skin file: " + e);
                }
                final GameProfile profile;
                try {
                    profile = m.L().e();                                  // getSession().getProfile()
                    skin = bmz.a(profile.getId());                        // default Steve/Alex until the real one loads
                } catch (Throwable e) {
                    return -1;                                            // not a real UUID: Steve next frame
                }
                Thread t = new Thread(new Runnable() {
                    public void run() {
                        try {
                            // Mojang answers "too many requests" with an empty profile, so try a few times.
                            GameProfile got = profile;
                            for (int i = 0; i < 4 && got.getProperties().isEmpty(); i++) {
                                if (i > 0) Thread.sleep(30_000);
                                got = m.aa().fillProfileProperties(profile, false);
                            }
                            if (got.getProperties().isEmpty()) { System.out.println("[Kestrel] skin: Mojang sent no skin (rate limited?)"); return; }
                            final GameProfile full = got;
                            m.a(new Runnable() {
                                public void run() {
                                    Map<?, ?> textures = m.ab().a(full); // getSkinManager().loadSkinFromCache
                                    MinecraftProfileTexture t = (MinecraftProfileTexture) textures.get(MinecraftProfileTexture.Type.SKIN);
                                    if (t != null) skin = m.ab().a(t, MinecraftProfileTexture.Type.SKIN); // loadSkin
                                }
                            });
                        } catch (Throwable e) {
                            System.out.println("[Kestrel] skin: " + e);
                        }
                    }
                }, "Kestrel skin");
                t.setDaemon(true);
                t.start();
            }
            bmj tm = m.P();                                               // getTextureManager
            bmk tex = tm.b(skin);                                         // getTexture
            if (tex == null) {
                tm.a(skin);                                               // bindTexture (loads it)
                tex = tm.b(skin);
            }
            return tex == null ? -1 : tex.b();                            // getGlTextureId
        } catch (Throwable e) {
            return -1;
        }
    }

    public void blur(float radius) {
        boolean on = radius > 0;
        try {
            bfk r = mc().o;                                               // entityRenderer
            if (on && !blurOn && !r.a()) {                                // isShaderActive
                if (loadShader == null) {
                    loadShader = bfk.class.getDeclaredMethod("a", jy.class); // loadShader (private)
                    loadShader.setAccessible(true);
                }
                loadShader.invoke(r, new jy("shaders/post/blur.json"));
                blurOn = true;
            }
            if (on && blurOn) {
                // Vanilla's radius is 20; Kestrel uses a lighter blur.
                if (shaders == null) {
                    shaders = blr.class.getDeclaredField("d");            // ShaderGroup.listShaders
                    shaders.setAccessible(true);
                }
                for (Object s : (java.util.List<?>) shaders.get(r.f())) { // getShaderGroup
                    blv u = ((bls) s).c().a("Radius");                    // getShaderManager().getShaderUniform
                    if (u != null) u.a(radius);                           // set
                }
            } else if (!on && blurOn) {
                r.b();                                                    // stopUseShader
                blurOn = false;
            }
        } catch (Throwable e) {
            System.out.println("[Kestrel] blur: " + e);
        }
    }

    public File gameDir() { return mc().v; }                              // mcDataDir

    public boolean isLocalPlayer(Object player) { return player != null && player == mc().h; } // thePlayer
    public java.util.UUID uuid(Object player) { return ((pk) player).aK(); }  // Entity.getUniqueID
    public Object texture(String name, java.awt.image.BufferedImage img) { return mc().P().a(name, new blz(img)); } // getDynamicTextureLocation
    public void thirdPerson(int view) { mc().t.aB = view; }               // gameSettings.thirdPersonView
    public void bind(Object location) { mc().P().a((jy) location); }      // textureManager.bindTexture
    public Object vanillaCape(Object player) { return ((bet) player).k(); } // getLocationCape (Kestrel's hook passes it through)
    public int glTexture(Object location) {
        bmj tm = mc().P();
        bmk t = tm.b((jy) location);                                      // getTexture
        if (t == null) { tm.a((jy) location); t = tm.b((jy) location); }  // bindTexture loads it
        return t == null ? -1 : t.b();                                    // getGlTextureId
    }

    /** Vanilla LayerCape's swing values {up/down, forward, sideways}; null when the player is invisible. */
    public float[] capeMotion(Object o, float pt) {
        wn p = (wn) o;
        if (p.ax()) return null;                                          // isInvisible
        double d0 = p.bq + (p.bt - p.bq) * pt - (p.p + (p.s - p.p) * pt); // chasingPos vs pos (x, y, z)
        double d1 = p.br + (p.bu - p.br) * pt - (p.q + (p.t - p.q) * pt);
        double d2 = p.bs + (p.bv - p.bs) * pt - (p.r + (p.u - p.r) * pt);
        float yaw = p.aJ + (p.aI - p.aJ) * pt;                            // renderYawOffset
        double s = Math.sin(yaw * Math.PI / 180), c = -Math.cos(yaw * Math.PI / 180);
        float up = Math.max(-6, Math.min(32, (float) d1 * 10f));
        float fwd = Math.max(0, (float) (d0 * s + d2 * c) * 100f);
        float side = (float) (d0 * c - d2 * s) * 100f;
        float bob = p.bn + (p.bo - p.bn) * pt;                            // cameraYaw
        up += (float) Math.sin((p.L + (p.M - p.L) * pt) * 6f) * 32f * bob; // distanceWalkedModified
        if (p.av()) up += 25f;                                            // isSneaking
        return new float[]{up, fwd, side};
    }

    public boolean draw(Object worldRenderer) { return KestrelDraw.draw((bfd) worldRenderer); }
    public boolean clouds(Object renderGlobal, float pt, int pass) throws Exception { return KestrelClouds.render(renderGlobal, pt, pass); }
    public boolean hideEntity(Object entity) { return KestrelCull.hideEntity(entity); }
    public boolean hideTile(Object tile) { return KestrelCull.hideTile(tile); }

    public boolean optifine() {
        try {
            Class.forName("Config", false, getClass().getClassLoader()).getMethod("isShaders");
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    // ---- gameplay mods ----------------------------------------------------------------------
    //   bde ServerData   bcy NetHandlerPlayClient   bdc NetworkPlayerInfo   avb KeyBinding
    //   wr EntityEnderEye   afh Block   aug AxisAlignedBB   auh MovingObjectPosition   arm Material

    public String server() {
        bde d = mc().D();                                                 // getCurrentServerData
        return d == null || mc().E() ? null : d.b;                        // isIntegratedServerRunning, serverIP
    }

    public int ping() {
        try {
            bdc info = mc().u().a(mc().h.aK());                           // getNetHandler().getPlayerInfo(getUniqueID())
            return info == null ? -1 : info.c();                          // getResponseTime
        } catch (Throwable e) {
            return -1;
        }
    }

    public int dimension() { return mc().h == null ? 0 : mc().h.am; }    // dimension
    public float gamma() { return mc().t.aJ; }                            // gammaSetting
    public void gamma(float v) { mc().t.aJ = v; }
    public boolean smoothCamera() { return mc().t.aG; }                   // smoothCamera
    public void smoothCamera(boolean on) { mc().t.aG = on; }

    public int keyCode(String binding) {
        avh s = mc().t;
        if (binding.equals("sprint")) return s.ae.i();                    // keyBindSprint.getKeyCode
        if (binding.equals("sneak")) return s.ad.i();                     // keyBindSneak
        for (avb k : s.ax) if (k.g().equals(binding)) return k.i();       // keyBindings, getKeyDescription
        return 0;
    }

    public void holdKey(int code, boolean down) { avb.a(code, down); }   // setKeyBindState

    public java.util.Map<String, Integer> keybinds() {
        java.util.Map<String, Integer> out = new java.util.LinkedHashMap<String, Integer>();
        for (avb k : mc().t.ax) out.put(k.g(), k.i());
        return out;
    }

    public void keybinds(java.util.Map<String, Integer> codes) {
        for (avb k : mc().t.ax) {
            Integer c = codes.get(k.g());
            if (c != null) k.b(c);                                        // setKeyCode
        }
        avb.b();                                                          // resetKeyBindingArrayAndHash
        mc().t.b();                                                       // saveOptions
    }

    public java.util.List<double[]> enderEyes() {
        java.util.List<double[]> out = new java.util.ArrayList<double[]>();
        if (mc().f == null) return out;
        for (Object o : mc().f.E()) {                                     // getLoadedEntityList
            if (o instanceof wr) {
                pk e = (pk) o;
                out.add(new double[]{e.F(), e.s, e.t, e.u});              // getEntityId, posX/Y/Z
            }
        }
        return out;
    }

    public boolean outline(Object player, Object hit, float pt, int rgb, float alpha, float width, float fill) {
        auh m = (auh) hit;
        if (m == null || m.a.ordinal() != 1) return false;                // typeOfHit == BLOCK (the enum shares the field's name)
        bdb w = mc().f;
        cj pos = m.a();                                                   // getBlockPos
        afh block = w.p(pos).c();                                         // getBlockState().getBlock()
        if (block.t() == arm.a || !w.af().a(pos)) return true;            // air, outside the world border
        block.a((adq) w, pos);                                            // setBlockBoundsBasedOnState
        wn p = (wn) player;
        double x = p.P + (p.s - p.P) * pt, y = p.Q + (p.t - p.Q) * pt, z = p.R + (p.u - p.R) * pt;
        aug bb = block.b((adm) w, pos).b(0.002, 0.002, 0.002).c(-x, -y, -z); // getSelectedBoundingBox, expand, offset
        float r = (rgb >> 16 & 255) / 255f, g = (rgb >> 8 & 255) / 255f, b = (rgb & 255) / 255f;
        bfl.l();                                                          // enableBlend
        bfl.a(770, 771, 1, 0);
        bfl.x();                                                          // disableTexture2D
        bfl.a(false);                                                     // depthMask
        if (fill > 0) {
            bfl.c(r, g, b, fill);                                         // color
            GL11.glDisable(GL11.GL_CULL_FACE);
            GL11.glBegin(GL11.GL_QUADS);
            double[][] f = {{bb.a, bb.b, bb.c}, {bb.d, bb.e, bb.f}};
            for (int axis = 0; axis < 3; axis++) {
                for (int side = 0; side < 2; side++) {
                    for (int v = 0; v < 4; v++) {
                        double[] c = new double[3];
                        c[axis] = f[side][axis];
                        int a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
                        c[a1] = f[v == 1 || v == 2 ? 1 : 0][a1];
                        c[a2] = f[v >= 2 ? 1 : 0][a2];
                        GL11.glVertex3d(c[0], c[1], c[2]);
                    }
                }
            }
            GL11.glEnd();
            GL11.glEnable(GL11.GL_CULL_FACE);
        }
        bfl.c(r, g, b, alpha);
        GL11.glLineWidth(width);
        bfr.a(bb);                                                        // drawSelectionBoundingBox
        GL11.glLineWidth(2f);
        bfl.a(true);
        bfl.w();                                                          // enableTexture2D
        bfl.k();                                                          // disableBlend
        return true;
    }

    // ---- chat -------------------------------------------------------------------------------
    //   eu IChatComponent   fa ChatComponentText   ez ChatStyle   et ClickEvent   a EnumChatFormatting
    //   avt GuiNewChat   ava ChatLine   awv GuiChat   avw GuiTextField

    private java.lang.reflect.Field chatLines, drawnLines, chatScroll, chatInput;

    private static fa text(String s, a colour) {
        fa t = new fa(s);
        t.b().a(colour);                                                  // getChatStyle().setColor
        return t;
    }

    public Object chatLine(String message, String[] buttons, String[] actions) {
        fa out = new fa("");
        out.a(text("Kestrel ", a.k));                                     // appendSibling, GREEN
        out.a(text(message, a.h));                                        // GRAY
        for (int i = 0; i < buttons.length; i++) {
            fa btn = text("  [" + buttons[i] + "]", a.p);                 // WHITE
            String act = actions[i];
            if (act.startsWith("open:")) btn.b().a(new et(et.a.b, act.substring(5)));      // OPEN_FILE
            else if (act.startsWith("run:")) btn.b().a(new et(et.a.c, act.substring(4)));  // RUN_COMMAND
            out.a(btn);
        }
        return out;
    }

    public void print(Object component) { mc().q.d().a((eu) component); } // ingameGUI.getChatGUI().printChatMessage

    public String chatText(Object component) { return ((eu) component).c().replaceAll("§.", ""); } // getUnformattedText

    public String chatCommand(Object component) {
        eu c = (eu) component;
        et click = c.b().h();                                             // getChatStyle().getChatClickEvent
        if (click != null && click.a() == et.a.c) return click.b();       // RUN_COMMAND, getValue
        for (Object s : c.a()) {                                          // getSiblings
            String found = chatCommand(s);
            if (found != null) return found;
        }
        return null;
    }

    public Object chatDecorate(Object component, String prefix, String suffix) {
        fa out = new fa("");
        if (prefix != null) out.a(text(prefix, a.h));
        out.a(((eu) component).f());                                      // createCopy
        if (suffix != null) out.a(text(suffix, a.h));
        return out;
    }

    public void chatPrint(Object chatGui, Object component, int id) { ((avt) chatGui).a((eu) component, id); }

    @SuppressWarnings("unchecked")
    private java.util.List<ava> lines(avt gui, boolean drawn) throws Exception {
        if (chatLines == null) {
            chatLines = avt.class.getDeclaredField("h");                  // chatLines
            drawnLines = avt.class.getDeclaredField("i");                 // drawnChatLines
            chatScroll = avt.class.getDeclaredField("j");                 // scrollPos
            chatLines.setAccessible(true);
            drawnLines.setAccessible(true);
            chatScroll.setAccessible(true);
        }
        return (java.util.List<ava>) (drawn ? drawnLines : chatLines).get(gui);
    }

    /** The whole message a drawn (wrapped) chat line belongs to. */
    private String message(avt gui, java.util.List<ava> drawn, int n) throws Exception {
        ava line = drawn.get(n);
        if (line.c() != 0) {                                              // getChatLineID
            for (ava full : lines(gui, false)) if (full.c() == line.c()) return full.a().c();
        }
        // Without an id, the wrapped lines of one message share its tick (newest first in the list).
        int lo = n, hi = n;
        while (lo > 0 && drawn.get(lo - 1).b() == line.b() && drawn.get(lo - 1).c() == 0) lo--;   // getUpdatedCounter
        while (hi < drawn.size() - 1 && drawn.get(hi + 1).b() == line.b() && drawn.get(hi + 1).c() == 0) hi++;
        StringBuilder sb = new StringBuilder();
        for (int i = hi; i >= lo; i--) sb.append(drawn.get(i).a().c());
        return sb.toString();
    }

    public String chatMessageAt(int mouseX, int mouseY) {
        try {
            avt gui = mc().q.d();
            if (!gui.e()) return null;                                    // getChatOpen
            int sf = new avr(mc()).e();
            float sc = gui.h();                                           // getChatScale
            int x = (int) Math.floor((mouseX / sf - 3) / sc), y = (int) Math.floor((mouseY / sf - 27) / sc);
            java.util.List<ava> drawn = lines(gui, true);
            int shown = Math.min(gui.i(), drawn.size()), fh = mc().k.a;    // getLineCount, FONT_HEIGHT
            if (x < 0 || y < 0 || x > Math.floor(gui.f() / sc) || y >= fh * shown + shown) return null;
            int n = y / fh + chatScroll.getInt(gui);
            return n >= 0 && n < drawn.size() ? message(gui, drawn, n) : null;
        } catch (Throwable e) {
            System.out.println("[Kestrel] chat copy: " + e);
            return null;
        }
    }

    private avw input(Object screen) throws Exception {
        if (chatInput == null) {
            chatInput = awv.class.getDeclaredField("a");                  // inputField (protected)
            chatInput.setAccessible(true);
        }
        return (avw) chatInput.get(screen);
    }

    public String chatInput(Object screen) {
        try {
            return input(screen).b();                                     // getText
        } catch (Throwable e) {
            return "";
        }
    }

    public void chatInput(Object screen, String text) {
        try {
            input(screen).a(text);                                        // setText
        } catch (Throwable e) {
            System.out.println("[Kestrel] chat input: " + e);
        }
    }

    public void chatDrawFiltered(Object chatGui, int counter, String query) {
        avt gui = (avt) chatGui;
        try {
            java.util.List<ava> drawn = lines(gui, true);
            java.util.List<ava> all = new java.util.ArrayList<ava>(drawn);
            String q = query.trim().toLowerCase(java.util.Locale.ROOT);
            int scroll = chatScroll.getInt(gui);
            if (!q.isEmpty()) {
                drawn.clear();
                for (int i = 0; i < all.size(); i++) {
                    if (message(gui, all, i).replaceAll("§.", "").toLowerCase(java.util.Locale.ROOT).contains(q)) drawn.add(all.get(i));
                }
                chatScroll.setInt(gui, 0);
            }
            try {
                gui.a(counter);                                           // drawChat (Kestrel's hook lets this one through)
            } finally {
                drawn.clear();
                drawn.addAll(all);
                chatScroll.setInt(gui, scroll);
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void copy(String text) { axu.e(text); }                        // setClipboardString

    // ---- Tab list ---------------------------------------------------------------------------
    //   awh GuiPlayerTabOverlay   bdc NetworkPlayerInfo   auo Scoreboard   auk ScoreObjective

    private java.lang.reflect.Field tabOrder, tabHeader, tabFooter;
    private Method tabScore;

    private void tabReflect() throws Exception {
        if (tabOrder != null) return;
        tabOrder = awh.class.getDeclaredField("a");                       // the sorting Ordering
        tabFooter = awh.class.getDeclaredField("h");                      // footer (setFooter = a(eu))
        tabHeader = awh.class.getDeclaredField("i");                      // header
        tabScore = awh.class.getDeclaredMethod("a", auk.class, int.class, String.class, int.class, int.class, bdc.class); // drawScoreboardValues
        tabOrder.setAccessible(true);
        tabFooter.setAccessible(true);
        tabHeader.setAccessible(true);
        tabScore.setAccessible(true);
    }

    @SuppressWarnings("unchecked")
    public java.util.List<Object> tabPlayers() {
        try {
            tabReflect();
            java.util.List<Object> all = ((com.google.common.collect.Ordering<Object>) tabOrder.get(null)).sortedCopy((java.util.Collection<Object>) (Object) mc().h.a.d()); // sendQueue.getPlayerInfoMap
            return all.subList(0, Math.min(all.size(), 80));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public Object[] tabPlayer(Object info) {
        bdc p = (bdc) info;
        return new Object[]{mc().q.h().a(p), p.a().getId(), p.c(), p.b() == adp.a.e ? 1 : 0}; // getTabList().getPlayerName, getGameProfile, getResponseTime, SPECTATOR
    }

    @SuppressWarnings("unchecked")
    private java.util.List<String> wrapped(java.lang.reflect.Field f, Object overlay, int width) {
        try {
            tabReflect();
            eu c = (eu) f.get(overlay);
            return c == null ? java.util.Collections.<String>emptyList() : mc().k.c(c.d(), width); // listFormattedStringToWidth(getFormattedText)
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public java.util.List<String> tabHeader(Object overlay, int width) { return wrapped(tabHeader, overlay, width); }
    public java.util.List<String> tabFooter(Object overlay, int width) { return wrapped(tabFooter, overlay, width); }

    /** Integrated server, or an encrypted connection (NetworkManager.getIsencrypted; by reflection, as it extends a Netty class). */
    public boolean tabHeads() {
        if (mc().E()) return true;
        try {
            Object nm = bcy.class.getMethod("a").invoke(mc().u());           // getNetworkManager
            return (Boolean) nm.getClass().getMethod("f").invoke(nm);
        } catch (Exception e) {
            return true;
        }
    }

    public void drawHead(Object info, int x, int y) {
        bdc p = (bdc) info;
        bfl.c(1f, 1f, 1f, 1f);
        bfl.d();                                                          // enableAlpha
        bfl.l();                                                          // enableBlend
        bfl.a(770, 771, 1, 0);
        mc().P().a(p.g());                                                // bindTexture(getLocationSkin)
        avp.a(x, y, 8f, 8f, 8, 8, 8, 8, 64f, 64f);                        // face
        wn e = mc().f.b(p.a().getId());                                   // getPlayerEntityByUUID
        if (e != null && e.a(wo.g)) avp.a(x, y, 40f, 8f, 8, 8, 8, 8, 64f, 64f); // HAT layer
    }

    public int tabScoreWidth(Object scoreboard, Object objective, Object info) {
        if (objective == null) return 0;
        auk o = (auk) objective;
        if (o.e().ordinal() == 1) return 90;                              // HEARTS
        return mc().k.a(" " + ((auo) scoreboard).c(((bdc) info).a().getName(), o).c()); // getValueFromObjective().getScorePoints
    }

    public void tabScore(Object overlay, Object objective, int y, Object info, int x1, int x2) {
        try {
            tabReflect();
            tabScore.invoke(overlay, objective, y, ((bdc) info).a().getName(), x1, x2, info);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public int textWidth(String s) { return mc().k.a(s); }
    public void drawText(String s, float x, float y, int argb) { mc().k.a(s, x, y, argb); }
    public java.util.UUID self() { return mc().h == null ? null : mc().h.aK(); }
    public Object tabOverlay() { return mc().q.h(); }                     // ingameGUI.getTabList

    // ---- pause menu -------------------------------------------------------------------------

    private java.lang.reflect.Field buttonList;

    @SuppressWarnings("unchecked")
    public void addButtons(Object screen, Object[][] buttons) {
        try {
            if (buttonList == null) {
                buttonList = axu.class.getDeclaredField("n");             // buttonList (protected)
                buttonList.setAccessible(true);
            }
            axu s = (axu) screen;
            java.util.List<avs> list = (java.util.List<avs>) buttonList.get(s);
            for (Object[] b : buttons) {
                list.add(new avs((Integer) b[0], s.l / 2 + (Integer) b[1], s.m / 4 + (Integer) b[2], (Integer) b[3], 20, (String) b[4]));
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public int buttonId(Object button) { return ((avs) button).k; }       // id

    public void resourcePacks(Object parent) { mc().a(new azo((axu) parent)); } // GuiScreenResourcePacks

    public void reconnect() {
        bde data = mc().D();
        if (data == null) return;
        mc().f.H();                                                       // sendQuittingDisconnectingPacket
        mc().a((bdb) null);                                               // loadWorld(null)
        mc().a(new awz(new azh(new aya()), mc(), data));                  // GuiConnecting(GuiMultiplayer(GuiMainMenu))
    }

    public void connect(String address) {
        if (mc().f != null) {                                             // leave the world you're in first
            mc().f.H();                                                   // sendQuittingDisconnectingPacket
            mc().a((bdb) null);                                           // loadWorld(null)
        }
        mc().a(new awz(new azh(new aya()), mc(), new bde(address, address, false))); // GuiConnecting(.., ServerData(name, ip, lan))
    }

    public void glErrorChecks(boolean on) {
        try {
            java.lang.reflect.Field f = ave.class.getDeclaredField("U");  // enableGLErrorChecking (private)
            f.setAccessible(true);
            f.setBoolean(mc(), on);
        } catch (Exception e) {
            System.out.println("[Kestrel] GL error checks: " + e);
        }
    }
}
