'use client';

export function ConfirmDeleteButton({
  workId,
  action,
}: {
  workId: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="workId" value={workId} />
      <button
        type="submit"
        className="ac-btn w-full"
        style={{ color: '#dc2626' }}
        onClick={(e) => {
          if (!confirm('确定要删除这个作品吗？此操作不可撤销。')) {
            e.preventDefault();
          }
        }}
      >
        删除作品
      </button>
    </form>
  );
}
