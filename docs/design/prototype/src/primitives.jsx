// Aircade shared primitives: Cover, WorkCard, Navbar, Avatar, TypeChip, HeartButton
/* global React */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ----- TypeChip -----
window.TypeChip = function TypeChip({ type, size = 'sm' }) {
  const map = { game:'游戏', tool:'工具', social:'社交', ai:'AI 应用', other:'其他' };
  const cls = `type-${type}`;
  return (
    <span className={`pill ${cls}`} style={{ fontSize: size === 'lg' ? 13 : 11 }}>
      {map[type] || type}
    </span>
  );
};

// ----- Avatar -----
window.Avatar = function Avatar({ author, size = 36 }) {
  const initials = (author.nickname || author.username).slice(0, 1);
  return (
    <div
      aria-label={author.nickname}
      style={{
        width: size, height: size,
        borderRadius: '50%',
        background: `conic-gradient(from 200deg, hsl(${author.avatarHue} 80% 78%), hsl(${(author.avatarHue+60)%360} 75% 70%), hsl(${author.avatarHue} 80% 78%))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#3D2E1F', fontWeight: 700, fontSize: size * 0.42,
        border: '2px solid var(--surface)',
        boxShadow: '0 4px 10px rgba(61,46,31,0.12)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
};

// ----- Cover -----
window.Cover = function Cover({ work, ratio = '4 / 3', pixel = false, showEmoji = true }) {
  const themes = window.AIRCADE_COVER_THEMES;
  const t = themes[work.cover % themes.length];
  return (
    <div className={`cover ${pixel ? 'pixelated' : ''}`}
         style={{ '--c-from': t.from, '--c-via': t.via, '--c-to': t.to, aspectRatio: ratio }}>
      <div className="cover-grad" />
      <div className="cover-stripes" />
      {showEmoji && <div className="cover-emoji">{t.emoji}</div>}
      <div className="cover-mono">{work.id.toUpperCase()} · {work.type}</div>
      <div style={{ position:'absolute', inset: 0, pointerEvents:'none' }} className="scanlines" />
    </div>
  );
};

// ----- HeartButton -----
window.HeartButton = function HeartButton({ initial = 0, liked: likedProp, onToggle, size = 'sm' }) {
  const [liked, setLiked] = useState(!!likedProp);
  const [count, setCount] = useState(initial);
  const [popping, setPopping] = useState(false);
  const ref = useRef(null);

  const toggle = (e) => {
    e?.stopPropagation?.();
    const next = !liked;
    setLiked(next);
    setCount(c => c + (next ? 1 : -1));
    setPopping(true);
    setTimeout(() => setPopping(false), 600);
    onToggle?.(next);
  };

  return (
    <button
      ref={ref}
      onClick={toggle}
      className={`heart-btn ${popping ? 'pop' : ''}`}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: size === 'lg' ? '10px 16px' : '6px 12px',
        borderRadius: 999,
        background: liked ? 'color-mix(in oklch, var(--primary) 14%, var(--surface))' : 'var(--surface)',
        border: '1px solid var(--border)',
        color: liked ? 'var(--primary)' : 'var(--fg)',
        fontWeight: 700, fontSize: size === 'lg' ? 14 : 12,
        transition: 'all 0.18s',
      }}
    >
      <span className="heart-icon" style={{ display:'inline-block' }}>
        <svg width={size === 'lg' ? 18 : 14} height={size === 'lg' ? 18 : 14} viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </span>
      <span>{count}</span>
      {popping && <>
        <span className="sparkle" style={{ '--dx': '18px', '--dy': '-20px', top: 4, left: 10 }} />
        <span className="sparkle" style={{ '--dx': '-20px', '--dy': '-18px', top: 4, left: 14, background: 'var(--pink, #FFB7C5)' }} />
        <span className="sparkle" style={{ '--dx': '22px', '--dy': '14px', top: 14, left: 10, background: 'var(--mint, #9FE3C9)' }} />
      </>}
    </button>
  );
};

// ----- WorkCard -----
window.WorkCard = function WorkCard({ work, onOpen, variant = 'default' }) {
  const author = window.AIRCADE_AUTHORS.find(a => a.id === work.authorId);
  const dateStr = new Date(work.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

  if (variant === 'featured') {
    return (
      <article className="card lift" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
               onClick={() => onOpen?.(work)}>
        <div style={{ padding: 14, paddingBottom: 0 }}>
          <window.Cover work={work} ratio="16 / 10" />
        </div>
        <div style={{ padding: '18px 20px 20px' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <window.TypeChip type={work.type} />
            {work.featuredAt && <span className="pill" style={{ background:'color-mix(in oklch, var(--primary) 14%, var(--surface))', color:'var(--primary)', fontSize:11 }}>精选</span>}
          </div>
          <h3 className="font-display" style={{ fontSize: 22, margin: '0 0 6px' }}>{work.title}</h3>
          <p style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, margin: '0 0 10px' }}>{work.tagline}</p>
          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <div className="flex items-center gap-2">
              <window.Avatar author={author} size={28} />
              <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>@{author.username}</span>
            </div>
            <window.HeartButton initial={work.likes} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="card lift" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
             onClick={() => onOpen?.(work)}>
      <window.Cover work={work} />
      <div style={{ padding: 16 }}>
        <div className="flex items-center gap-2 mb-3" style={{ fontSize: 11 }}>
          <window.TypeChip type={work.type} />
          {work.tags.slice(0, 1).map(tag => (
            <span key={tag} className="pill" style={{ background:'transparent', border:'1px dashed var(--border)', fontSize:11 }}>#{tag}</span>
          ))}
        </div>
        <h3 className="font-display" style={{ fontSize: 19, margin: '0 0 4px', lineHeight: 1.25 }}>{work.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0, lineHeight: 1.5,
                    overflow:'hidden', display:'-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {work.tagline}
        </p>
        <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
          <div className="flex items-center gap-2">
            <window.Avatar author={author} size={24} />
            <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>@{author.username} · {dateStr}</span>
          </div>
          <window.HeartButton initial={work.likes} />
        </div>
      </div>
    </article>
  );
};

// ----- Navbar -----
window.Navbar = function Navbar({ user, route, navigate, onLogin, onLogout }) {
  return (
    <div className="nav-wrap">
      <div className="container flex items-center justify-between" style={{ height: 64 }}>
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('home')} className="flex items-center gap-2" style={{ padding: 0 }}>
            <window.Logo />
            <span className="font-display" style={{ fontSize: 22 }}>Aircade</span>
          </button>
          <nav className="flex items-center gap-4" style={{ fontSize: 14 }}>
            {[
              { id:'home',    label:'首页' },
              { id:'discover',label:'发现' },
              { id:'submit',  label:'提交作品' },
            ].map(tab => (
              <button key={tab.id}
                      onClick={() => navigate(tab.id)}
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: route === tab.id ? 'var(--primary)' : 'var(--fg-soft)',
                        padding: '6px 2px',
                        borderBottom: route === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                      }}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('discover')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            搜索
          </button>
          {user ? (
            <>
              {user.role === 'admin' && (
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('admin')}>
                  审核后台 <span className="pill" style={{ padding:'1px 7px', fontSize:10, background:'var(--primary)', color:'var(--primary-ink)', border:'none' }}>3</span>
                </button>
              )}
              <button className="btn btn-sm btn-ghost flex items-center gap-2" onClick={() => navigate('account')}>
                <window.Avatar author={user} size={22} />
                {user.nickname}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('login')}>登录</button>
              <button className="btn btn-sm btn-primary" onClick={() => navigate('register')}>带邀请码注册</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ----- Logo -----
window.Logo = function Logo() {
  // Small pixel arcade cabinet with an orange "air" swoop over it.
  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <svg viewBox="0 0 36 36" width="36" height="36">
        <defs>
          <linearGradient id="lg1" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)"/>
            <stop offset="1" stopColor="var(--pink, #FFB7C5)"/>
          </linearGradient>
        </defs>
        {/* cabinet body */}
        <rect x="8" y="11" width="20" height="20" rx="3" fill="url(#lg1)"/>
        {/* screen */}
        <rect x="11" y="14" width="14" height="9" rx="1.5" fill="var(--bg)" stroke="var(--fg)" strokeWidth="0.8"/>
        {/* coin slot */}
        <rect x="16" y="25" width="4" height="1.2" rx="0.4" fill="var(--fg)"/>
        {/* air swoop */}
        <path d="M6 9 Q18 2, 30 9" stroke="var(--fg)" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
        <circle cx="30" cy="9" r="1.6" fill="var(--fg)"/>
      </svg>
    </div>
  );
};

// ----- Footer -----
window.Footer = function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 60, padding: '40px 0', background: 'var(--bg-tint)' }}>
      <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 20 }}>
        <div className="flex items-center gap-3">
          <window.Logo />
          <div>
            <div className="font-display" style={{ fontSize: 18 }}>Aircade</div>
            <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>群友造的街机厅 · 一群人，做点小东西</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-faint)' }} className="micro">
          © 2026 · AIRCADE.FUN · MADE WITH CAFFEINE
        </div>
      </div>
    </footer>
  );
};

// ----- TagChip -----
window.TagChip = function TagChip({ tag, active, onClick }) {
  return (
    <button className="pill"
            onClick={onClick}
            style={{
              background: active ? 'var(--fg)' : 'var(--surface)',
              color: active ? 'var(--bg)' : 'var(--fg-soft)',
              borderColor: active ? 'var(--fg)' : 'var(--border)',
              cursor: 'pointer',
            }}>
      #{tag}
    </button>
  );
};
