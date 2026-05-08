'use client';

type ShareButtonProps = {
  title: string;
  url: string;
};

export function ShareButton({ title, url }: ShareButtonProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        // Simple toast notification
        const containerId = '__ac_toast_container__';
        let container = document.getElementById(containerId);
        if (!container) {
          container = document.createElement('div');
          container.id = containerId;
          container.style.cssText =
            'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999';
          document.body.appendChild(container);
        }
        // Remove previous toasts
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        const toast = document.createElement('div');
        toast.textContent = '链接已复制';
        toast.style.cssText =
          'background:var(--ac-fg);color:var(--ac-bg);padding:8px 16px;border-radius:8px;font-size:14px;transition:opacity 0.3s';
        container.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 2000);
      }
    } catch {
      // User cancelled share or clipboard failed — ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="分享"
      className="ac-btn ac-btn-sm ac-btn-ghost flex-1"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
      </svg>
      分享
    </button>
  );
}
