import kestrel.core.Hooks;
import org.lwjgl.input.Mouse;

/** The Right Shift panel as a Minecraft screen (axu = GuiScreen). Drawing and input go to Kestrel. */
public class KestrelScreen extends axu {
    public void b() { Hooks.panelInit(); }                                        // initGui
    public void a(int mouseX, int mouseY, float partialTicks) { Hooks.panelDraw(partialTicks); } // drawScreen
    protected void a(char c, int key) { Hooks.panelKey(c, key); }                 // keyTyped
    protected void a(int mouseX, int mouseY, int button) { Hooks.panelMouse(button, true); }  // mouseClicked
    protected void b(int mouseX, int mouseY, int button) { Hooks.panelMouse(button, false); } // mouseReleased
    public void e() { Hooks.panelTick(); }                                         // updateScreen
    public boolean d() { return false; }                                          // doesGuiPauseGame
    public void m() { Hooks.panelClosed(); }                                      // onGuiClosed

    public void k() {                                                             // handleMouseInput
        super.k();
        int wheel = Mouse.getEventDWheel();
        if (wheel != 0) Hooks.panelScroll(wheel);
    }
}
