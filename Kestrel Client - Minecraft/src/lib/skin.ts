/** Cuts a player's head (face + hat layer) out of their skin texture, as a sharp 64×64 data URL. */
export async function headFromSkin(skin: string): Promise<string> {
  const img = new Image();
  img.src = skin;
  await img.decode();
  const k = img.naturalWidth / 64; // HD skins scale the 64x64 layout
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 8 * k, 8 * k, 8 * k, 8 * k, 0, 0, 64, 64); // face
  g.drawImage(img, 40 * k, 8 * k, 8 * k, 8 * k, 0, 0, 64, 64); // hat layer
  return c.toDataURL("image/png");
}
