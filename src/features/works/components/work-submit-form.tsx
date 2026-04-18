import { createWorkAction } from '../actions';
import { workTypeValues } from '../schemas';

const typeLabelMap: Record<(typeof workTypeValues)[number], string> = {
  game: '游戏',
  tool: '工具',
  social: '社交',
  ai: 'AI',
  other: '其他',
};

const inputClassName =
  'border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10';

export function WorkSubmitForm() {
  return (
    <form action={createWorkAction} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="title"
            className="text-sm font-medium text-brand-coffee/80"
          >
            标题
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={30}
            className={inputClassName}
            placeholder="给作品起一个 30 字以内的名字"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="type"
            className="text-sm font-medium text-brand-coffee/80"
          >
            类型
          </label>
          <select
            id="type"
            name="type"
            defaultValue="game"
            className={inputClassName}
          >
            {workTypeValues.map((type) => (
              <option key={type} value={type}>
                {typeLabelMap[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="tagline"
            className="text-sm font-medium text-brand-coffee/80"
          >
            一句话介绍
          </label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            required
            maxLength={30}
            className={inputClassName}
            placeholder="例如：一个只靠敲空格也能上头的小游戏"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="description"
          className="text-sm font-medium text-brand-coffee/80"
        >
          作品介绍
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          maxLength={300}
          className={`${inputClassName} resize-y`}
          placeholder="说清楚这是个什么作品、怎么用、为什么值得点开。"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="coverUrl"
            className="text-sm font-medium text-brand-coffee/80"
          >
            封面链接
          </label>
          <input
            id="coverUrl"
            name="coverUrl"
            type="url"
            required
            className={inputClassName}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="screenshots"
            className="text-sm font-medium text-brand-coffee/80"
          >
            截图链接
          </label>
          <textarea
            id="screenshots"
            name="screenshots"
            rows={4}
            className={`${inputClassName} resize-y`}
            placeholder={'每行一张截图链接，可留空\nhttps://...\nhttps://...'}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="webUrl"
            className="text-sm font-medium text-brand-coffee/80"
          >
            网页地址
          </label>
          <input
            id="webUrl"
            name="webUrl"
            type="url"
            className={inputClassName}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="qrUrl"
            className="text-sm font-medium text-brand-coffee/80"
          >
            二维码图片链接
          </label>
          <input
            id="qrUrl"
            name="qrUrl"
            type="url"
            className={inputClassName}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="text-brand-coffee/68 flex flex-col gap-3 rounded-card border border-brand-coffee/10 bg-brand-milk/65 p-4 text-sm">
        <p>至少填写一个可点击入口：网页地址或二维码图片链接。</p>
        <p>提交后作品会先进入待审核状态，管理员通过后才会出现在首页。</p>
      </div>

      <button
        type="submit"
        className="hover:bg-brand-orange/92 inline-flex w-full items-center justify-center rounded-btn bg-brand-orange px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(255,159,107,0.28)] transition"
      >
        提交作品
      </button>
    </form>
  );
}
