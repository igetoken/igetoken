/**
 * 结构化数据（JSON-LD）构建器。
 *
 * 三条原则，避免「为了 SEO 而编数据」：
 * 1. 只标注页面真实可见的信息——不编造评分、评论数、价格、图片；
 * 2. 站点级节点（WebSite / Organization）每页都带，页面级节点各页按需追加，
 *    最终由 Base.astro 合并成**单个** @graph 输出（一份 JSON 比散落多个 script 更易被解析）；
 * 3. 节点之间用 @id 互相引用而非内联复制，既省体积也让实体关系可被串联。
 */

export const SITE = 'https://igetoken.com';
export const SITE_NAME = 'iGetoken';
export const SITE_LANG = 'zh-CN';
export const SITE_EMAIL = 'igetoken@outlook.com';
export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;

export type SchemaNode = Record<string, unknown>;

/** 相对路径 → 绝对 URL（已是绝对地址则原样返回） */
export const abs = (p: string): string => (/^https?:\/\//.test(p) ? p : new URL(p, SITE).href);

/** 站点级节点：每页都输出。WebSite 带站内搜索入口，指向本站全局搜索的深链 `/?q=` */
export function siteNodes(): SchemaNode[] {
  return [
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url: `${SITE}/`,
      name: SITE_NAME,
      alternateName: 'iGetoken 免费 AI 额度导航',
      description:
        '只收录官方正规渠道的免费大模型 API 与 Token 福利，附领取步骤、调用示例与坑点提醒。',
      inLanguage: SITE_LANG,
      publisher: { '@id': ORG_ID },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE}/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE_NAME,
      url: `${SITE}/`,
      description:
        '免费大模型额度导航站：人工核实官方信源后收录，不做 API 中转、不做 Token 转售。',
      logo: {
        '@type': 'ImageObject',
        '@id': `${SITE}/#logo`,
        url: `${SITE}/favicon.svg`,
        contentUrl: `${SITE}/favicon.svg`,
        caption: SITE_NAME,
      },
      email: SITE_EMAIL,
    },
  ];
}

/**
 * 面包屑。items 按「首页 → … → 当前页」顺序传入，最后一项即当前页。
 * 名称与站点导航保持一致，避免结构化数据与页面导航两套说法。
 */
export function breadcrumbNode(pageUrl: string, items: { name: string; url: string }[]): SchemaNode {
  const url = abs(pageUrl);
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.url),
    })),
  };
}

/** 页面节点。type 用于区分普通页 / 集合页（CollectionPage）/ 关于页（AboutPage）等 */
export function webPageNode(opts: {
  url: string;
  name: string;
  description: string;
  type?: string;
  withBreadcrumb?: boolean;
}): SchemaNode {
  const url = abs(opts.url);
  const node: SchemaNode = {
    '@type': opts.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    inLanguage: SITE_LANG,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
  };
  if (opts.withBreadcrumb !== false) node.breadcrumb = { '@id': `${url}#breadcrumb` };
  return node;
}

/**
 * 详情页文章节点（教程 / 平台攻略 / 活动快讯）。
 * 作者与发布方统一挂 Organization（本站为编辑部运营，不虚构个人作者）。
 */
export function articleNode(opts: {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  keywords?: string[];
  articleSection?: string;
  about?: SchemaNode;
}): SchemaNode {
  const url = abs(opts.url);
  const node: SchemaNode = {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: opts.headline,
    description: opts.description,
    inLanguage: SITE_LANG,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    mainEntityOfPage: { '@id': `${url}#webpage` },
    isPartOf: { '@id': WEBSITE_ID },
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
  if (opts.articleSection) node.articleSection = opts.articleSection;
  if (opts.keywords?.length) node.keywords = opts.keywords.join(',');
  if (opts.about) node.about = opts.about;
  return node;
}

/**
 * 列表节点。仅用于「条目在本站有详情页」的列表（资源库 / 活动快讯 / 教程）；
 * 积分福利与搜索 API 的条目指向站外，故不输出 ItemList，避免把站外页面当成本页内容声明。
 */
export function itemListNode(opts: {
  url: string;
  name: string;
  items: { name: string; url: string }[];
}): SchemaNode {
  const url = abs(opts.url);
  const items = opts.items.slice(0, 50);
  return {
    '@type': 'ItemList',
    '@id': `${url}#itemlist`,
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: abs(it.url),
    })),
  };
}

/** 「首页 → 当前页」的两级面包屑，列表页通用 */
export function topLevelBreadcrumb(pageUrl: string, label: string): SchemaNode {
  return breadcrumbNode(pageUrl, [
    { name: '首页', url: '/' },
    { name: label, url: pageUrl },
  ]);
}
