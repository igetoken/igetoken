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
};

export const OFFER_TYPE_LABEL: Record<string, string> = {
  permanent: '永久免费',
  signup: '注册赠送',
  daily: '每日额度',
  credit: '赠金/额度',
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

export function getDealsByPlatform(slug: string): Deal[] {
  return getActiveDeals().filter((d) => d.platform_slug === slug);
}

/** 距截止还剩几天；deadline 为空或非日期格式返回 null */
export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}
