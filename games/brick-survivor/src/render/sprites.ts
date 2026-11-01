// Sprite registry: every baked frame, filled in stages so the title stays responsive (docs §9.7).
import { Atlas } from './atlas';
import { bakeEntities } from './bake/entities';
import type { EntitySprites } from './bake/entities';
import { bakeShapes } from './bake/shapes';
import type { ShapeSprites } from './bake/shapes';
import { bakeText } from './bake/text';
import type { TextSprites } from './bake/text';

export type Sprites = ShapeSprites & EntitySprites & { text: TextSprites };

export const atlas = { current: null as Atlas | null };

/** bake everything in a few chunks, yielding between them; resolves with the registry */
export async function bakeAll(): Promise<{ atlas: Atlas; spr: Sprites }> {
  const a = new Atlas();
  atlas.current = a;
  const yieldFrame = (): Promise<void> =>
    new Promise((res) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (ric) ric(() => res(), { timeout: 60 });
      else setTimeout(res, 0);
    });
  const shapes = bakeShapes(a);
  await yieldFrame();
  const ent = bakeEntities(a);
  await yieldFrame();
  const text = bakeText(a);
  const spr: Sprites = { ...shapes, ...ent, text };
  return { atlas: a, spr };
}
