/** A soldier's surname in the cases the battle's lines need: Норкин → Норкина, Норкину; Корочкина → Корочкиной, Корочкину; Седой → Седого, Седому. */
export interface Cases {
  nom: string;
  gen: string;
  dat: string;
  acc: string;
}

export function cases(name: string): Cases {
  if (name.endsWith('а')) {
    const stem = name.slice(0, -1);
    return { nom: name, gen: `${stem}ой`, dat: `${stem}ой`, acc: `${stem}у` };
  }
  if (name.endsWith('ой')) {
    const stem = name.slice(0, -2);
    return { nom: name, gen: `${stem}ого`, dat: `${stem}ому`, acc: `${stem}ого` };
  }
  return { nom: name, gen: `${name}а`, dat: `${name}у`, acc: `${name}а` };
}
