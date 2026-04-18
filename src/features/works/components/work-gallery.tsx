'use client';

import { useState } from 'react';
import { Cover } from '@/components/brand';
import type { WorkDetail } from '../server/works';

export function WorkGallery({ work }: { work: WorkDetail }) {
  const shots = work.screenshots;
  const [active, setActive] = useState(0);
  const seed = `${work.id}-${work.type}`;
  const mainImage = shots[active] ?? work.coverUrl ?? null;

  return (
    <div>
      <div className="overflow-hidden rounded-[22px]">
        <Cover
          seed={`${seed}-${active}`}
          coverUrl={mainImage}
          ratio="16 / 10"
        />
      </div>

      {shots.length > 1 ? (
        <div
          className="mt-3 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${shots.length}, minmax(0,1fr))`,
          }}
        >
          {shots.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className="rounded-[12px] p-[3px] transition-colors focus-visible:outline-none"
              aria-label={`查看第 ${i + 1} 张截图`}
              aria-pressed={active === i}
              title={`查看第 ${i + 1} 张截图`}
              style={{
                border:
                  active === i
                    ? '2px solid var(--ac-primary)'
                    : '2px solid transparent',
                background: 'var(--ac-surface)',
              }}
            >
              <div className="overflow-hidden rounded-[8px]">
                <Cover
                  seed={`${seed}-thumb-${i}`}
                  coverUrl={src}
                  ratio="16 / 10"
                  hideEmoji
                />
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
