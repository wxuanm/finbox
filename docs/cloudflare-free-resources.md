# Cloudflare 免费资源与限制

## 简短结论

Cloudflare 免费资源主要分两类：

| 类型 | 特点 |
| --- | --- |
| Cloudflare Free Plan | DNS、CDN、SSL、基础安全、Pages 静态站点等，通常不按量计费，但有功能和项目限制。 |
| 产品 Free Tier | Workers、KV、D1、R2 等有明确免费额度，超出后可能失败、需要付费计划，或开始计费，取决于产品。 |

## 静态网站 / CDN / DNS

| 资源 | 免费内容 | 主要限制 |
| --- | --- | --- |
| DNS 托管 | 免费 | 需要把域名 NS 托管到 Cloudflare。 |
| CDN 缓存 | 免费 | 动态请求不一定缓存，缓存行为受 Cache Rules、响应头、Worker/Pages Functions 影响。 |
| SSL/TLS | 免费 | 支持 Universal SSL。 |
| DDoS 基础防护 | 免费 | 高级 WAF、Bot 管理等需要更高套餐。 |
| Page Rules / Redirect / Cache Rules | 有免费额度或基础能力 | 高级规则数量和功能受套餐限制。 |
| Turnstile | 免费验证码替代方案 | 适合替代 reCAPTCHA，具体策略仍受滥用防护约束。 |

## Cloudflare Pages

适合托管前端静态站点，例如本项目的 `fundmonitor`。

| 项目 | 免费额度 / 限制 |
| --- | ---: |
| 构建次数 | 500 次/月 |
| 并发构建 | 1 个 |
| 单次构建超时 | 20 分钟 |
| 每个 Pages 项目文件数 | 20,000 个 |
| 单个静态资源大小 | 25 MiB |
| 自定义域名 | 每项目 100 个 |
| Pages 项目数 | 每账号 100 个 |
| Preview deployments | 可有无限多个活跃预览部署 |
| `_headers` 规则 | 最多 100 条 |
| `_redirects` | 2,000 静态 + 100 动态，总计 2,100 条 |

注意：Pages 静态资源请求本身通常免费且不计 Workers 请求数；Pages Functions 会按 Workers 规则计入额度。

## Workers / Pages Functions

适合写 API，例如本项目的 `/api/fundnav`、`/api/fundgz`。

| 项目 | Free Plan |
| --- | ---: |
| Worker 请求数 | 100,000 次/天 |
| CPU 时间 | 每次调用 10ms CPU |
| Duration | 不单独收费 |
| 静态资源请求 | 免费且不计 Worker 请求 |
| Workers Logs | 200,000 条/天，保留 3 天 |

| 行为 | 说明 |
| --- | --- |
| Pages Functions | 按 Workers 额度计费/限流。 |
| Worker 调外部 API | 外部 `fetch` 子请求不单独按请求计费，但受平台限制和 CPU 时间影响。 |
| 超过 Free 额度 | 通常该类操作会失败或被限制，而不是自动无限扩容。 |
| Worker Cache | 如果请求命中 Worker cache，仍可能按 Worker 请求计数；CPU 只在 Worker 实际运行时消耗。 |
| 免费计划不适合重计算 | 10ms CPU 很紧，适合轻量 API、代理、缓存层，不适合复杂计算。 |

## KV

适合全局低频配置、简单缓存、读多写少数据。

| 项目 | Free Plan |
| --- | ---: |
| 读取 | 100,000 次/天 |
| 写入 | 1,000 次/天 |
| 删除 | 1,000 次/天 |
| List | 1,000 次/天 |
| 存储 | 1 GB |

| 规则 | 说明 |
| --- | --- |
| 额度重置 | 每天 UTC 00:00 重置。 |
| 超额行为 | 超过某类操作额度后，该类操作会失败。 |
| 非命中读取也计费/计数 | 读一个不存在的 key 也算一次读取。 |
| 批量操作 | 按 key 数量计数。 |
| 适用场景 | 配置、缓存、小对象、读多写少。 |
| 不适合 | 高频写入、强一致事务、复杂查询。 |

## D1

Cloudflare 的 serverless SQLite，适合轻量关系型数据。

| 项目 | Free Plan |
| --- | ---: |
| Rows read | 5,000,000 行/天 |
| Rows written | 100,000 行/天 |
| 存储 | 5 GB 总量 |

| 规则 | 说明 |
| --- | --- |
| 按扫描行数计 | 不是按返回行数计，没索引的查询可能读很多行。 |
| 写入包括 | `INSERT`、`UPDATE`、`DELETE`。 |
| 索引会增加写入成本 | 写入被索引字段时，表和索引都可能计入写行。 |
| 适用场景 | 小型后台、配置、轻量业务数据。 |
| 不适合 | 大规模 OLAP、高频写入、大事务系统。 |

## R2

对象存储，类似 S3，重点是出网流量免费。

| 项目 | Free Tier |
| --- | ---: |
| Standard 存储 | 10 GB-month/月 |
| Class A 操作 | 1,000,000 次/月 |
| Class B 操作 | 10,000,000 次/月 |
| 出网流量 | 免费 |

| 类型 | 示例 |
| --- | --- |
| Class A | `PutObject`、`ListObjects`、multipart upload、复制对象。 |
| Class B | `GetObject`、`HeadObject`。 |
| 免费操作 | `DeleteObject`、`AbortMultipartUpload`。 |

| 规则 | 说明 |
| --- | --- |
| 免费额度只适用于 Standard storage | Infrequent Access 不享受免费层。 |
| R2 可以产生费用 | 如果启用了计费并超出免费额度，会按量收费。 |
| 出网免费不等于操作免费 | 读对象很多时 Class B 仍可能收费。 |
| 适合 | 图片、备份、静态大文件、用户上传文件。 |
| 不适合 | 极高频小对象读写且没有缓存的场景。 |

## Durable Objects

适合状态协调、WebSocket、单对象串行一致性。

| 项目 | Free Plan |
| --- | ---: |
| 可用后端 | 仅 SQLite-backed Durable Objects |
| 请求 | 100,000 次/天 |
| Duration | 13,000 GB-s/天 |
| SQLite rows read | 5,000,000 行/天 |
| SQLite rows written | 100,000 行/天 |
| SQLite 存储 | 5 GB 总量 |

| 规则 | 说明 |
| --- | --- |
| 免费计划只能用 SQLite-backed DO | 老的 KV-backed DO 主要是付费/历史兼容。 |
| WebSocket 要注意 hibernation | 否则长连接可能持续消耗 duration。 |
| 适合 | 房间状态、协作编辑、限流器、WebSocket hub。 |
| 不适合 | 大规模普通数据库替代、无状态 API。 |

## Queues

适合异步任务、削峰。

| 项目 | Free Plan |
| --- | ---: |
| 操作数 | 10,000 operations/天 |
| 消息保留 | 24 小时，不能配置 |

| 规则 | 说明 |
| --- | --- |
| 操作按 64KB 计 | 大消息会拆成多个 operation。 |
| 常规消息成本 | 一条消息通常至少 3 次操作：写、读、删。 |
| 重试也计操作 | 每次 retry 会增加 read operation。 |
| 适合 | 少量异步任务、通知、后台处理。 |
| 不适合 | 大规模队列、高保留周期任务。 |

## Hyperdrive

数据库连接加速，常用于从 Workers 访问外部 Postgres。

| 项目 | Free Plan |
| --- | ---: |
| Database queries | 100,000 次/天 |

| 规则 | 说明 |
| --- | --- |
| 查询定义广 | `SELECT`、`INSERT`、`UPDATE`、`DELETE`、DDL 都算。 |
| 适合 | Workers 访问已有数据库。 |
| 不适合 | 高频 DB workload 且没有付费计划。 |

## Workflows

适合编排长流程任务。

| 项目 | Free Plan |
| --- | ---: |
| 请求 | 100,000 次/天，与 Workers 请求共享 |
| CPU | 每次 10ms CPU |
| 存储 | 1 GB |
| Steps | 3,000 steps/天 |

## Vectorize

向量数据库，适合小规模 RAG / embedding 检索测试。

| 项目 | Free Tier |
| --- | ---: |
| 查询向量维度 | 30,000,000 queried vector dimensions/月 |
| 存储向量维度 | 5,000,000 stored vector dimensions |

规模上来后要重点计算维度数，不是只计算请求数。

## 免费计划通用规则

| 规则 | 说明 |
| --- | --- |
| Free 不等于无限 | 大部分产品都有日/月额度、对象数量、文件大小、CPU、构建次数限制。 |
| 日额度通常 UTC 00:00 重置 | KV、D1、Workers 等很多是按 UTC 日重置。 |
| 月额度按账期或自然月 | R2、Workers Paid included usage 等多为月度。 |
| 超额行为不同 | 有的失败，有的需要升级，有的如果已启用计费会按量收费。 |
| 静态资源和动态函数分开看 | Pages 静态请求很宽松，Pages Functions 会消耗 Workers 额度。 |
| 响应头不保证 CDN 缓存 | 动态 API 是否缓存取决于 Cloudflare 产品、规则、路径、响应头和是否经过 Worker。 |
| 免费计划没有生产 SLA | 关键业务需要考虑 Pro/Business/Workers Paid。 |
| 反滥用优先级高 | 异常流量、爬虫、攻击、滥用行为可能触发限制。 |
| 额度可能调整 | Cloudflare 文档会更新，正式上线前最好再核对对应产品 pricing/limits 页。 |

## 结合当前项目

| 资源 | 对本项目的意义 |
| --- | --- |
| Pages | 托管前端页面，免费额度通常足够。 |
| Pages Functions / Workers | `/api/fundnav` 和 `/api/fundgz` 会消耗 Workers 免费请求，每天 100,000 次。 |
| CDN Cache | 静态文件会自然受益，API 不一定缓存。 |
| Browser cache / localStorage | 历史趋势有前端本地缓存，跟 Cloudflare 额度无关。 |
| R2 / KV / D1 | 当前如果没用，就不会产生对应资源消耗。 |

如果访问量不大，例如每天几百到几千次 API 请求，Cloudflare 免费计划基本够用。真正需要关注的是 Workers 的 `100,000 requests/day` 和 `10ms CPU/invocation`，以及外部数据源东方财富接口的稳定性。
