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

/**
 * 选取首页展示的快讯：
 * - 只用进行中的活动，已结束归档不进首页
 * - 第一轮纳入所有紧急条目（≤7 天），时效优先，不受 limit 限制
 * - 第二轮按紧急度补足到 limit
 * - 两轮均受同平台限流约束
 */
export function selectHomeDeals(limit = 9): Deal[] {
  const ranked = sortDealsByUrgency(getActiveDeals());
  const usedByPlatform = new Map<string, number>();
  const picked: Deal[] = [];

  const take = (deal: Deal) => {
    const key = deal.platform_slug || deal.platform_name;
    const used = usedByPlatform.get(key) ?? 0;
    if (used >= HOME_MAX_PER_PLATFORM) return;
    usedByPlatform.set(key, used + 1);
    picked.push(deal);
  };

  const isUrgent = (deal: Deal) => {
    const left = daysLeft(deal.deadline);
    return left !== null && left >= 0 && left <= HOME_URGENT_DAYS;
  };

  ranked.filter(isUrgent).forEach(take);

  for (const deal of ranked) {
    if (picked.length >= limit) break;
    if (picked.includes(deal)) continue;
    take(deal);
  }

  return picked;
}
