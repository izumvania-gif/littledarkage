/** Reference frame: scenes are drawn at 1280×720 and scaled to fit the window (letterboxed). */
export const REF_W = 1280;
export const REF_H = 720;

/** The ROSTA frame: picture above, caption below. The DOM caption plate sits exactly over the caption band. */
export const CAPTION_TOP = 540;

/** The poster layer: flat ROSTA colours. */
export const POSTER = {
  cream: 0xeadfc6,
  black: 0x1c1a18,
  red: 0xc62f24,
  rim: 0xf2ead8,
} as const;

/** The truth layer: perekladka cut-outs in fog under one lamp. */
export const TRUTH = {
  wallTop: '#3d434b',
  wallBottom: '#5a4a3c',
  floor: 0x33291f,
  cut: 0x2a2622,
  eye: 0xd8cbb0,
  strip: 0x6e6458,
  lamp: [232, 197, 138] as const,
  fog: [200, 206, 212] as const,
} as const;

/** Letterbox colour around the frame. */
export const MATTE = 0x0f0e0d;
