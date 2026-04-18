// Page: Work Detail
/* global React */

window.WorkDetailPage = function WorkDetailPage({ workId, navigate }) {
  const work = window.AIRCADE_WORKS.find(w => w.id === workId);
  if (!work) {
    return <div className="container" style={{ padding: 80 }}>
      <h2 className="font-display">找不到这个作品</h2>
      <button className="btn btn-ghost mt-4" onClick={() => navigate('home')}>回首页</button>
    </div>;
  }
  const author = window.AIRCADE_AUTHORS.find(a => a.id === work.authorId);
  const moreByAuthor = window.AIRCADE_WORKS
    .filter(w => w.authorId === author.id && w.id !== work.id && w.status === 'live')
    .slice(0, 3);
  const [shot, setShot] = React.useState(0);

  return (
    <div className="page-in container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <button className="btn btn-sm btn-ghost mb-6" onClick={() => navigate('home')}>← 返回</button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 48, alignItems: 'start' }}>
        {/* Left: gallery + description */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <window.TypeChip type={work.type} size="lg" />
            {work.featuredAt && <span className="pill" style={{ background:'color-mix(in oklch, var(--primary) 14%, var(--surface))', color:'var(--primary)' }}>★ 本周精选</span>}
            <span className="micro" style={{ color: 'var(--fg-faint)' }}>#{work.id.toUpperCase()}</span>
          </div>
          <h1 className="font-display" style={{ fontSize: 52, lineHeight: 1.08, margin: '0 0 12px' }}>{work.title}</h1>
          <p style={{ fontSize: 18, color: 'var(--primary)', fontWeight: 600, margin: 0 }}>{work.tagline}</p>

          {/* Cover + thumbs */}
          <div className="mt-6">
            <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
              <window.Cover work={{ ...work, cover: work.screenshots[shot] }} ratio="16 / 10" />
            </div>
            <div className="flex gap-2 mt-3">
              {work.screenshots.map((idx, i) => (
                <button key={i} onClick={() => setShot(i)}
                        style={{
                          flex: 1, padding: 3, borderRadius: 10,
                          border: shot === i ? '2px solid var(--primary)' : '2px solid transparent',
                          background: 'var(--surface)', cursor: 'pointer',
                        }}>
                  <div style={{ borderRadius: 6, overflow: 'hidden' }}>
                    <window.Cover work={{ ...work, cover: idx }} ratio="16 / 10" showEmoji={false} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mt-8">
            <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 10 }}>ABOUT · 关于这个作品</div>
            <p style={{ fontSize: 16, lineHeight: 1.85, color: 'var(--fg-soft)', margin: 0, textWrap:'pretty' }}>{work.description}</p>
            <div className="flex gap-2 mt-6" style={{ flexWrap: 'wrap' }}>
              {work.tags.map(t => <window.TagChip key={t} tag={t} />)}
            </div>
          </div>

          {/* More by author */}
          {moreByAuthor.length > 0 && (
            <div className="mt-8" style={{ paddingTop: 32, borderTop: '1px dashed var(--border)' }}>
              <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 14 }}>MORE BY · 同一作者</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {moreByAuthor.map(w => (
                  <window.WorkCard key={w.id} work={w} onOpen={(wk) => navigate('work', wk.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: action rail */}
        <aside style={{ position: 'sticky', top: 88 }}>
          {/* Author card */}
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div className="flex items-center gap-3">
              <window.Avatar author={author} size={48} />
              <div>
                <div className="font-display" style={{ fontSize: 18 }}>{author.nickname}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>@{author.username}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: '12px 0 0', lineHeight: 1.6 }}>{author.bio}</p>
          </div>

          {/* Action: QR or web */}
          <div className="card" style={{ padding: 22 }}>
            <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 14 }}>
              {work.has === 'miniprogram' ? 'MINI-PROGRAM · 扫码试玩' : 'WEB · 在浏览器打开'}
            </div>
            {work.has === 'miniprogram' ? (
              <div style={{
                aspectRatio: '1 / 1',
                borderRadius: 14,
                background: 'var(--bg-tint)',
                border: '2px dashed var(--border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 80 }}>▦</div>
                <div className="micro" style={{ color: 'var(--fg-faint)', marginTop: 6 }}>WECHAT MP QR</div>
              </div>
            ) : (
              <div style={{
                aspectRatio: '16 / 10',
                borderRadius: 14,
                background: 'var(--bg-tint)',
                border: '2px dashed var(--border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-faint)',
                marginBottom: 14, letterSpacing: '0.14em',
              }}>
                https://{author.username}.aircade.fun/{work.id}
              </div>
            )}
            {work.has === 'web'
              ? <button className="btn btn-primary" style={{ width: '100%' }}>在新窗口打开 ↗</button>
              : <button className="btn btn-ghost" style={{ width: '100%' }}>长按保存小程序码</button>
            }
          </div>

          {/* Stats + actions */}
          <div className="card mt-4" style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)' }} className="micro">LIKES</div>
                <div className="font-display" style={{ fontSize: 24 }}>{work.likes}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)' }} className="micro">VIEWS</div>
                <div className="font-display" style={{ fontSize: 24 }}>{work.views}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)' }} className="micro">上架</div>
                <div className="font-display" style={{ fontSize: 16 }}>{new Date(work.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <window.HeartButton initial={work.likes} size="lg" />
              <button className="btn btn-sm btn-ghost" style={{ flex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                收藏
              </button>
              <button className="btn btn-sm btn-ghost" style={{ flex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
                分享
              </button>
            </div>
          </div>

          <button className="btn btn-sm" style={{ color: 'var(--fg-faint)', marginTop: 14, fontSize: 12 }}>
            举报这个作品
          </button>
        </aside>
      </div>
    </div>
  );
};
