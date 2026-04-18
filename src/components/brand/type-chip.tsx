export type WorkType = 'game' | 'tool' | 'social' | 'ai' | 'other';

const typeLabels: Record<WorkType, string> = {
  game: '游戏',
  tool: '工具',
  social: '社交',
  ai: 'AI 应用',
  other: '其他',
};

const typeClass: Record<WorkType, string> = {
  game: 'ac-type-game',
  tool: 'ac-type-tool',
  social: 'ac-type-social',
  ai: 'ac-type-ai',
  other: 'ac-type-other',
};

export function TypeChip({
  type,
  size = 'sm',
}: {
  type: WorkType;
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={`ac-pill ${typeClass[type]}`}
      style={{ fontSize: size === 'lg' ? 13 : 11 }}
    >
      {typeLabels[type]}
    </span>
  );
}
