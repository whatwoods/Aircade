// Root app: routing + tweaks + theme
/* global React, ReactDOM */

const { useState, useEffect } = React;

function App() {
  // --- Persisted route ---
  const [route, setRoute] = useState(() => {
    try {
      const raw = localStorage.getItem('aircade.route');
      return raw ? JSON.parse(raw) : { page: 'home' };
    } catch { return { page: 'home' }; }
  });
  useEffect(() => { localStorage.setItem('aircade.route', JSON.stringify(route)); }, [route]);

  const navigate = (page, param) => {
    setRoute({ page, param });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // --- Fake user session ---
  const adminUser = { id: 'u1', username: 'way', nickname: 'Way', avatarHue: 18, role: 'admin' };
  const [user, setUser] = useState(adminUser);

  // --- Tweaks ---
  const DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "warm",
    "accent": "orange",
    "density": "cozy",
    "coverStyle": "gradient"
  }/*EDITMODE-END*/;

  const [tweaks, setTweaks] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('aircade.tweaks') || '{}') }; }
    catch { return DEFAULTS; }
  });
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    // Apply accent override
    const accentMap = {
      orange: { primary: '#FF9F6B', ink: '#FFFBF5' },
      pink:   { primary: '#E86A85', ink: '#FFFBF5' },
      mint:   { primary: '#4FB090', ink: '#FFFBF5' },
      coffee: { primary: '#3D2E1F', ink: '#FFFBF5' },
    };
    const a = accentMap[tweaks.accent] || accentMap.orange;
    if (tweaks.theme !== 'warm' || tweaks.accent !== 'orange') {
      document.documentElement.style.setProperty('--primary', a.primary);
      document.documentElement.style.setProperty('--primary-ink', a.ink);
    } else {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-ink');
    }
    localStorage.setItem('aircade.tweaks', JSON.stringify(tweaks));
  }, [tweaks]);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === '__activate_edit_mode') setEditMode(true);
      if (d.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (k, v) => {
    setTweaks(t => {
      const next = { ...t, [k]: v };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
      return next;
    });
  };

  // --- Render page ---
  let page = null;
  const commonProps = { navigate, user, onLogin: () => setUser(adminUser), onLogout: () => setUser(null) };
  switch (route.page) {
    case 'home':     page = <window.HomePage {...commonProps} />; break;
    case 'discover': page = <window.DiscoverPage {...commonProps} initialType={route.param} />; break;
    case 'work':     page = <window.WorkDetailPage {...commonProps} workId={route.param} />; break;
    case 'submit':   page = <window.SubmitPage {...commonProps} />; break;
    case 'admin':    page = <window.AdminPage {...commonProps} />; break;
    case 'login':    page = <window.LoginPage {...commonProps} />; break;
    case 'register': page = <window.RegisterPage {...commonProps} />; break;
    case 'account':  page = <window.AccountPage {...commonProps} />; break;
    default:         page = <window.HomePage {...commonProps} />;
  }

  const showChrome = !['login', 'register'].includes(route.page) || true;

  return (
    <div data-screen-label={`${route.page}`}>
      <window.Navbar user={user} route={route.page} navigate={navigate} />
      <main key={route.page + (route.param || '')}>
        {page}
      </main>
      <window.Footer />
      {editMode && <TweaksPanel tweaks={tweaks} setTweak={setTweak} />}
    </div>
  );
}

function TweaksPanel({ tweaks, setTweak }) {
  return (
    <div className="tweaks">
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>Tweaks</h4>
        <span className="micro" style={{ color: 'var(--fg-faint)' }}>AIRCADE</span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.12em', textTransform:'uppercase' }}>风格</div>
      <div className="tweaks-row">
        {[
          ['warm','Warm Default'],
          ['arcade','Pixel Arcade'],
          ['editorial','Muted Editorial'],
        ].map(([id, label]) => (
          <button key={id} className={`tweak-chip ${tweaks.theme === id ? 'active' : ''}`}
                  onClick={() => setTweak('theme', id)}>{label}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.12em', textTransform:'uppercase' }}>主色</div>
      <div className="tweaks-row">
        {[
          ['orange', '#FF9F6B'],
          ['pink',   '#E86A85'],
          ['mint',   '#4FB090'],
          ['coffee', '#3D2E1F'],
        ].map(([id, hex]) => (
          <button key={id} className={`tweak-chip ${tweaks.accent === id ? 'active' : ''}`}
                  onClick={() => setTweak('accent', id)}
                  style={{ padding: '4px 10px 4px 6px', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:14, height:14, borderRadius:4, background:hex, border:'1px solid rgba(0,0,0,0.1)' }} />
            {id}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
        切换会保留在 localStorage。
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
