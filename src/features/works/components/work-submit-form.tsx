'use client';

import { useState } from 'react';
import { Cover, TypeChip } from '@/components/brand';
import { createWorkAction } from '../actions';
import { workTypeValues } from '../schemas';
import type { WorkType } from '../schemas';

const typeLabelMap: Record<WorkType, string> = {
  game: '游戏',
  tool: '工具',
  social: '社交',
  ai: 'AI',
  other: '其他',
};

const typeMood: Record<WorkType, string> = {
  game: 'var(--t-game)',
  tool: 'var(--t-tool)',
  social: 'var(--t-social)',
  ai: 'var(--t-ai)',
  other: 'var(--t-other)',
};

const inputClass =
  'ac-field w-full rounded-[12px] px-4 py-3 text-[14px] outline-none transition-colors';

const inputStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
};

export function WorkSubmitForm() {
  const [type, setType] = useState<WorkType>('game');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <form action={createWorkAction} className="ac-card p-6 sm:p-7">
        {/* hidden input to carry chosen type since select is replaced */}
        <input type="hidden" name="type" value={type} />

        <Section title="基本信息" note="这一段会显示在卡片和详情页。">
          <Field label="作品名" counter={`${title.length}/30`} htmlFor="title">
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={30}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="比如：猫猫面馆"
            />
          </Field>

          <Field label="类型">
            <div className="flex flex-wrap gap-2">
              {workTypeValues.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
                  style={{
                    border: '1px solid',
                    borderColor:
                      type === t ? 'var(--ac-fg)' : 'var(--ac-border)',
                    background: type === t ? typeMood[t] : 'var(--ac-surface)',
                    color: 'var(--ac-fg)',
                  }}
                >
                  {typeLabelMap[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="一句话简介"
            counter={`${tagline.length}/30`}
            htmlFor="tagline"
          >
            <input
              id="tagline"
              name="tagline"
              type="text"
              required
              maxLength={30}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="一句让别人点进来的话"
            />
          </Field>

          <Field
            label="详细简介"
            counter={`${description.length}/300`}
            htmlFor="description"
          >
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} resize-y`}
              style={{ ...inputStyle, minHeight: 110 }}
              placeholder="玩法 / 特色 / 你做这个的原因。300 字以内。"
            />
          </Field>
        </Section>

        <Divider />

        <Section title="图片" note="封面在卡片，截图在详情页。">
          <Field label="封面链接" htmlFor="coverUrl" required>
            <input
              id="coverUrl"
              name="coverUrl"
              type="url"
              required
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="https://..."
            />
          </Field>

          <Field label="截图链接" note="每行一张，可留空" htmlFor="screenshots">
            <textarea
              id="screenshots"
              name="screenshots"
              rows={4}
              className={`${inputClass} resize-y`}
              style={inputStyle}
              placeholder={'https://...\nhttps://...'}
            />
          </Field>
        </Section>

        <Divider />

        <Section title="怎么玩" note="Web 链接和二维码至少填一个。">
          <Field label="Web 链接" htmlFor="webUrl">
            <input
              id="webUrl"
              name="webUrl"
              type="url"
              className={inputClass}
              style={inputStyle}
              placeholder="https://"
            />
          </Field>
          <Field label="二维码图片链接" htmlFor="qrUrl">
            <input
              id="qrUrl"
              name="qrUrl"
              type="url"
              className={inputClass}
              style={inputStyle}
              placeholder="https://"
            />
          </Field>
        </Section>

        <Divider />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label
            className="flex items-center gap-2 text-[13px]"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            <input type="checkbox" required className="h-4 w-4" />
            我确认作品为原创或已获授权。
          </label>
          <button type="submit" className="ac-btn ac-btn-primary">
            提交审核 →
          </button>
        </div>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-[88px]">
        <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
          LIVE PREVIEW · 卡片预览
        </div>

        <article
          className="ac-card overflow-hidden p-0"
          style={{ borderRadius: 22 }}
        >
          <Cover
            seed={`preview-${type}`}
            coverUrl={coverUrl || undefined}
            ratio="4 / 3"
          />
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <TypeChip type={type} />
            </div>
            <div
              className="font-display text-[18px] leading-tight"
              style={{ color: title ? 'var(--ac-fg)' : 'var(--ac-fg-faint)' }}
            >
              {title || '作品名会出现在这里'}
            </div>
            <div
              className="mt-1 text-[13px]"
              style={{
                color: tagline ? 'var(--ac-fg-soft)' : 'var(--ac-fg-faint)',
              }}
            >
              {tagline || '一句话简介'}
            </div>
          </div>
        </article>

        <div className="ac-card p-4 text-[13px]">
          <div
            className="ac-micro mb-2"
            style={{ color: 'var(--ac-fg-faint)' }}
          >
            小贴士
          </div>
          <ul
            className="ml-4 list-disc leading-[1.8]"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            <li>标题别太长 —— 卡片会截断</li>
            <li>封面图建议 4:3 或 16:10</li>
            <li>Web 链接确保别人能真的打开</li>
            <li>被驳回不丢人，可以改了再提</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-4 flex items-end justify-between">
        <div
          className="font-display text-[20px]"
          style={{ color: 'var(--ac-fg)' }}
        >
          {title}
        </div>
        {note ? (
          <div className="text-[12px]" style={{ color: 'var(--ac-fg-faint)' }}>
            {note}
          </div>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-7 h-px" style={{ background: 'var(--ac-border)' }} />
  );
}

function Field({
  label,
  counter,
  note,
  htmlFor,
  required,
  children,
}: {
  label: string;
  counter?: string;
  note?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium"
          style={{ color: 'var(--ac-fg)' }}
        >
          {label}
          {required ? (
            <span className="ml-1" style={{ color: 'var(--ac-primary)' }}>
              *
            </span>
          ) : null}
        </label>
        {counter || note ? (
          <span className="text-[12px]" style={{ color: 'var(--ac-fg-faint)' }}>
            {counter ?? note}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
