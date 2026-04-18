// Page: Submit work
/* global React */

window.SubmitPage = function SubmitPage({ navigate }) {
  const [form, setForm] = React.useState({
    title: '', type: 'game', tags: [], tagline: '', description: '',
    cover: null, screenshots: [], has: 'miniprogram', url: '', adminNote: '',
  });
  const [touched, setTouched] = React.useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTag = (t) => setForm(f => ({
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : f.tags.length < 3 ? [...f.tags, t] : f.tags,
  }));

  return (
    <div className="page-in container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 1100 }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="micro" style={{ color: 'var(--primary)', marginBottom: 8 }}>SUBMIT · 投稿</div>
          <h1 className="font-display" style={{ fontSize: 40, margin: 0 }}>提交你的小东西</h1>
          <p style={{ color: 'var(--fg-soft)', marginTop: 8 }}>
            审核一般 24h 内，群主会在群里 @ 你。驳回会给理由，可修改后重提。
          </p>
        </div>
        <div className="card" style={{ padding: 14, fontSize: 12, color: 'var(--fg-soft)' }}>
          <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 6 }}>3-STEP FLOW</div>
          <div className="flex gap-3">
            <span>① 填信息</span>
            <span style={{ color: 'var(--fg-faint)' }}>→</span>
            <span>② 待审核</span>
            <span style={{ color: 'var(--fg-faint)' }}>→</span>
            <span>③ 上架首页</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start' }}>
        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); setTouched(true); }}>
          <div className="card" style={{ padding: 28 }}>
            <Section title="基本信息" note="这一段会显示在卡片和详情页。">
              <div>
                <label className="label">作品名 <span style={{ color: 'var(--fg-faint)' }}>({form.title.length}/30)</span></label>
                <input className="input" placeholder="比如：猫猫面馆"
                       maxLength={30}
                       value={form.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className="label">类型</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {window.AIRCADE_TYPES.map(t => (
                    <button key={t.id} type="button"
                            onClick={() => set('type', t.id)}
                            className="pill"
                            style={{
                              cursor: 'pointer',
                              background: form.type === t.id ? t.mood : 'var(--surface)',
                              borderColor: form.type === t.id ? 'var(--fg)' : 'var(--border)',
                              fontSize: 13, padding: '8px 14px',
                            }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">标签 <span style={{ color: 'var(--fg-faint)' }}>(最多 3 个 · 已选 {form.tags.length})</span></label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {window.AIRCADE_TAGS.map(t => (
                    <window.TagChip key={t} tag={t} active={form.tags.includes(t)} onClick={() => toggleTag(t)} />
                  ))}
                </div>
                <div className="hint">找不到合适的？<a style={{ color: 'var(--primary)', fontWeight: 600 }}>申请新标签 →</a></div>
              </div>
              <div>
                <label className="label">一句话简介 <span style={{ color: 'var(--fg-faint)' }}>({form.tagline.length}/30)</span></label>
                <input className="input" placeholder="开面馆但老板是一只薛定谔的猫"
                       maxLength={30}
                       value={form.tagline} onChange={e => set('tagline', e.target.value)} />
                <div className="hint">用于卡片和分享。写成"谁在做什么"的句式最顺口。</div>
              </div>
              <div>
                <label className="label">详细简介 <span style={{ color: 'var(--fg-faint)' }}>({form.description.length}/300)</span></label>
                <textarea className="input" rows={5} maxLength={300}
                          placeholder="玩法 / 特色 / 你做这个的原因。300 字以内。"
                          style={{ resize: 'vertical', minHeight: 110 }}
                          value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </Section>

            <Divider />

            <Section title="图片" note="封面会显示在所有卡片上；截图在详情页轮播。">
              <div>
                <label className="label">封面图 <span style={{ color: 'var(--fg-faint)' }}>(必填 · 建议 1200×900 · ≤500KB)</span></label>
                <Dropzone big label="把封面拖进来 / 点击上传" />
              </div>
              <div>
                <label className="label">截图 <span style={{ color: 'var(--fg-faint)' }}>(3-6 张 · 单张 ≤800KB)</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Dropzone key={i} small label={i < 3 ? `图 ${i+1} *` : `图 ${i+1}`} />
                  ))}
                </div>
              </div>
            </Section>

            <Divider />

            <Section title="怎么玩" note="两种路径至少选一种。">
              <div>
                <label className="label">入口</label>
                <div className="flex gap-2">
                  {[
                    { id:'miniprogram', label:'微信小程序码' },
                    { id:'web', label:'Web 链接' },
                    { id:'both', label:'两个都有' },
                  ].map(o => (
                    <button key={o.id} type="button" onClick={() => set('has', o.id)}
                            className="pill"
                            style={{
                              cursor: 'pointer',
                              background: form.has === o.id ? 'var(--fg)' : 'var(--surface)',
                              color: form.has === o.id ? 'var(--bg)' : 'var(--fg)',
                              borderColor: form.has === o.id ? 'var(--fg)' : 'var(--border)',
                              fontSize: 13, padding: '8px 14px',
                            }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {(form.has === 'miniprogram' || form.has === 'both') && (
                <div>
                  <label className="label">小程序码图片</label>
                  <Dropzone label="拖进来 / 点击上传 · 详情页会放大展示" />
                </div>
              )}
              {(form.has === 'web' || form.has === 'both') && (
                <div>
                  <label className="label">Web 链接</label>
                  <input className="input" placeholder="https://" value={form.url} onChange={e => set('url', e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">给审核员看的补充说明 <span style={{ color: 'var(--fg-faint)' }}>(选填)</span></label>
                <textarea className="input" rows={2}
                          placeholder="例：测试账号 13800000000 / 密码 888888" />
              </div>
            </Section>

            <Divider />

            <div className="flex items-center justify-between">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--fg-soft)' }}>
                <input type="checkbox" style={{ width: 16, height: 16 }} />
                我已阅读并同意《内容规范》，作品为我本人原创或已获授权。
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost">保存草稿</button>
                <button type="submit" className="btn btn-primary">提交审核 →</button>
              </div>
            </div>
          </div>
        </form>

        {/* Live Preview */}
        <aside style={{ position: 'sticky', top: 88 }}>
          <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 10 }}>LIVE PREVIEW · 卡片预览</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <window.Cover work={{ id:'w_preview', cover: 0, type: form.type }} />
            <div style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-2">
                <window.TypeChip type={form.type} />
                {form.tags[0] && <span className="pill" style={{ background:'transparent', border:'1px dashed var(--border)' }}>#{form.tags[0]}</span>}
              </div>
              <div className="font-display" style={{ fontSize: 18, marginTop: 2 }}>
                {form.title || <span style={{ color: 'var(--fg-faint)' }}>作品名会出现在这里</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg-soft)', marginTop: 4 }}>
                {form.tagline || <span style={{ color: 'var(--fg-faint)' }}>一句话简介</span>}
              </div>
            </div>
          </div>

          <div className="card mt-4" style={{ padding: 16, fontSize: 13 }}>
            <div className="micro" style={{ color: 'var(--fg-faint)', marginBottom: 8 }}>小贴士</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-soft)', lineHeight: 1.7 }}>
              <li>封面和截图统一转 webp，压缩会自动做</li>
              <li>标题别太长 —— 卡片会截断</li>
              <li>有测试账号一定写在"审核员备注"</li>
              <li>被驳回不丢人，可以改了再提</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};

function Section({ title, note, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex items-end justify-between mb-4">
        <div className="font-display" style={{ fontSize: 20 }}>{title}</div>
        {note && <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{note}</div>}
      </div>
      <div className="stack" style={{ '--stack-gap': '16px' }}>{children}</div>
    </div>
  );
}
function Divider() { return <div style={{ height: 1, background: 'var(--border)', margin: '28px 0' }} />; }
function Dropzone({ label, big, small }) {
  return (
    <div style={{
      border: '2px dashed var(--border-strong)',
      borderRadius: 14,
      padding: big ? '40px 20px' : small ? '18px 8px' : '22px 16px',
      textAlign: 'center',
      background: 'var(--bg-tint)',
      fontSize: small ? 11 : 13,
      color: 'var(--fg-faint)',
      cursor: 'pointer',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ fontSize: small ? 18 : big ? 34 : 22, marginBottom: 4 }}>＋</div>
      <div>{label}</div>
    </div>
  );
}
