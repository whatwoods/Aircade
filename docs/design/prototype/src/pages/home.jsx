// Page: Home
/* global React */
const { useState: useStateH, useMemo: useMemoH } = React;

window.HomePage = function HomePage({ navigate }) {
  const works = window.AIRCADE_WORKS.filter(w => w.status === 'live');
  const featured = works.filter(w => w.featuredAt).slice(0, 4);
  const latest = [...works].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 9);
  const types = window.AIRCADE_TYPES;

  const stats = useMemoH(() => ({
    works: works.length,
    authors: new Set(works.map(w => w.authorId)).size,
    likes: works.reduce((s,w) => s + w.likes, 0),
    featured: featured.length,
  }), []);

  return (
    <div className="page-in">
      {/* Hero */}
      <section className="hero-bg" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="dither" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div className="scanlines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div className="container" style={{ paddingTop: 72, paddingBottom: 72, position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 56, alignItems: 'center' }}>
            <div>
              <div className="micro" style={{ color: 'var(--primary)', marginBottom: 18 }}>
                AIRCADE · V1.0 · 2026
              </div>
              <h1 className="font-display" style={{ fontSize: 72, lineHeight: 1.05, margin: 0, letterSpacing: 'var(--display-letter)' }}>
                群友造的<br/>
                <span style={{ color: 'var(--primary)' }}>街机厅</span>
                <span style={{ color: 'var(--fg-faint)', fontSize: 32, marginLeft: 12, verticalAlign: 'middle' }}>/ aircade</span>
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--fg-soft)', maxWidth: 520, marginTop: 24 }}>
                一群做 AI 小程序 / 小游戏 / web 玩具的群友，把散落在聊天记录里的作品集中沉淀下来。
                没人做大事，但每一件都认真做过。
              </p>
              <div className="flex gap-3 mt-6">
                <button className="btn btn-lg btn-primary" onClick={() => navigate('register')}>
                  带邀请码注册 →
                </button>
                <button className="btn btn-lg btn-ghost" onClick={() => navigate('discover')}>
                  先看看作品
                </button>
              </div>
              <div className="flex gap-6 mt-8" style={{ paddingTop: 24, borderTop: '1px dashed var(--border)' }}>
                {[
                  ['作品', stats.works],
                  ['群友作者', stats.authors],
                  ['累计点赞', stats.likes],
                  ['精选位', stats.featured],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="font-display" style={{ fontSize: 28, color: 'var(--fg)' }}>{value}</div>
                    <div className="micro" style={{ color: 'var(--fg-faint)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero visual: stacked marquee of covers */}
            <div style={{ position: 'relative', height: 460 }}>
              <HeroStack featured={featured} onOpen={(w) => navigate('work', w.id)} />
            </div>
          </div>
        </div>

        {/* Arcade ticker — only visually prominent in arcade theme */}
        <div className="marquee" style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tint)',
          padding: '12px 0',
        }}>
          <div className="marquee-inner micro" style={{ color: 'var(--fg-soft)' }}>
            {Array(3).fill(null).map((_, i) => (
              <span key={i} style={{ display:'inline-flex', gap:40 }}>
                <span>★ INSERT COIN TO START ★</span>
                <span>◆ 群友 × AI × 街机 ◆</span>
                <span>▲ 15+ 作品等你点赞 ▲</span>
                <span>● 邀请码制 · 群里自取 ●</span>
                <span>◇ MADE WITH CAFFEINE ◇</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="container" style={{ paddingTop: 72 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="micro" style={{ color: 'var(--primary)', marginBottom: 6 }}>FEATURED · 本周精选</div>
            <h2 className="font-display" style={{ fontSize: 36, margin: 0 }}>群主给你挑过的</h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('discover')}>查看全部 →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {featured.map(w => (
            <window.WorkCard key={w.id} work={w} variant="featured" onOpen={(wk) => navigate('work', wk.id)} />
          ))}
        </div>
      </section>

      {/* Type entries */}
      <section className="container" style={{ paddingTop: 60 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="micro" style={{ color: 'var(--primary)', marginBottom: 6 }}>BY TYPE · 按类型逛</div>
            <h2 className="font-display" style={{ fontSize: 28, margin: 0 }}>你今天想玩什么</h2>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {types.map(t => {
            const count = works.filter(w => w.type === t.id).length;
            return (
              <button key={t.id}
                      onClick={() => navigate('discover', t.id)}
                      className="card lift"
                      style={{ padding: 20, textAlign: 'left', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{
                  position: 'absolute', right: -20, top: -20, width: 110, height: 110,
                  borderRadius: '50%', background: t.mood, opacity: 0.55,
                  filter: 'blur(2px)',
                }} />
                <div className="font-display" style={{ fontSize: 24, position: 'relative' }}>{t.label}</div>
                <div className="micro" style={{ color: 'var(--fg-faint)', marginTop: 6, position:'relative' }}>{count} 作品</div>
                <div style={{ position:'relative', marginTop: 30, fontSize: 12, color:'var(--fg-soft)', fontWeight: 600 }}>进入 →</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Latest */}
      <section className="container" style={{ paddingTop: 72 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="micro" style={{ color: 'var(--primary)', marginBottom: 6 }}>LATEST · 最新上架</div>
            <h2 className="font-display" style={{ fontSize: 28, margin: 0 }}>群里刚丢出来的</h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('discover')}>全部作品 →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {latest.map(w => (
            <window.WorkCard key={w.id} work={w} onOpen={(wk) => navigate('work', wk.id)} />
          ))}
        </div>
      </section>

      {/* Join CTA */}
      <section className="container" style={{ paddingTop: 80 }}>
        <div className="card" style={{ padding: 40, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', right: -80, top: -80, width: 320, height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in oklch, var(--primary) 30%, transparent), transparent 70%)',
          }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 32, alignItems: 'center' }}>
            <div>
              <div className="micro" style={{ color: 'var(--primary)' }}>JOIN · 加入我们</div>
              <h2 className="font-display mt-3" style={{ fontSize: 38, margin: '12px 0 0' }}>你也在用 AI 做点小东西？</h2>
              <p style={{ fontSize: 15, color: 'var(--fg-soft)', lineHeight: 1.7, marginTop: 14, maxWidth: 560 }}>
                Aircade V1.0 用邀请码制。如果你已经在群里，管理员会发你；如果你还不在，
                带上一个你最近做的作品来群里打个招呼 —— 我们大概率会留你下来。
              </p>
              <div className="flex gap-3 mt-6">
                <button className="btn btn-lg btn-primary" onClick={() => navigate('register')}>去注册</button>
                <button className="btn btn-lg btn-ghost">扫码进群</button>
              </div>
            </div>
            <div style={{
              aspectRatio: '1 / 1',
              borderRadius: 20,
              border: '2px dashed var(--border-strong)',
              display: 'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              background: 'var(--surface-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)',
              letterSpacing: '0.18em',
            }}>
              <div style={{ fontSize: 60, marginBottom: 10 }}>🎟️</div>
              <div>[ QR / 群二维码占位 ]</div>
              <div style={{ marginTop: 4 }}>WECHAT GROUP QR</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

function HeroStack({ featured, onOpen }) {
  // Three overlapping cards with slight rotations — gallery-like.
  const offsets = [
    { top: 0,   left: 0,   rotate: -4, z: 1 },
    { top: 30,  left: 120, rotate: 3,  z: 3 },
    { top: 70,  left: 40,  rotate: -2, z: 2 },
  ];
  const picks = featured.slice(0, 3);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {picks.map((w, i) => (
        <button key={w.id}
                onClick={() => onOpen(w)}
                className="card lift"
                style={{
                  position: 'absolute',
                  width: 280,
                  padding: 12,
                  top: offsets[i].top,
                  left: `calc(${offsets[i].left}px + 40px)`,
                  transform: `rotate(${offsets[i].rotate}deg)`,
                  zIndex: offsets[i].z,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}>
          <window.Cover work={w} />
          <div style={{ padding: '12px 6px 4px' }}>
            <div className="flex items-center justify-between mb-2">
              <window.TypeChip type={w.type} />
              <span className="micro" style={{ color: 'var(--fg-faint)' }}>精选</span>
            </div>
            <div className="font-display" style={{ fontSize: 17 }}>{w.title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>{w.tagline}</div>
          </div>
        </button>
      ))}
      {/* Floating label */}
      <div style={{
        position: 'absolute', bottom: -20, right: 0,
        padding: '8px 14px',
        background: 'var(--fg)', color: 'var(--bg)',
        borderRadius: 999,
        fontSize: 12, fontWeight: 700,
        fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
        boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
      }}>
        ★ 本周 Top 3
      </div>
    </div>
  );
}
