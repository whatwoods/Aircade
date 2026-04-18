// Mock data for Aircade prototype. Mix of plausible names based on the PRD's
// AI-game-dev community vibe + placeholder covers via CSS gradients.

window.AIRCADE_AUTHORS = [
  { id: 'u1', username: 'way',        nickname: 'Way',        avatarHue: 18,  bio: '群主 · 写 PRD 的时候也想顺手做点东西' },
  { id: 'u2', username: 'xiaopan',    nickname: '小泮',       avatarHue: 150, bio: '做小程序三年，最近在搞 AI 副本生成器' },
  { id: 'u3', username: 'mochi',      nickname: 'Mochi',      avatarHue: 340, bio: '插画师 × 独立游戏 × 周末程序员' },
  { id: 'u4', username: 'linzi',      nickname: '林子',       avatarHue: 42,  bio: '前端转 AI 应用，喜欢做小工具' },
  { id: 'u5', username: 'tofu',       nickname: '豆腐',       avatarHue: 200, bio: '不会画画但会调参的那种' },
  { id: 'u6', username: 'qiyue',      nickname: '七月',       avatarHue: 280, bio: '产品经理，做一些没人要的玩具' },
  { id: 'u7', username: 'bobo',       nickname: '波波',       avatarHue: 10,  bio: '大厂摸鱼 / 小厂做梦' },
  { id: 'u8', username: 'xingyun',    nickname: '星云',       avatarHue: 220, bio: 'AI + 文字冒险' },
];

// Covers are synthesized with CSS gradients so we never ship broken images.
const coverThemes = [
  { from: '#FF9F6B', via: '#FFB7C5', to: '#FFE9B8', emoji: '🕹️' },
  { from: '#9FE3C9', via: '#FFE9B8', to: '#FF9F6B', emoji: '🌱' },
  { from: '#FFB7C5', via: '#FF9F6B', to: '#FFE9B8', emoji: '💌' },
  { from: '#FFE9B8', via: '#9FE3C9', to: '#FFB7C5', emoji: '🎲' },
  { from: '#3D2E1F', via: '#FF9F6B', to: '#FFE9B8', emoji: '⚡' },
  { from: '#9FE3C9', via: '#FFB7C5', to: '#FFE9B8', emoji: '🧃' },
  { from: '#FF9F6B', via: '#FFE9B8', to: '#9FE3C9', emoji: '🎮' },
  { from: '#FFB7C5', via: '#FFE9B8', to: '#9FE3C9', emoji: '🐾' },
  { from: '#FFE9B8', via: '#FF9F6B', to: '#FFB7C5', emoji: '🍜' },
  { from: '#9FE3C9', via: '#FF9F6B', to: '#3D2E1F', emoji: '🧩' },
  { from: '#FFB7C5', via: '#9FE3C9', to: '#FFE9B8', emoji: '🌙' },
  { from: '#FF9F6B', via: '#3D2E1F', to: '#FFB7C5', emoji: '🛠' },
];

const TYPES = [
  { id: 'game',   label: '游戏',   mood: '#FFB7C5' },
  { id: 'tool',   label: '工具',   mood: '#9FE3C9' },
  { id: 'social', label: '社交',   mood: '#FFE9B8' },
  { id: 'ai',     label: 'AI 应用', mood: '#FF9F6B' },
  { id: 'other',  label: '其他',   mood: '#C9B8A0' },
];
window.AIRCADE_TYPES = TYPES;

window.AIRCADE_TAGS = [
  '休闲','益智','AI','社交','工具','效率','创意','单机','多人','沙雕','实验性','像素','文字','音乐','Agent','教育',
];

// 20 works — some live, some pending (for admin queue), one rejected.
window.AIRCADE_WORKS = [
  {
    id: 'w1', title: '猫猫面馆', type: 'game', authorId: 'u3', status: 'live',
    tagline: '开面馆但老板是一只薛定谔的猫',
    description: '像素风模拟经营，煮错面会被猫挠。用 AI 生成每天的食客对话，没有两天是一样的。',
    tags: ['休闲','像素','沙雕'],
    cover: 0, likes: 482, views: 3120, has: 'miniprogram',
    featuredAt: '2026-04-14', createdAt: '2026-04-12',
    screenshots: [0, 6, 3, 7],
  },
  {
    id: 'w2', title: 'Agent 班味终结者', type: 'ai', authorId: 'u4', status: 'live',
    tagline: '把你的周报写成给幼儿园老师听的故事',
    description: '输入一段枯燥周报，输出一份家长看了会流泪的汇报。支持语气调节：卖惨 / 凡尔赛 / 职场黑话。',
    tags: ['AI','效率','Agent','沙雕'],
    cover: 4, likes: 356, views: 2210, has: 'web',
    featuredAt: '2026-04-13', createdAt: '2026-04-10',
    screenshots: [4, 1, 9],
  },
  {
    id: 'w3', title: '漂流瓶 2026', type: 'social', authorId: 'u6', status: 'live',
    tagline: '扔一句话到 AI 的海里，捡回来一封陌生人的回信',
    description: '写一段话，AI 把它包装成漂流瓶，随机发给另一位群友。对方可以手写回信，也可以让 AI 代笔。',
    tags: ['社交','AI','文字'],
    cover: 2, likes: 298, views: 1840, has: 'miniprogram',
    featuredAt: '2026-04-11', createdAt: '2026-04-09',
    screenshots: [2, 10, 7],
  },
  {
    id: 'w4', title: '穿搭直觉', type: 'tool', authorId: 'u5', status: 'live',
    tagline: '拍一张衣柜，告诉你今天穿啥',
    description: '多模态模型 + 天气 API，出门前 5 秒给一套不会出错的穿搭。',
    tags: ['工具','AI','效率'],
    cover: 1, likes: 212, views: 1630, has: 'web',
    featuredAt: null, createdAt: '2026-04-08',
    screenshots: [1, 5, 8],
  },
  {
    id: 'w5', title: '像素小卖部', type: 'game', authorId: 'u7', status: 'live',
    tagline: '你是 90 年代一间只有 4 种饮料的小卖部老板',
    description: '简单但上头的经营游戏。每个顾客都有自己的故事线，AI 生成对话。',
    tags: ['像素','单机','休闲'],
    cover: 6, likes: 540, views: 4010, has: 'miniprogram',
    featuredAt: '2026-04-15', createdAt: '2026-04-07',
    screenshots: [6, 8, 3],
  },
  {
    id: 'w6', title: '今晚吃啥 · AI 版', type: 'tool', authorId: 'u2', status: 'live',
    tagline: '不是摇骰子，是让 AI 根据你的冰箱推荐菜谱',
    description: '拍一张冰箱，AI 推三道菜，一键生成采购清单。',
    tags: ['工具','AI','效率'],
    cover: 8, likes: 176, views: 1290, has: 'miniprogram',
    featuredAt: null, createdAt: '2026-04-06',
    screenshots: [8, 4, 0],
  },
  {
    id: 'w7', title: '文字冒险 · 沙丘副本', type: 'game', authorId: 'u8', status: 'live',
    tagline: '你醒来时，沙漠在下雨',
    description: '纯文字 × AI GM 的沙盒冒险。每一局的世界线都不一样，支持存档给朋友抄。',
    tags: ['文字','AI','单机','实验性'],
    cover: 10, likes: 389, views: 2510, has: 'web',
    featuredAt: '2026-04-10', createdAt: '2026-04-05',
    screenshots: [10, 2, 5, 7],
  },
  {
    id: 'w8', title: '复盘师傅', type: 'tool', authorId: 'u1', status: 'live',
    tagline: '把今天的聊天记录总结成一段不内耗的复盘',
    description: '适合社交后需要消化的 I 人。读取截图 → 输出结构化复盘 → 告诉你哪些信号不用太在意。',
    tags: ['工具','AI','效率'],
    cover: 5, likes: 244, views: 1720, has: 'web',
    featuredAt: null, createdAt: '2026-04-04',
    screenshots: [5, 1],
  },
  {
    id: 'w9', title: '小组抽签', type: 'tool', authorId: 'u1', status: 'live',
    tagline: '多对多房间摇号，但做了一个像蛋糕店叫号的 UI',
    description: '团建不尴尬神器。支持权重、黑名单、不想和某某一组。',
    tags: ['工具','效率','多人'],
    cover: 3, likes: 132, views: 980, has: 'web',
    featuredAt: null, createdAt: '2026-04-03',
    screenshots: [3, 9],
  },
  {
    id: 'w10', title: '声音盲盒', type: 'social', authorId: 'u3', status: 'live',
    tagline: '收集 3 秒的环境音，随机送给另一个人',
    description: '把你此刻听到的世界给陌生人听。AI 会帮你加字幕描述场景。',
    tags: ['社交','创意','AI'],
    cover: 11, likes: 167, views: 1110, has: 'miniprogram',
    featuredAt: null, createdAt: '2026-04-02',
    screenshots: [11, 4],
  },
  {
    id: 'w11', title: '节奏打字', type: 'game', authorId: 'u4', status: 'live',
    tagline: '打字的时候跟着节拍走，手速和音游的混血',
    description: '教练模式 + 自由 freestyle。连 combo 时屏幕会抖。',
    tags: ['休闲','单机','创意'],
    cover: 7, likes: 203, views: 1440, has: 'web',
    featuredAt: null, createdAt: '2026-04-01',
    screenshots: [7, 6],
  },
  {
    id: 'w12', title: '给娃起名（不敷衍版）', type: 'ai', authorId: 'u6', status: 'live',
    tagline: '描述一下家庭气质，AI 给 30 个名字和 30 个出处',
    description: '不是四字成语大乱炖。支持"千万不要这种"负向词过滤。',
    tags: ['AI','工具','创意'],
    cover: 9, likes: 411, views: 2990, has: 'web',
    featuredAt: '2026-04-09', createdAt: '2026-03-30',
    screenshots: [9, 2],
  },

  // Pending — for admin queue
  {
    id: 'w13', title: '群友画风鉴定器', type: 'ai', authorId: 'u7', status: 'pending',
    tagline: '把你的涂鸦鉴定成某位群友',
    description: '喂过全群公开作品的 embedding，你画一个苹果它告诉你"像 mochi 画的"。',
    tags: ['AI','创意','沙雕'],
    cover: 5, likes: 0, views: 0, has: 'web',
    featuredAt: null, createdAt: '2026-04-16',
    screenshots: [5, 0],
    adminNote: '没有测试账号，直接打开可用',
  },
  {
    id: 'w14', title: '像素井字棋 · 联机', type: 'game', authorId: 'u2', status: 'pending',
    tagline: '古早井字棋，加了一个输家要请奶茶的按钮',
    description: '匹配快、动效足、输了会给你生成奶茶订单二维码（玩梗，不真下单）。',
    tags: ['多人','像素','沙雕'],
    cover: 6, likes: 0, views: 0, has: 'miniprogram',
    featuredAt: null, createdAt: '2026-04-16',
    screenshots: [6, 3],
  },
  {
    id: 'w15', title: 'Prompt 仓库', type: 'tool', authorId: 'u5', status: 'pending',
    tagline: '你自己的 prompt 版本库，带 diff',
    description: '每次调模型的 prompt 都存下来，可以对比不同版本的输出，支持分享给群友。',
    tags: ['工具','AI','效率','实验性'],
    cover: 1, likes: 0, views: 0, has: 'web',
    featuredAt: null, createdAt: '2026-04-15',
    screenshots: [1, 8, 4],
  },

  // Rejected
  {
    id: 'w16', title: '谁在上班摸鱼排行榜', type: 'social', authorId: 'u7', status: 'rejected',
    tagline: '公司域名聚合的摸鱼榜',
    description: '(略)',
    tags: ['社交','实验性'],
    cover: 11, likes: 0, views: 0, has: 'web',
    featuredAt: null, createdAt: '2026-04-14',
    screenshots: [11],
    rejectReason: '涉及员工画像和未授权数据聚合，先不收。',
  },
];

window.AIRCADE_COVER_THEMES = coverThemes;
