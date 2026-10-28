/**
 * 30 帖关卡表。ink / star2 / star3 由模拟器校准（npm run sim -- --calibrate），见 docs/hanzi-merge.md §5.2。
 */
import type { LevelDef } from '../core/types.ts';

export const CHAPTER_NAMES = ['叠字', '会意', '偏旁', '上下与包围', '字上生字', '三才'];

export const LEVELS: LevelDef[] = [
  { id: 1, chapter: 1, targets: ['林', '森'], active: 1, decoys: [], decoyRate: 0, hintStart: 2, ink: 8, star2: 2, star3: 3, script: ['木', '木', '木', '木', '木', '木', '木', '木'] },
  { id: 2, chapter: 1, targets: ['从', '众', '林'], active: 2, decoys: [], decoyRate: 0, hintStart: 2, ink: 9, star2: 1, star3: 2 },
  { id: 3, chapter: 1, targets: ['炎', '焱', '多'], active: 2, decoys: ['木'], decoyRate: 0.1, hintStart: 2, ink: 9, star2: 1, star3: 2, tip: 'discard' },
  { id: 4, chapter: 1, targets: ['双', '圭', '哥', '森'], active: 2, decoys: ['人'], decoyRate: 0.1, hintStart: 1, ink: 11, star2: 1, star3: 2, tip: 'hint' },
  { id: 5, chapter: 1, targets: ['赫', '众', '焱', '多', '圭', '哥'], active: 2, decoys: ['木', '又'], decoyRate: 0.15, hintStart: 1, ink: 17, star2: 1, star3: 2 },
  { id: 6, chapter: 2, targets: ['明', '休', '好', '安', '字'], active: 3, decoys: ['目', '口'], decoyRate: 0.12, hintStart: 2, ink: 14, star2: 3, star3: 4 },
  { id: 7, chapter: 2, targets: ['男', '鸣', '吠', '尖', '尘', '名'], active: 3, decoys: ['自', '一'], decoyRate: 0.15, hintStart: 1, ink: 17, star2: 3, star3: 4 },
  { id: 8, chapter: 2, targets: ['囚', '困', '因', '国', '闪', '闯', '间'], active: 3, decoys: ['山', '戈'], decoyRate: 0.18, hintStart: 1, ink: 22, star2: 6, star3: 7 },
  { id: 9, chapter: 2, targets: ['本', '末', '天', '正', '歪', '旦', '灭'], active: 3, decoys: ['月', '小'], decoyRate: 0.18, hintStart: 1, ink: 20, star2: 5, star3: 6, preset: [[5, '木'], [9, '一']], tip: 'zone' },
  { id: 10, chapter: 2, targets: ['看', '相', '析', '采', '臭', '息', '美', '突'], active: 3, decoys: ['人', '口'], decoyRate: 0.2, hintStart: 0, ink: 24, star2: 5, star3: 6 },
  { id: 11, chapter: 3, targets: ['清', '情', '请', '晴', '睛', '精'], active: 3, decoys: ['可', '工'], decoyRate: 0.15, hintStart: 2, ink: 14, star2: 1, star3: 2, tip: 'phonetic' },
  { id: 12, chapter: 3, targets: ['河', '何', '江', '红', '功', '虹', '泪'], active: 3, decoys: ['青', '也'], decoyRate: 0.12, hintStart: 1, ink: 21, star2: 5, star3: 6 },
  { id: 13, chapter: 3, targets: ['他', '她', '地', '池', '驰', '仙', '信', '位', '伐'], active: 3, decoys: ['主', '白'], decoyRate: 0.2, hintStart: 1, ink: 30, star2: 9, star3: 10 },
  { id: 14, chapter: 3, targets: ['抱', '泡', '饱', '炮', '袍', '妈', '吗', '住', '注', '柱', '驻'], active: 3, decoys: ['白', '皮'], decoyRate: 0.22, hintStart: 1, ink: 32, star2: 6, star3: 7 },
  { id: 15, chapter: 3, targets: ['伯', '泊', '拍', '柏', '怕', '被', '波', '破', '坡', '披'], active: 3, decoys: ['包', '主'], decoyRate: 0.22, hintStart: 0, ink: 28, star2: 4, star3: 6 },
  { id: 16, chapter: 4, targets: ['宝', '守', '灾', '完', '空', '字', '安', '件'], active: 3, decoys: ['犬', '口'], decoyRate: 0.18, hintStart: 1, ink: 20, star2: 1, star3: 2 },
  { id: 17, chapter: 4, targets: ['苗', '芳', '芭', '芒', '早', '古', '吉', '告', '吧', '把'], active: 3, decoys: ['心', '女'], decoyRate: 0.22, hintStart: 1, ink: 30, star2: 6, star3: 7 },
  { id: 18, chapter: 4, targets: ['远', '近', '园', '爬', '含', '念', '盲', '忘', '忙'], active: 3, decoys: ['木', '手'], decoyRate: 0.22, hintStart: 0, ink: 29, star2: 7, star3: 9 },
  { id: 19, chapter: 4, targets: ['星', '忠', '岛', '雷', '思', '企', '雀', '集'], active: 3, decoys: ['口', '力'], decoyRate: 0.24, hintStart: 0, ink: 22, star2: 3, star3: 4 },
  { id: 20, chapter: 4, targets: ['阳', '阴', '防', '社', '视', '现', '玩', '计', '访', '订'], active: 3, decoys: ['青', '生'], decoyRate: 0.24, hintStart: 0, ink: 30, star2: 5, star3: 7 },
  { id: 21, chapter: 5, targets: ['想', '霜', '箱', '相', '伏', '如', '性', '姓', '牲'], active: 3, decoys: ['斤', '自'], decoyRate: 0.2, hintStart: 2, ink: 31, star2: 6, star3: 8, tip: 'chain' },
  { id: 22, chapter: 5, targets: ['淋', '禁', '焚', '淡', '谈', '取', '加'], active: 3, decoys: ['人', '青'], decoyRate: 0.12, hintStart: 1, ink: 29, star2: 8, star3: 9 },
  { id: 23, chapter: 5, targets: ['苦', '姑', '枯', '草', '但', '岩', '笔'], active: 3, decoys: ['士', '月'], decoyRate: 0.25, hintStart: 1, ink: 32, star2: 9, star3: 11 },
  { id: 24, chapter: 5, targets: ['佳', '挂', '娃', '蛙', '洼', '按', '案'], active: 3, decoys: ['子', '包'], decoyRate: 0.26, hintStart: 0, ink: 31, star2: 6, star3: 7 },
  { id: 25, chapter: 5, targets: ['召', '昭', '照', '招', '架', '驾', '梨', '歌'], active: 3, decoys: ['青', '也'], decoyRate: 0.26, hintStart: 0, ink: 38, star2: 10, star3: 11 },
  { id: 26, chapter: 6, targets: ['品', '晶', '磊', '渔', '武'], active: 3, decoys: ['马', '月'], decoyRate: 0.22, hintStart: 1, ink: 17, star2: 1, star3: 2, tip: 'pending' },
  { id: 27, chapter: 6, targets: ['淼', '鑫', '犇', '毳', '骂', '鲜'], active: 3, decoys: ['丁', '人'], decoyRate: 0.26, hintStart: 0, ink: 29, star2: 8, star3: 9 },
  { id: 28, chapter: 6, targets: ['分', '粉', '芬', '份', '初', '利', '洋', '样', '仿', '纺'], active: 3, decoys: ['青', '可'], decoyRate: 0.28, hintStart: 0, ink: 33, star2: 4, star3: 6 },
  { id: 29, chapter: 6, targets: ['钟', '种', '仲', '打', '灯', '钉', '时', '独', '肚', '肥', '和', '焦'], active: 3, decoys: ['心', '包'], decoyRate: 0.28, hintStart: 0, ink: 33, star2: 3, star3: 5 },
  { id: 30, chapter: 6, targets: ['照', '想', '歌', '品', '鑫', '架', '森', '赫'], active: 3, decoys: ['人', '女'], decoyRate: 0.3, hintStart: 0, ink: 30, star2: 1, star3: 2 },
];
