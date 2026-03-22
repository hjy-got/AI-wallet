# AI钱包 - 商户经营分析工具

## 1. 项目概述

**项目名称**: AI钱包  
**项目类型**: 商户经营分析Web应用  
**核心功能**: 基于商户上传的支付订单数据，生成数据可视化 + 经营洞察 + AI问答分析  
**目标用户**: 商户经营者、零售店经理、连锁店管理者

## 2. UI/UX 规范

### 2.1 页面结构

```
├── index.html          # 首页 - 生意报表 (Dashboard)
├── analysis.html       # 数据分析页面
├── ai-assistant.html   # AI助手页面
├── css/
│   └── styles.css      # 共享样式
├── js/
│   ├── app.js          # 核心应用逻辑
│   ├── data-parser.js  # Excel/CSV解析
│   ├── chart-handler.js # 图表处理
│   └── ai-handler.js   # AI对话处理
└── data/
    └── sample-data.csv # 示例数据
```

### 2.2 视觉设计

**配色方案** (Material Design 3):
- 主色 (Primary): #6d5a00 (深金色)
- 主色强调 (Primary Container): #fed737 (亮金色)
- 背景色: #f4f6ff (浅蓝灰)
- 表面色: #ffffff
- 辅助色: #006940 (深绿)
- 错误色: #b02500
- 文字主色: #252f3d
- 文字辅助色: #525c6b

**字体**:
- 主字体: Inter (Google Fonts)
- 图标: Material Symbols Outlined

**组件**:
- 卡片: 圆角16px, 轻微阴影
- 按钮: 圆角full, 悬停动画
- 输入框: 圆角full, 玻璃态效果

### 2.3 响应式断点

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 3. 功能规范

### 3.1 数据上传

**支持格式**: Excel (.xlsx, .xls), CSV

**字段结构**:
| 字段名 | 类型 | 说明 |
|--------|------|------|
| order_id | string | 订单ID |
| order_time | datetime | 订单时间 |
| product_name | string | 商品名称 |
| product_category | string | 商品类别 |
| product_ip | string | 商品品牌IP |
| order_amount | number | 订单金额 |
| payment_method | string | 支付方式 |
| payment_source | string | 支付来源 |
| customer_id | string | 用户ID |
| promotion_id | string | 活动ID |
| promotion_name | string | 活动名称 |
| discount_amount | number | 优惠金额 |

**自动计算指标**:
- total_revenue: 总收入
- order_count: 订单量
- average_order_value: 客单价
- category_revenue: 品类销售额
- online_revenue: 线上收入
- offline_revenue: 线下收入

### 3.2 首页功能

- 时间筛选: 日/周/月/自定义
- KPI卡片: 总收入、订单量、客单价
- 趋势图: 销售额趋势、订单量趋势
- 底部上传按钮

### 3.3 数据分析功能

- 全局时间筛选
- 商品排行榜: 销量Top10、销售额Top10
- 预测分析: 销售额预测、客流量预测
- 支付方式分析: 饼图展示
- 活动效果分析: ROI展示

### 3.4 AI助手

- 角色: 金融/支付领域数据分析专家
- 能力: 基于真实数据提供经营建议
- 输出格式: 数据结论 + 原因分析 + 优化建议
- 自然语言问答

## 4. 验收标准

- [ ] 三个页面正常加载
- [ ] 底部导航在各页面间切换
- [ ] 时间筛选器可切换粒度
- [ ] KPI卡片显示正确数据
- [ ] 趋势图正确渲染
- [ ] Excel/CSV文件可上传解析
- [ ] 排行榜正确排序显示
- [ ] 饼图正确显示支付占比
- [ ] AI助手可进行对话
- [ ] 响应式布局正常