'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, QrCode, Upload, X } from 'lucide-react';
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverInputKey, setCoverInputKey] = useState(0);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [screenshotPreviewUrls, setScreenshotPreviewUrls] = useState<string[]>(
    []
  );
  const [screenshotInputKey, setScreenshotInputKey] = useState(0);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [qrInputKey, setQrInputKey] = useState(0);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [coverFile]);

  useEffect(() => {
    if (!qrFile) {
      setQrPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(qrFile);
    setQrPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [qrFile]);

  useEffect(() => {
    if (screenshotFiles.length === 0) {
      setScreenshotPreviewUrls([]);
      return;
    }

    const objectUrls = screenshotFiles.map((file) => URL.createObjectURL(file));
    setScreenshotPreviewUrls(objectUrls);

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [screenshotFiles]);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <form
        action={createWorkAction}
        encType="multipart/form-data"
        className="ac-card p-6 sm:p-7"
      >
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

        <Section title="图片" note="封面在卡片，截图在详情页，支持直接上传。">
          <Field label="封面上传" htmlFor="coverFile" required>
            <UploadSurface
              inputKey={coverInputKey}
              id="coverFile"
              name="coverFile"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              required
              selected={Boolean(coverFile)}
              icon={<ImagePlus size={18} strokeWidth={2.1} />}
              title={coverFile ? coverFile.name : '投一张封面图'}
              subtitle={
                coverFile
                  ? `${formatFileSize(coverFile.size)} · 会展示在卡片正面`
                  : '支持 PNG / JPG / WEBP / GIF / AVIF'
              }
              text={
                coverFile
                  ? '拖进来可直接替换封面'
                  : '点一下选择，或者像投币一样把封面拖进来'
              }
              accent="var(--ac-primary)"
              previewUrl={coverPreviewUrl || undefined}
              previewAlt="封面预览"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              onClear={() => {
                setCoverFile(null);
                setCoverInputKey((value) => value + 1);
              }}
            />
          </Field>

          <Field
            label="截图上传"
            note={
              screenshotFiles.length > 0
                ? `已选择 ${screenshotFiles.length} 张，最多 6 张`
                : '可多选，最多 6 张，可留空'
            }
            htmlFor="screenshots"
          >
            <UploadSurface
              inputKey={screenshotInputKey}
              id="screenshots"
              name="screenshots"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              multiple
              selected={screenshotFiles.length > 0}
              icon={<Upload size={18} strokeWidth={2.1} />}
              title={
                screenshotFiles.length > 0
                  ? `已装入 ${screenshotFiles.length} 张截图`
                  : '补几张过程图'
              }
              subtitle={
                screenshotFiles.length > 0
                  ? '详情页会按上传顺序展示'
                  : '建议放玩法、界面、结果页，不要全是一张图'
              }
              text={
                screenshotFiles.length > 0
                  ? '拖进来可直接替换这一组截图'
                  : '支持直接拖进来，做一组像贴在街机机身上的快照'
              }
              accent="var(--ac-mint)"
              previewUrls={screenshotPreviewUrls}
              fileNames={screenshotFiles.map((file) => file.name)}
              onChange={(e) =>
                setScreenshotFiles(Array.from(e.target.files ?? []))
              }
              onClear={() => {
                setScreenshotFiles([]);
                setScreenshotInputKey((value) => value + 1);
              }}
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
          <Field label="二维码图片上传" htmlFor="qrFile" note="可留空">
            <UploadSurface
              inputKey={qrInputKey}
              id="qrFile"
              name="qrFile"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              selected={Boolean(qrFile)}
              icon={<QrCode size={18} strokeWidth={2.1} />}
              title={qrFile ? qrFile.name : '没有 H5 就传二维码'}
              subtitle={
                qrFile
                  ? `${formatFileSize(qrFile.size)} · 详情页会展示扫码入口`
                  : '适合小程序、公众号或群里口令入口'
              }
              text={
                qrFile
                  ? '拖进来可直接替换二维码'
                  : '如果没填 Web 链接，至少上传一张二维码'
              }
              accent="var(--ac-cream)"
              previewUrl={qrPreviewUrl || undefined}
              previewAlt="二维码预览"
              onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
              onClear={() => {
                setQrFile(null);
                setQrInputKey((value) => value + 1);
              }}
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
            coverUrl={coverPreviewUrl || undefined}
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

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadSurface({
  inputKey,
  id,
  name,
  accept,
  required,
  multiple,
  selected,
  icon,
  title,
  subtitle,
  text,
  accent,
  previewUrl,
  previewUrls,
  previewAlt,
  fileNames,
  onChange,
  onClear,
}: {
  inputKey: number;
  id: string;
  name: string;
  accept: string;
  required?: boolean;
  multiple?: boolean;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  text?: string;
  accent: string;
  previewUrl?: string;
  previewUrls?: string[];
  previewAlt?: string;
  fileNames?: string[];
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onClear?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const showPreviewGrid = Boolean(previewUrls && previewUrls.length > 0);

  return (
    <div className="space-y-3">
      <input
        key={inputKey}
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        multiple={multiple}
        className="sr-only"
        onChange={onChange}
      />

      <label
        htmlFor={id}
        className="group relative block cursor-pointer overflow-hidden rounded-[18px] border transition-all duration-200"
        onDragEnter={() => setIsDragging(true)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return;
          }
          setIsDragging(false);
        }}
        onDrop={() => setIsDragging(false)}
        style={{
          borderColor: isDragging
            ? 'color-mix(in oklch, var(--ac-primary) 72%, var(--ac-border))'
            : selected
              ? 'color-mix(in oklch, var(--ac-primary) 36%, var(--ac-border))'
              : 'var(--ac-border)',
          outline: isDragging
            ? '2px solid color-mix(in oklch, var(--ac-primary) 55%, transparent)'
            : 'none',
          outlineOffset: '-2px',
          background: isDragging
            ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,244,227,0.98) 100%)'
            : 'linear-gradient(180deg, var(--ac-surface) 0%, var(--ac-surface-soft) 100%)',
          boxShadow: isDragging
            ? '0 0 0 6px rgba(255, 159, 107, 0.12), 0 22px 54px rgba(61, 46, 31, 0.12)'
            : selected
              ? '0 18px 44px rgba(61, 46, 31, 0.08)'
              : '0 10px 26px rgba(61, 46, 31, 0.04)',
          transform: isDragging ? 'translateY(-2px)' : 'translateY(0)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            opacity: isDragging ? 1 : undefined,
            background:
              'linear-gradient(135deg, rgba(255,159,107,0.08) 0%, transparent 42%, rgba(159,227,201,0.12) 100%)',
          }}
        />

        <div className="relative grid gap-4 p-4 sm:grid-cols-[1fr_120px] sm:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-transform duration-200"
                style={{
                  background: `color-mix(in oklch, ${accent} 24%, white)`,
                  color: 'var(--ac-fg)',
                  border: '1px solid var(--ac-border)',
                  transform: isDragging ? 'scale(1.06)' : 'scale(1)',
                }}
              >
                {icon}
              </span>
              <div className="min-w-0">
                <div
                  className="truncate text-[14px] font-semibold"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  {title}
                </div>
                {subtitle ? (
                  <div
                    className="text-[12px]"
                    style={{ color: 'var(--ac-fg-faint)' }}
                  >
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="ac-pill"
                style={{
                  background: isDragging ? 'var(--ac-primary)' : 'var(--ac-bg)',
                  borderColor: isDragging
                    ? 'var(--ac-primary)'
                    : 'var(--ac-border-strong)',
                  color: isDragging ? 'var(--ac-primary-ink)' : 'var(--ac-fg)',
                }}
              >
                {isDragging ? '松手投进来' : '点击或拖拽文件'}
              </span>
              {onClear && selected ? (
                <button
                  type="button"
                  className="ac-btn ac-btn-sm ac-btn-ghost pointer-events-auto"
                  onClick={(event) => {
                    event.preventDefault();
                    onClear();
                  }}
                >
                  <X size={14} />
                  清空
                </button>
              ) : null}
            </div>

            {text ? (
              <div
                className="mt-3 text-[12px] leading-6"
                style={{ color: 'var(--ac-fg-faint)' }}
              >
                {text}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-start sm:justify-end">
            {showPreviewGrid ? (
              <div className="grid grid-cols-2 gap-2">
                {previewUrls?.slice(0, 4).map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="relative h-[52px] w-[52px] overflow-hidden rounded-[12px] border"
                    style={{
                      borderColor: 'var(--ac-border)',
                      background: 'var(--ac-bg-tint)',
                    }}
                  >
                    <img
                      src={url}
                      alt={`${previewAlt ?? title} ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {index === 3 && (previewUrls?.length ?? 0) > 4 ? (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold"
                        style={{
                          background: 'rgba(61, 46, 31, 0.52)',
                          color: '#fffdf8',
                        }}
                      >
                        +{(previewUrls?.length ?? 0) - 4}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : previewUrl ? (
              <div
                className="h-[108px] w-[108px] overflow-hidden rounded-[16px] border"
                style={{
                  borderColor: 'var(--ac-border)',
                  background: 'var(--ac-bg-tint)',
                }}
              >
                <img
                  src={previewUrl}
                  alt={previewAlt ?? title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-[16px] border border-dashed text-center transition-all duration-200"
                style={{
                  borderColor: isDragging
                    ? 'var(--ac-primary)'
                    : 'var(--ac-border-strong)',
                  background: isDragging
                    ? 'linear-gradient(180deg, rgba(255,239,228,0.96) 0%, rgba(255,248,239,1) 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,244,227,0.92) 100%)',
                  color: isDragging
                    ? 'var(--ac-primary)'
                    : 'var(--ac-fg-faint)',
                  transform: isDragging ? 'scale(1.04)' : 'scale(1)',
                }}
              >
                <Upload size={18} />
                <div className="mt-2 text-[11px] leading-5">PNG / JPG</div>
                <div className="text-[11px] leading-5">WEBP / GIF / AVIF</div>
              </div>
            )}
          </div>
        </div>
      </label>

      {fileNames && fileNames.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {fileNames.map((fileName) => (
            <span
              key={fileName}
              className="rounded-full px-3 py-1 text-[12px]"
              style={{
                background: 'var(--ac-bg-tint)',
                border: '1px solid var(--ac-border)',
                color: 'var(--ac-fg-soft)',
              }}
            >
              {fileName}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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
