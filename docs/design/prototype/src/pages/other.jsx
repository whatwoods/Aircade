// Pages: Login, Register, Account, Discover
/* global React */

window.LoginPage = function LoginPage({ navigate, onLogin }) {
  const [form, setForm] = React.useState({ username: '', password: '' });
  return (
    <div className="page-in" style={{ minHeight: 'calc(100vh - 64px)', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, maxWidth: 960, width: '100%', alignItems: 'center' }}>
        {/* Left: brand */}
        <div>
          <div className="micro" style={{ color: 'var(--primary)', marginBottom: 10 }}>WELCOME BACK</div>
          <h1 className="font-display" style={{ fontSize: 56, margin: 0, lineHeight: 1.05 }}>
            回街机厅<br/>继续玩
          </h1>
          <p style={{ color: 'var(--fg-soft)', marginTop: 14, fontSize: 15, lineHeight: 1.7 }}>
            点赞收藏、提交作品、看别人最近又整了什么活。
          </p>
          <div className="card mt-6" style={{ padding: 14, display:'flex', gap:12, alignItems:'center', fontSize: 13 }}>
            <div style={{ fontSize: 24 }}>🔑</div>
            <div>
              <div style={{ fontWeight: 600 }}>忘了密码？</div>
              <div style={{ color: 'var(--fg-faint)' }}>V1.0 先联系群主重置，V1.1 会有邮箱验证。</div>
            </div>
          </div>
        </div>
        {/* Right: form */}
        <form className="card" style={{ padding: 32 }} onSubmit={(e) => { e.preventDefault(); onLogin(); navigate('home'); }}>
          <div className="font-display" style={{ fontSize: 24, marginBottom: 4 }}>登录</div>
          <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 20 }}>用户名 + 密码。5 次失败锁 30 分钟。</div>
          <div className="stack" style={{ '--stack-gap': '14px' }}>
            <div>
              <label className="label">用户名</label>
              <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="way" />
            </div>
            <div>
              <label className="label">密码</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="≥8 位" />
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize: 13, color: 'var(--fg-soft)' }}>
              <input type="checkbox" defaultChecked /> 记住我 30 天
            </label>
          </div>
          <button className="btn btn-primary mt-6" style={{ width: '100%' }} type="submit">登录 →</button>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--fg-soft)' }}>
            还没有账号？<a onClick={() => navigate('register')} style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>带邀请码注册</a>
          </div>
        </form>
      </div>
    </div>
  );
};

window.RegisterPage = function RegisterPage({ navigate, onLogin }) {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({ invite: '', username: '', password: '', email: '' });
  const [check, setCheck] = React.useState(null);

  const verifyInvite = () => {
    // Fake verify
    if (form.invite.trim().length >= 6) setCheck('ok'); else setCheck('bad');
    setTimeout(() => { if (form.invite.trim().length >= 6) setStep(2); }, 300);
  };

  return (
    <div className="page-in" style={{ minHeight: 'calc(100vh - 64px)', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, maxWidth: 960, width: '100%', alignItems: 'center' }}>
        <div>
          <div className="micro" style={{ color: 'var(--primary)', marginBottom: 10 }}>INVITE-ONLY · V1.0</div>
          <h1 className="font-display" style={{ fontSize: 56, margin: 0, lineHeight: 1.05 }}>
            拿邀请码<br/>进群友街机厅
          </h1>
          <p style={{ color: 'var(--fg-soft)', marginTop: 14, fontSize: 15, lineHeight: 1.7, maxWidth: 380 }}>
            V1.0 只开放给群友。邀请码在 AI 做游戏群里自取，一个码只能用一次。
          </p>
          <div className="flex gap-3 mt-6">
            {[1, 2, 3].map(n => (
              <div key={n} style={{
                flex: 1,
                height: 4, borderRadius: 999,
                background: n <= step ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
          <div className="micro mt-3" style={{ color: 'var(--fg-faint)' }}>STEP {step} / 3</div>
        </div>

        <form className="card" style={{ padding: 32 }} onSubmit={(e) => { e.preventDefault(); if (step < 3) setStep(step + 1); else { onLogin(); navigate('home'); } }}>
          {step === 1 && (
            <>
              <div className="font-display" style={{ fontSize: 22, marginBottom: 6 }}>① 输入邀请码</div>
              <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 18 }}>AIRCADE-XXXX-XXX 格式。</div>
              <input className="input" placeholder="AIRCADE-DEV-001"
                     style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
                     value={form.invite} onChange={e => { setForm({ ...form, invite: e.target.value }); setCheck(null); }} />
              {check === 'ok' && <div className="hint" style={{ color: '#2a8', marginTop: 10 }}>✓ 邀请码可用，进入下一步…</div>}
              {check === 'bad' && <div className="hint" style={{ color: '#c33', marginTop: 10 }}>× 邀请码不存在、已被用掉或已过期。</div>}
              <button type="button" onClick={verifyInvite} className="btn btn-primary mt-6" style={{ width: '100%' }}>核验邀请码 →</button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="font-display" style={{ fontSize: 22, marginBottom: 6 }}>② 设定账号</div>
              <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 18 }}>用户名唯一，3-20 字符。</div>
              <div className="stack" style={{ '--stack-gap': '14px' }}>
                <div>
                  <label className="label">用户名</label>
                  <input className="input" placeholder="way" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                  <div className="hint">字母 / 数字 / 下划线 / 中文，不可改。</div>
                </div>
                <div>
                  <label className="label">密码</label>
                  <input className="input" type="password" placeholder="≥8 位" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary mt-6" style={{ width: '100%' }}>下一步 →</button>
            </>
          )}
          {step === 3 && (
            <>
              <div className="font-display" style={{ fontSize: 22, marginBottom: 6 }}>③ 邮箱（选填）</div>
              <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 18 }}>只用于找回密码和审核通知。V1.0 不做邮箱验证。</div>
              <input className="input" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize: 13, color: 'var(--fg-soft)', marginTop: 14 }}>
                <input type="checkbox" defaultChecked /> 我已阅读《内容规范》和《隐私政策》
              </label>
              <button type="submit" className="btn btn-primary mt-6" style={{ width: '100%' }}>完成注册 ✓</button>
            </>
          )}
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--fg-soft)' }}>
            已经有账号？<a onClick={() => navigate('login')} style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>直接登录</a>
          </div>
        </form>
      </div>
    </div>
  );
};

window.DiscoverPage = function DiscoverPage({ navigate, initialType }) {
  const [type, setType] = React.useState(initialType || 'all');
  const [sort, setSort] = React.useState('latest');
  const [tags, setTags] = React.useState([]);

  const works = window.AIRCADE_WORKS.filter(w => w.status === 'live')
    .filter(w => type === 'all' || w.type === type)
    .filter(w => tags.length === 0 || tags.every(t => w.tags.includes(t)));

  const sorted = [...works].sort((a, b) => {
    if (sort === 'hot') return b.likes - a.likes;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const toggleTag = (t) => setTags(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]);

  return (
    <div className="page-in container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="micro" style={{ color: 'var(--primary)', marginBottom: 6 }}>DISCOVER · 发现</div>
          <h1 className="font-display" style={{ fontSize: 40, margin: 0 }}>逛一圈</h1>
        </div>
        <div className="flex gap-2">
          {[['latest','最新'], ['hot','最热']].map(([id, label]) => (
            <button key={id} onClick={() => setSort(id)}
                    className="btn btn-sm"
                    style={{
                      background: sort === id ? 'var(--fg)' : 'var(--surface)',
                      color: sort === id ? 'var(--bg)' : 'var(--fg)',
                      border: '1px solid var(--border)',
                    }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div className="flex items-center gap-4 mb-3">
          <span className="micro" style={{ color: 'var(--fg-faint)' }}>类型</span>
          <div className="flex gap-2" style={{ flexWrap:'wrap' }}>
            {[{id:'all', label:'全部'}, ...window.AIRCADE_TYPES].map(t => (
              <button key={t.id} onClick={() => setType(t.id)} className="pill"
                      style={{
                        cursor:'pointer',
                        background: type === t.id ? 'var(--fg)' : 'var(--surface)',
                        color: type === t.id ? 'var(--bg)' : 'var(--fg)',
                        borderColor: type === t.id ? 'var(--fg)' : 'var(--border)',
                        fontSize: 13, padding: '7px 12px',
                      }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="micro" style={{ color: 'var(--fg-faint)' }}>标签</span>
          <div className="flex gap-2" style={{ flexWrap:'wrap' }}>
            {window.AIRCADE_TAGS.map(t => (
              <window.TagChip key={t} tag={t} active={tags.includes(t)} onClick={() => toggleTag(t)} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 16 }}>{sorted.length} 个作品</div>

      {sorted.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {sorted.map(w => <window.WorkCard key={w.id} work={w} onOpen={(wk) => navigate('work', wk.id)} />)}
        </div>
      ) : (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦖</div>
          <div className="font-display" style={{ fontSize: 20 }}>这里没有符合条件的作品</div>
          <div style={{ color: 'var(--fg-soft)', marginTop: 6, fontSize: 14 }}>改改筛选，或去<a style={{ color:'var(--primary)' }} onClick={() => navigate('submit')}>提交一个</a>。</div>
        </div>
      )}
    </div>
  );
};

window.AccountPage = function AccountPage({ navigate, user, onLogout }) {
  const mySubmissions = window.AIRCADE_WORKS.filter(w => w.authorId === 'u1');
  return (
    <div className="page-in container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div className="flex items-center gap-4 mb-6">
        <window.Avatar author={user} size={72} />
        <div style={{ flex: 1 }}>
          <div className="font-display" style={{ fontSize: 32 }}>{user.nickname}</div>
          <div style={{ color: 'var(--fg-faint)', fontSize: 13 }}>@{user.username} · /u/{user.username}</div>
        </div>
        <button className="btn btn-ghost" onClick={onLogout}>退出登录</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28 }}>
        <aside className="card" style={{ padding: 14 }}>
          {['我提交的作品', '我的收藏', '账号设置', '通知'].map((x, i) => (
            <div key={x} style={{
              padding: '10px 12px', borderRadius: 10,
              background: i === 0 ? 'var(--bg-tint)' : 'transparent',
              color: i === 0 ? 'var(--fg)' : 'var(--fg-soft)',
              fontWeight: i === 0 ? 600 : 500,
              cursor: 'pointer',
              fontSize: 14,
            }}>
              {x}
            </div>
          ))}
        </aside>
        <div>
          <div className="font-display mb-4" style={{ fontSize: 24 }}>我提交的作品</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {mySubmissions.map(w => (
              <window.WorkCard key={w.id} work={w} onOpen={(wk) => navigate('work', wk.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
