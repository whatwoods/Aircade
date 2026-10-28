/**
 * 用打包楷体（霞鹜文楷子集）显示的界面文字。tools/build-font.ts 会把这里的每个字收进子集，
 * tools/check-dist.ts 在构建结束时核对。凡是用 'HMKai' 字体绘制/显示的字符串，都必须来自这里或字库数据。
 * 其他说明性文字（新字卡引文、提示条、菜单说明）用系统字体栈，不受此限。
 */
export const KAI = {
  title: '造字记',
  chapter: '卷一二三四五六',
  level: '第帖',
  endless: '书斋第章',
  ink: '墨',
  score: '分',
  start: '开始',
  menu: '选帖书斋图鉴设置',
  pause: '暂停继续重写本帖回到标题',
  result: '帖成墨尽再写一遍下一帖新纪录本帖新识还差',
  rack: '悔笔提示笔洗',
  pending: '未成',
  method: '会意形声指事',
  methodShort: '会形指',
  atlas: '已收全部件按卷造字法',
  stars: '星',
  chapters: '叠字会意偏旁上下与包围字上生字三才',
  misc: '新字得来一局成淼',
  digits: '0123456789',
  punct: '·：/+？−×—（）',
} as const;

/** 用马善政子集显示（Logo、大字） */
export const LOGO = '造字记帖成墨尽新纪录书斋全';

/** 所有楷体界面字符 */
export function kaiUiChars(): string {
  return Object.values(KAI).join('');
}
