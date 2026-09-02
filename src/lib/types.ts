export type Category = 'domestic' | 'overseas' | 'aggregator';

export type OfferType = 'permanent' | 'signup' | 'daily' | 'credit';

export interface Offer {
  model: string;
  quota: string;
  type: OfferType;
}

export interface Platform {
  slug: string;
  name: string;
  category: Category;
  website: string;
  register_url: string;
  docs_url: string;
  tagline: string;
  highlight: string;
  tags: string[];
  offers: Offer[];
  steps: string[];
  pitfalls: string[];
  api_base?: string;
  example_model?: string;
  /** 是否兼容 OpenAI 接口协议；false 表示官方自有协议（如讯飞星火 WebSocket、Cohere v2），平台页将改用 sdk_example。缺省视为 true */
  openai_compatible?: boolean;
  /** 非 OpenAI 兼容平台的官方 SDK 调用示例（Python）；openai_compatible 为 false 时应提供 */
  sdk_example?: string;
  /** 附加接入端点（如 Coding Plan 专用端点），平台页以表格展示 */
  extra_endpoints?: { name: string; url: string }[];
  /** 编辑部推荐指数（1–5 星，整数）；仅对有实测体验的平台填写，缺省不显示。承载「质检员」主观评价层，与客观 pitfalls 区分 */
  rating?: number;
  /** 推荐指数的一句话编辑部说明（如实测短板），配合 rating 展示 */
  ratingNote?: string;
  last_verified: string;
}

export type DealType =
  | 'limited_time'
  | 'signup_bonus'
  | 'price_change'
  | 'new_model'
  | 'referral'
  | 'verify_bonus'
  | 'task_reward';

export interface Deal {
  id: string;
  date: string;
  platform_slug: string;
  platform_name: string;
  title: string;
  type: DealType;
  reward: string;
  eligibility: string;
  deadline: string | null;
  howto: string[];
  summary: string;
  source: string;
  status: 'active' | 'ended';
}

export type NoticeCategory = 'new' | 'notice' | 'maintenance' | 'alert';

export interface Notice {
  id: string;
  text: string;
  category: NoticeCategory;
  source: string;
  linkText?: string;
  publishedAt: string;
  expireAt: string;
  priority?: number;
  status?: 'active' | 'removed';
}

// Agent 产品内积分/福利（与 API Token 是两类东西，不可导出为 API）
export type PerkType = 'signin' | 'student' | 'limited' | 'invite';

export interface Perk {
  id: string;
  product: string;
  title: string;
  type: PerkType;
  amount: string;
  condition: string;
  recurrence: 'daily' | 'weekly' | 'once';
  deadline: string | null;
  validity: string;
  source: string;
  last_verified: string;
  note: string;
}
