package kestrel.core;

import java.lang.instrument.ClassFileTransformer;
import java.security.ProtectionDomain;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Label;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

/**
 * Adds three small calls into Minecraft 1.8.9 (obfuscated names):
 *   aya.a(IIF)V  GuiMainMenu.drawScreen    -> if (Hooks.menuDraw(...)) return;
 *   aya.a(III)V  GuiMainMenu.mouseClicked  -> if (Hooks.menuClick(...)) return;
 *   avo.a(F)V    GuiIngame.renderGameOverlay -> Hooks.hud(partialTicks) before returning
 */
final class Patcher implements ClassFileTransformer {
    private volatile boolean excluded;

    @Override
    public byte[] transform(ClassLoader loader, String name, Class<?> redefining, ProtectionDomain domain, byte[] bytes) {
        // With OptiFine the game runs in LaunchWrapper's class loader. Kestrel's own classes must
        // come from the normal class loader there, so both sides share one copy.
        if (!excluded && loader != null && loader.getClass().getName().equals("net.minecraft.launchwrapper.LaunchClassLoader")) {
            excluded = true;
            try {
                loader.getClass().getMethod("addClassLoaderExclusion", String.class).invoke(loader, "kestrel.core.");
            } catch (Throwable t) {
                Log.error("LaunchWrapper setup", t);
            }
        }
        if (name == null) return null;
        if (!CLASSES.contains(name)) return null;
        try {
            if (name.equals("aya") || name.equals("avo")) Hooks.loader = loader != null ? loader : ClassLoader.getSystemClassLoader();
            byte[] out = patch(name, bytes);
            Log.info("hooked " + name);
            return out;
        } catch (Throwable t) {
            Log.error("hooking " + name, t);
            return null;
        }
    }

    private static byte[] patch(final String cls, byte[] bytes) {
        ClassReader reader = new ClassReader(bytes);
        ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
        final int[] version = {0};
        reader.accept(new ClassVisitor(Opcodes.ASM5, writer) {
            @Override
            public void visit(int v, int access, String n, String sig, String sup, String[] ifs) {
                version[0] = v & 0xFFFF;
                super.visit(v, access, n, sig, sup, ifs);
            }

            @Override
            public MethodVisitor visitMethod(int access, String n, String desc, String sig, String[] ex) {
                MethodVisitor mv = super.visitMethod(access, n, desc, sig, ex);
                if (cls.equals("aya") && n.equals("a") && desc.equals("(IIF)V")) {
                    return head(mv, version[0], "menuDraw", "(Ljava/lang/Object;IIF)Z", Opcodes.ILOAD, Opcodes.ILOAD, Opcodes.FLOAD);
                }
                if (cls.equals("aya") && n.equals("a") && desc.equals("(III)V")) {
                    return head(mv, version[0], "menuClick", "(Ljava/lang/Object;III)Z", Opcodes.ILOAD, Opcodes.ILOAD, Opcodes.ILOAD);
                }
                // GlStateManager (bfl): keep Mat's matrix copy in step, answer matrix readbacks from it.
                if (cls.equals("bfl")) {
                    String mirror = BFL.get(n + desc);
                    if (mirror != null) return call(mv, mirror, desc);
                    if (n.equals("a") && desc.equals("(ILjava/nio/FloatBuffer;)V")) {
                        return head(mv, version[0], -1, "getFloat", "(ILjava/nio/FloatBuffer;)Z", "kestrel/core/Mat");
                    }
                }
                if (cls.equals(PROJECT) && n.equals("gluPerspective")) return call(mv, "perspective", desc);
                // RenderManager.shouldRender: false for entities hidden behind blocks.
                if (cls.equals("biu") && n.equals("a") && desc.equals("(Lpk;Lbia;DDD)Z")) {
                    return headReturn(mv, version[0], "skipEntity", "(Ljava/lang/Object;Ljava/lang/Object;)Z", "kestrel/core/Hooks", Opcodes.ICONST_0, Opcodes.ALOAD);
                }
                // TileEntityRendererDispatcher.renderTileEntity: skip block entities hidden behind blocks.
                if (cls.equals("bhc") && n.equals("a") && desc.equals("(Lakw;FI)V")) {
                    return head(mv, version[0], "skipTile", "(Ljava/lang/Object;Ljava/lang/Object;FI)Z", Opcodes.ALOAD, Opcodes.FLOAD, Opcodes.ILOAD);
                }
                // RenderGlobal.renderCloudsFancy: cached cloud geometry.
                if (cls.equals("bfr") && n.equals("c") && desc.equals("(FI)V")) {
                    return head(mv, version[0], "clouds", "(Ljava/lang/Object;FI)Z", Opcodes.FLOAD, Opcodes.ILOAD);
                }
                // WorldVertexBufferUploader.draw: optionally through Kestrel's streaming buffer.
                if (cls.equals("bfe") && n.equals("a") && desc.equals("(Lbfd;)V")) {
                    return head(mv, version[0], "draw", "(Ljava/lang/Object;Ljava/lang/Object;)Z", Opcodes.ALOAD);
                }
                // ActiveRenderInfo reads the viewport straight from GL11.
                if (cls.equals("auz")) {
                    return new MethodVisitor(Opcodes.ASM5, mv) {
                        @Override
                        public void visitMethodInsn(int op, String owner, String name, String d, boolean itf) {
                            if (owner.equals("org/lwjgl/opengl/GL11") && name.equals("glGetInteger") && d.equals("(ILjava/nio/IntBuffer;)V")) owner = "kestrel/core/Mat";
                            super.visitMethodInsn(op, owner, name, d, itf);
                        }
                    };
                }
                // ---- gameplay mods ----
                // Minecraft.runTick: mod ticks.
                if (cls.equals("ave") && n.equals("s") && desc.equals("()V")) return pre(mv, "tick");
                // EntityRenderer.getFOVModifier(partialTicks, useFOVSetting): zoom.
                if (cls.equals("bfk") && n.equals("a") && desc.equals("(FZ)F")) {
                    return wrapReturn(mv, Opcodes.FRETURN, "fov", "(FZ)F", null, Opcodes.ILOAD, 2);
                }
                // EntityRenderer.hurtCameraEffect: no hurt shake.
                if (cls.equals("bfk") && n.equals("d") && desc.equals("(F)V")) {
                    return head(mv, version[0], "hurtShake", "(Ljava/lang/Object;F)Z", Opcodes.FLOAD);
                }
                // RendererLivingEntity.setBrightness: hit colour (the four puts of the red tint).
                if (cls.equals("bjl") && n.equals("a") && desc.equals("(Lpr;FZ)Z")) {
                    return new MethodVisitor(Opcodes.ASM5, mv) {
                        int puts;

                        @Override
                        public void visitMethodInsn(int op, String owner, String name, String d, boolean itf) {
                            if (puts < 4 && owner.equals("java/nio/FloatBuffer") && name.equals("put") && d.equals("(F)Ljava/nio/FloatBuffer;")) {
                                super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Hooks", "hurt" + puts++, "(Ljava/nio/FloatBuffer;F)Ljava/nio/FloatBuffer;", false);
                                return;
                            }
                            super.visitMethodInsn(op, owner, name, d, itf);
                        }
                    };
                }
                // AbstractClientPlayer.getLocationCape: Kestrel capes.
                if (cls.equals("bet") && n.equals("k") && desc.equals("()Ljy;")) {
                    return wrapReturn(mv, Opcodes.ARETURN, "cape", "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;", "jy", Opcodes.ALOAD, 0);
                }
                // LayerCape.doRenderLayer: cloth capes.
                if (cls.equals("bkp") && n.equals("a") && desc.equals("(Lbet;FFFFFFF)V")) {
                    return head(mv, version[0], "capeLayer", "(Ljava/lang/Object;Ljava/lang/Object;FFF)Z", Opcodes.ALOAD, Opcodes.FLOAD, Opcodes.FLOAD, Opcodes.FLOAD);
                }
                // GuiIngame.showCrosshair: Kestrel's crosshair replaces vanilla's.
                if (cls.equals("avo") && n.equals("b") && desc.equals("()Z")) {
                    return wrapReturn(mv, Opcodes.IRETURN, "crosshair", "(Z)Z", null);
                }
                // RenderGlobal.drawSelectionBox: block outline.
                if (cls.equals("bfr") && n.equals("a") && desc.equals("(Lwn;Lauh;IF)V")) {
                    return head(mv, version[0], "outline", "(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;IF)Z", Opcodes.ALOAD, Opcodes.ALOAD, Opcodes.ILOAD, Opcodes.FLOAD);
                }
                // ScreenShotHelper.saveScreenshot: Kestrel's chat message with buttons.
                if (cls.equals("avj") && n.equals("a") && desc.equals("(Ljava/io/File;Ljava/lang/String;IILbfw;)Leu;")) {
                    return wrapReturn(mv, Opcodes.ARETURN, "screenshot", "(Ljava/lang/Object;)Ljava/lang/Object;", "eu");
                }
                // EntityPlayerSP.sendChatMessage: /kestrel commands.
                if (cls.equals("bew") && n.equals("e") && desc.equals("(Ljava/lang/String;)V")) {
                    return head(mv, version[0], "send", "(Ljava/lang/Object;Ljava/lang/String;)Z", Opcodes.ALOAD);
                }
                // GuiNewChat.printChatMessageWithOptionalDeletion and drawChat.
                if (cls.equals("avt") && n.equals("a") && desc.equals("(Leu;I)V")) {
                    return head(mv, version[0], "chat", "(Ljava/lang/Object;Ljava/lang/Object;I)Z", Opcodes.ALOAD, Opcodes.ILOAD);
                }
                if (cls.equals("avt") && n.equals("a") && desc.equals("(I)V")) {
                    return head(mv, version[0], "drawChat", "(Ljava/lang/Object;I)Z", Opcodes.ILOAD);
                }
                // GuiChat: keys (search), right-click (copy), drawing (search label).
                if (cls.equals("awv") && n.equals("a") && desc.equals("(CI)V")) {
                    return head(mv, version[0], "chatKey", "(Ljava/lang/Object;CI)Z", Opcodes.ILOAD, Opcodes.ILOAD);
                }
                if (cls.equals("awv") && n.equals("a") && desc.equals("(III)V")) {
                    return head(mv, version[0], "chatClick", "(Ljava/lang/Object;III)Z", Opcodes.ILOAD, Opcodes.ILOAD, Opcodes.ILOAD);
                }
                if (cls.equals("awv") && n.equals("a") && desc.equals("(IIF)V")) return tail(mv, "chatDrawn");
                // GuiIngameMenu: shortcut buttons.
                if (cls.equals("axp") && n.equals("b") && desc.equals("()V")) return tail(mv, "pauseInit");
                if (cls.equals("axp") && n.equals("a") && desc.equals("(Lavs;)V")) {
                    return head(mv, version[0], "pauseAction", "(Ljava/lang/Object;Ljava/lang/Object;)Z", Opcodes.ALOAD);
                }
                // GuiPlayerTabOverlay.renderPlayerlist: Kestrel's Tab list.
                if (cls.equals("awh") && n.equals("a") && desc.equals("(ILauo;Lauk;)V")) {
                    return head(mv, version[0], "tabList", "(Ljava/lang/Object;ILjava/lang/Object;Ljava/lang/Object;)Z", Opcodes.ILOAD, Opcodes.ALOAD, Opcodes.ALOAD);
                }
                // NetHandlerPlayClient.handleTimeUpdate: TPS.
                if (cls.equals("bcy") && n.equals("a") && desc.equals("(Lhu;)V")) {
                    return head(mv, version[0], "timeUpdate", "(Ljava/lang/Object;Ljava/lang/Object;)Z", Opcodes.ALOAD);
                }
                if (cls.equals("avo") && n.equals("a") && desc.equals("(F)V")) {
                    return new MethodVisitor(Opcodes.ASM5, mv) {
                        @Override
                        public void visitInsn(int op) {
                            if (op == Opcodes.RETURN) {
                                super.visitVarInsn(Opcodes.FLOAD, 1);
                                super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Hooks", "hud", "(F)V", false);
                            }
                            super.visitInsn(op);
                        }
                    };
                }
                return mv;
            }
        }, 0);
        return writer.toByteArray();
    }

    private static final String PROJECT = "org/lwjgl/util/glu/Project";
    private static final java.util.Set<String> CLASSES = new java.util.HashSet<String>(java.util.Arrays.asList(
            "aya", "avo", "bfl", "auz", "bfe", "bfr", "biu", "bhc", PROJECT,
            "ave", "bfk", "bjl", "avj", "bew", "avt", "awv", "axp", "bcy", "awh", "bet", "bkp"));

    /** At the start of the method: Hooks.hook(); */
    private static MethodVisitor pre(MethodVisitor mv, final String hook) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitCode() {
                super.visitCode();
                super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Hooks", hook, "()V", false);
            }
        };
    }

    /** Before each RETURN: Hooks.hook(this); */
    private static MethodVisitor tail(MethodVisitor mv, final String hook) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitInsn(int op) {
                if (op == Opcodes.RETURN) {
                    super.visitVarInsn(Opcodes.ALOAD, 0);
                    super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Hooks", hook, "(Ljava/lang/Object;)V", false);
                }
                super.visitInsn(op);
            }
        };
    }

    /**
     * Before each `ret` instruction: value = Hooks.hook(value, args...); `args` are (load opcode, slot)
     * pairs; `cast` is the class to cast an object result back to.
     */
    private static MethodVisitor wrapReturn(MethodVisitor mv, final int ret, final String hook, final String desc, final String cast, final int... args) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitInsn(int op) {
                if (op == ret) {
                    for (int i = 0; i < args.length; i += 2) super.visitVarInsn(args[i], args[i + 1]);
                    super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Hooks", hook, desc, false);
                    if (cast != null) super.visitTypeInsn(Opcodes.CHECKCAST, cast);
                }
                super.visitInsn(op);
            }
        };
    }
    /** GlStateManager methods (obfuscated name + descriptor) mirrored into Mat. */
    private static final java.util.Map<String, String> BFL = new java.util.HashMap<String, String>();
    static {
        BFL.put("n(I)V", "matrixMode");
        BFL.put("D()V", "loadIdentity");
        BFL.put("E()V", "pushMatrix");
        BFL.put("F()V", "popMatrix");
        BFL.put("b(FFF)V", "translate");
        BFL.put("b(DDD)V", "translate");
        BFL.put("a(FFF)V", "scale");
        BFL.put("a(DDD)V", "scale");
        BFL.put("b(FFFF)V", "rotate");
        BFL.put("a(Ljava/nio/FloatBuffer;)V", "multMatrix");
        BFL.put("a(DDDDDD)V", "ortho");
        BFL.put("b(IIII)V", "viewport");
    }

    /** At the start of a static method: Mat.mirror(same args); then the original code runs. */
    private static MethodVisitor call(MethodVisitor mv, final String mirror, final String desc) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitCode() {
                super.visitCode();
                int slot = 0;
                for (Type t : Type.getArgumentTypes(desc)) {
                    super.visitVarInsn(t.getOpcode(Opcodes.ILOAD), slot);
                    slot += t.getSize();
                }
                super.visitMethodInsn(Opcodes.INVOKESTATIC, "kestrel/core/Mat", mirror, desc, false);
            }
        };
    }

    /** At the start of the method: if (Hooks.hook(this, args...)) return; */
    private static MethodVisitor head(MethodVisitor mv, final int version, final String hook, final String desc, final int... loads) {
        return head(mv, version, 0, hook, desc, "kestrel/core/Hooks", loads);
    }

    /**
     * For instance methods returning boolean: if (owner.hook(this, args...)) return (value);  `value` is
     * ICONST_0 or ICONST_1; `loads` are the opcodes for the leading arguments passed on.
     */
    private static MethodVisitor headReturn(MethodVisitor mv, final int version, final String hook, final String desc, final String owner, final int value, final int... loads) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitCode() {
                super.visitCode();
                super.visitVarInsn(Opcodes.ALOAD, 0);
                int slot = 1;
                for (int op : loads) {
                    super.visitVarInsn(op, slot);
                    slot += (op == Opcodes.DLOAD || op == Opcodes.LLOAD) ? 2 : 1;
                }
                super.visitMethodInsn(Opcodes.INVOKESTATIC, owner, hook, desc, false);
                Label vanilla = new Label();
                super.visitJumpInsn(Opcodes.IFEQ, vanilla);
                super.visitInsn(value);
                super.visitInsn(Opcodes.IRETURN);
                super.visitLabel(vanilla);
                if (version >= 50) super.visitFrame(Opcodes.F_SAME, 0, null, 0, null);
            }
        };
    }

    /**
     * At the start of the method: if (owner.hook(args...)) return;  With self = 0 the first argument
     * is `this`; with self = -1 (static methods) the arguments come straight from the descriptor.
     */
    private static MethodVisitor head(MethodVisitor mv, final int version, final int self, final String hook, final String desc, final String owner, final int... loads) {
        return new MethodVisitor(Opcodes.ASM5, mv) {
            @Override
            public void visitCode() {
                super.visitCode();
                if (self == 0) {
                    super.visitVarInsn(Opcodes.ALOAD, 0);
                    int slot = 1;
                    for (int op : loads) {
                        super.visitVarInsn(op, slot);
                        slot += (op == Opcodes.DLOAD || op == Opcodes.LLOAD) ? 2 : 1; // doubles and longs take two slots
                    }
                } else {
                    int slot = 0;
                    for (Type t : Type.getArgumentTypes(desc)) {
                        super.visitVarInsn(t.getOpcode(Opcodes.ILOAD), slot);
                        slot += t.getSize();
                    }
                }
                super.visitMethodInsn(Opcodes.INVOKESTATIC, owner, hook, desc, false);
                Label vanilla = new Label();
                super.visitJumpInsn(Opcodes.IFEQ, vanilla);
                super.visitInsn(Opcodes.RETURN);
                super.visitLabel(vanilla);
                if (version >= 50) super.visitFrame(Opcodes.F_SAME, 0, null, 0, null);
            }
        };
    }
}
