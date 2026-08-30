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
