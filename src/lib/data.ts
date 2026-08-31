import type { Category, Deal, DealType, Platform } from './types';
import modelsJson from '../data/models.json';
import dealsJson from '../data/deals.json';

export const CATEGORY_LABEL: Record<Category, string> = {
  domestic: '国内大厂',
  overseas: '海外平台',
  aggregator: '聚合与工具',
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  limited_time: '限时活动',
  signup_bonus: '新人福利',
  price_change: '价格变动',
  new_model: '免费上新',
  referral: '邀请奖励',
  verify_bonus: '认证福利',
  task_reward: '任务奖励',
};

export const OFFER_TYPE_LABEL: Record<string, string> = {
  permanent: '永久免费',
  signup: '注册赠送',
  daily: '每日额度',
  credit: '赠金/额度',
  referral: '邀请奖励',
};

const platforms = modelsJson as unknown as Platform[];
const deals = dealsJson as unknown as Deal[];

export function getPlatforms(): Platform[] {
  return platforms;
}

export function getPlatformBySlug(slug: string): Platform | undefined {
  return platforms.find((p) => p.slug === slug);
}

export function getDeals(): Deal[] {
  return [...deals].sort((a, b) => b.date.localeCompare(a.date));
}

export function getActiveDeals(): Deal[] {
  return getDeals().filter((d) => d.status === 'active');
}

export function getEndedDeals(): Deal[] {
  return getDeals().filter((d) => d.status === 'ended');
}

export function getDealById(id: string): Deal | undefined {
  return deals.find((d) => d.id === id);
}

/** 按紧迫度排序：有截止日期且未过期的进行中活动优先（剩余天数升序），其余按发布时间倒序 */
export function sortDealsByUrgency(list: Deal[]): Deal[] {
  return [...list].sort((a, b) => {
    const urgency = (deal: Deal) => {
      if (deal.status !== 'active') return Number.POSITIVE_INFINITY;
      const left = daysLeft(deal.deadline);
      return left !== null && left >= 0 ? left : Number.POSITIVE_INFINITY;
    };
    const diff = urgency(a) - urgency(b);
    return diff !== 0 ? diff : b.date.localeCompare(a.date);
  });
}

export function getDealsByPlatform(slug: string): Deal[] {
  return getActiveDeals().filter((d) => d.platform_slug === slug);
}

/**
 * 从 deadline 字段解析日期，支持四种写法（依次兜底）：
 * 1. 纯 ISO「2026-09-06」
 * 2. ISO 后带中文说明「2026-09-30（2026 Q3 活动窗口，以官方为准）」
 * 3. 中文月日「8 月 31 日 09:00 失效」（按当前年份构造）
 * 4. 解析不出日期 → null（如「未知，建议尽快领取」，保持 Infinity 语义）
 */
function parseDeadline(deadline: string | null): Date | null {
  if (!deadline) return null;

  const direct = new Date(deadline);
  if (!Number.isNaN(direct.getTime())) return direct;

  const iso = deadline.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const monthDay = deadline.match(/(\d{1,2})\s*[月./]\s*(\d{1,2})\s*日?/);
  if (monthDay) {
    const d = new Date(new Date().getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/** 距截止还剩几天；deadline 为空或解析不出日期返回 null */
export function daysLeft(deadline: string | null): number | null {
  const end = parseDeadline(deadline);
  if (!end) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/** 首页快讯：紧急（剩余天数 ≤ 7）的判定阈值 */
export const HOME_URGENT_DAYS = 7;

/** 首页快讯：同一平台最多展示条数，避免同一厂商刷屏 */
export const HOME_MAX_PER_PLATFORM = 2;

/** 从文本中解析最大的 Token 量级（亿/万），无则返回 0，用于头条价值评估 */
function parseTokenMagnitude(text: string): number {
  let max = 0;
  const re = /(\d+(?:\.\d+)?)\s*[亿万]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1]);
    const unit = m[0].includes('亿') ? 1e8 : 1e4;
    max = Math.max(max, n * unit);
  }
  return max;
}

/** 头条候选资格：进行中 + 有官方平台页（真 API Token 来源）+ 是真额度（Token 量级 / 永久免费模型） */
function isFeaturedEligible(deal: Deal): boolean {
  if (deal.status !== 'active') return false;
  if (!deal.platform_slug) return false;
  const mag = parseTokenMagnitude(`${deal.title} ${deal.reward}`);
  const permanent = (deal.deadline ?? '').includes('永久') || deal.type === 'new_model';
  return mag > 0 || permanent;
}

/** 头条价值评分：类型基础分 + Token 量级 + 持续性 − 紧迫度惩罚 + 每日复得 */
export function valueScore(deal: Deal): number {
  const typeBase: Record<DealType, number> = {
    signup_bonus: 3,
    new_model: 3,
    limited_time: 2,
    verify_bonus: 2,
    referral: 2,
    price_change: 1,
    task_reward: 1,
  };
  let score = typeBase[deal.type] ?? 1;

  const mag = parseTokenMagnitude(`${deal.title} ${deal.reward}`);
  if (mag >= 1e8) score += 3;
  else if (mag >= 1e7) score += 2;
  else if (mag >= 1e6) score += 1;

  if (deal.deadline == null || (deal.deadline ?? '').includes('永久')) score += 2;
  else {
    const left = daysLeft(deal.deadline);
    if (left !== null && left > 30) score += 1;
    else if (left !== null && left <= 7) score -= 1;
  }

  if (`${deal.title} ${deal.reward}`.includes('每日')) score += 1;

  return score;
}

/** 头条：合格候选中价值最高者；同分时比 Token 量级（更大者胜），再比发布日；无合格候选则回退紧迫度最前 */
export function selectHomeFeatured(): Deal | undefined {
  const active = getActiveDeals();
  const pool = active.filter(isFeaturedEligible);
  const candidates = pool.length > 0 ? pool : active;
  return [...candidates].sort((a, b) => {
    const diff = valueScore(b) - valueScore(a);
    if (diff !== 0) return diff;
    const mag = parseTokenMagnitude(b.title + ' ' + b.reward) - parseTokenMagnitude(a.title + ' ' + a.reward);
    if (mag !== 0) return mag;
    return b.date.localeCompare(a.date);
  })[0];
}

/**
 * 选取首页展示的快讯：
 * - 头条 = 价值最高的合格快讯（见 selectHomeFeatured），不再按紧迫度抢占
 * - 其余小卡按紧迫度排序（已结束归档不进首页），排除头条本身
 * - 小卡数量封顶 limit-1，受同平台限流约束
 */
export function selectHomeDeals(limit = 9): Deal[] {
  const featured = selectHomeFeatured();
  const rest = sortDealsByUrgency(getActiveDeals()).filter((d) => d !== featured);

  const usedByPlatform = new Map<string, number>();
  const picked: Deal[] = [];

  const take = (deal: Deal) => {
    const key = deal.platform_slug || deal.platform_name;
    const used = usedByPlatform.get(key) ?? 0;
    if (used >= HOME_MAX_PER_PLATFORM) return;
    usedByPlatform.set(key, used + 1);
    picked.push(deal);
  };

  for (const deal of rest) {
    if (picked.length >= limit - 1) break;
    take(deal);
  }

  return featured ? [featured, ...picked] : picked;
}
