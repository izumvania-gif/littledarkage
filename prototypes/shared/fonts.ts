import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import { wait } from './dom.ts';

/** Canvas text uses whatever font is loaded at that moment, so the Cyrillic faces load first (3 s at most). */
export async function fontsReady(): Promise<void> {
  if (!document.fonts) return;
  const faces = ['28px "Rubik Mono One"', '17px "PT Mono"', '17px "PT Serif"', '700 17px "PT Serif"', '22px "Bad Script"'];
  await Promise.race([Promise.allSettled(faces.map((f) => document.fonts.load(f, 'ДОЛОЙ Смирно ёж'))), wait(3000)]);
}
