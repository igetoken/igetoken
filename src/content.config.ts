import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tutorials = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/tutorials' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    // 内容复核日期：额度、接口、工具版本会变，读者需要知道「这篇还准吗」
    updatedAt: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    // 首页「保姆级教程」区块取 featured 的条目（人工精选语义，按更新日期排序）
    featured: z.boolean().default(false),
    emoji: z.string().default('📘'),
  }),
});

export const collections = { tutorials };
