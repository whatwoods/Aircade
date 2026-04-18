// Page: Admin review queue
/* global React */

window.AdminPage = function AdminPage({ navigate }) {
  const [tab, setTab] = React.useState('pending');
  const [sel, setSel] = React.useState(null);

  const queues = {
    pending: window.AIRCADE_WORKS.filter(w => w.status === 'pending'),
    live:    window.AIRCADE_WORKS.filter(w => w.status === 'live'),
    rejected:window.AIRCADE_WORKS.filter(w => w.status === 'rejected'),
  };
  const items = queues[tab];
  const current = sel ? items.find(w => w.id === sel) : items[0];
  const author = current && window.AIRCADE_AUTHORS.find(a => a.id === current.authorId);

  return (
    <div className="page-in container" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="micro" style={{ color: 'var(--primary)', marginBottom: 6 }}>ADMIN · 群主后台</div>
          <h1 className="font-display" style={{ fontSize: 36, margin: 0 }}>审核队列</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm btn-ghost">邀请码</button>
          <button className="btn btn-sm btn-ghost">精选位</button>
          <button className="btn btn-sm btn-ghost">标签</button>
          <button className="btn btn-sm btn-ghost">用户</button>
        </div>
      </div>

      {/* Admin stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          ['待审核', queues.pending.length, 'var(--primary)'],
          ['今日通过', 4, 'var(--mint)'],
          ['本周上架', 7, 'var(--cream)'],
          ['平均审核用时', '23s', 'var(--pink)'],
        ].map(([k, v, c]) => (
          <div key={k} className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -12, top: -12, width: 48, height: 48, borderRadius: '50%', background: c, opacity: 0.5 }} />
            <div className="micro" style={{ color: 'var(--fg-faint)', position: 'relative' }}>{k}</div>
            <div className="font-display" style={{ fontSize: 28, marginTop: 4, position: 'relative' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        {[['pending','待审核'], ['live','已上架'], ['rejected','已驳回']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setSel(null); }}
                  style={{
                    padding: '10px 18px',
                    fontSize: 14, fontWeight: 600,
                    color: tab === id ? 'var(--fg)' : 'var(--fg-faint)',
                    borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
            {label} <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--fg-faint)' }}>{queues[id].length}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Queue list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(w => {
            const a = window.AIRCADE_AUTHORS.find(x => x.id === w.authorId);
            const active = (current && w.id === current.id);
            return (
              <button key={w.id}
                      onClick={() => setSel(w.id)}
                      className="card"
                      style={{
                        padding: 12, textAlign: 'left', cursor: 'pointer',
                        border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                      }}>
                <div style={{ width: 90, flexShrink: 0 }}>
                  <window.Cover work={w} ratio="4 / 3" showEmoji={false} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <window.TypeChip type={w.type} />
                    <span className="micro" style={{ color: 'var(--fg-faint)' }}>{new Date(w.createdAt).toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' })}</span>
                  </div>
                  <div className="font-display" style={{ fontSize: 16, lineHeight: 1.2, marginBottom: 2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>@{a.username} · {w.tagline}</div>
                </div>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign:'center', color:'var(--fg-faint)' }}>
              队列是空的 🎉
            </div>
          )}
        </div>

        {/* Detail */}
        {current ? (
          <div className="card" style={{ padding: 24 }}>
            <div className="flex items-center gap-3 mb-4">
              <window.Avatar author={author} size={40} />
              <div style={{ flex: 1 }}>
                <div className="font-display" style={{ fontSize: 15 }}>{author.nickname}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>@{author.username} · 历史投稿 3 次 · 通过率 100%</div>
              </div>
              <window.TypeChip type={current.type} size="lg" />
              {tab === 'pending' && <span className="pill" style={{ background: 'var(--cream)' }}>待审核</span>}
              {tab === 'rejected' && <span className="pill" style={{ background:'#fee', color:'#b42' }}>已驳回</span>}
              {tab === 'live' && <span className="pill" style={{ background:'var(--mint)' }}>已上架</span>}
            </div>

            <h2 className="font-display" style={{ fontSize: 30, margin: '0 0 6px' }}>{current.title}</h2>
            <p style={{ fontSize: 16, color: 'var(--primary)', margin: 0, fontWeight: 600 }}>{current.tagline}</p>
            <p style={{ fontSize: 14, color: 'var(--fg-soft)', lineHeight: 1.75, marginTop: 16 }}>{current.description}</p>

            <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
              {current.tags.map(t => <window.TagChip key={t} tag={t} />)}
            </div>

            {/* Screenshots row */}
            <div className="mt-6">
              <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 8 }}>截图 · {current.screenshots.length} 张</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {current.screenshots.slice(0, 4).map((idx, i) => (
                  <div key={i} style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <window.Cover work={{ ...current, cover: idx }} ratio="4 / 3" showEmoji={false} />
                  </div>
                ))}
              </div>
            </div>

            {/* Entry */}
            <div className="mt-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="card" style={{ padding: 14, background: 'var(--surface-soft)' }}>
                <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 6 }}>入口</div>
                <div style={{ fontWeight: 600 }}>
                  {current.has === 'miniprogram' ? '微信小程序码 ▦' : 'Web 链接 ↗'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {current.has === 'web' ? `${author.username}.aircade.fun/${current.id}` : 'QR 已上传'}
                </div>
              </div>
              <div className="card" style={{ padding: 14, background: 'var(--surface-soft)' }}>
                <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 6 }}>审核员备注</div>
                <div style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{current.adminNote || '— 无 —'}</div>
              </div>
            </div>

            {/* Actions */}
            {tab === 'pending' && (
              <div className="mt-6" style={{ paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
                <textarea className="input" rows={2} placeholder="驳回理由（如果驳回，会随站内通知 + 邮件发给作者）" />
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-primary" style={{ flex: 2 }}>
                    ✓ 通过，上架首页
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 1 }}>编辑后通过</button>
                  <button className="btn btn-ghost" style={{ flex: 1, color: '#c33' }}>驳回</button>
                </div>
                <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
                  快捷键：<kbd style={{ background: 'var(--bg-tint)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>J</kbd> 下一条 ·
                  <kbd style={{ background: 'var(--bg-tint)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 4 }}>A</kbd> 通过 ·
                  <kbd style={{ background: 'var(--bg-tint)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 4 }}>R</kbd> 驳回
                </div>
              </div>
            )}

            {tab === 'rejected' && current.rejectReason && (
              <div className="card mt-6" style={{ padding: 14, background: '#fef3f3', borderColor: '#fad' }}>
                <div className="micro" style={{ color: '#b42', marginBottom: 6 }}>REJECT REASON</div>
                <div style={{ color: '#822', fontSize: 14 }}>{current.rejectReason}</div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
