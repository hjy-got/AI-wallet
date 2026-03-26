#!/usr/bin/env python3
"""
AI钱包 - 代理服务器
支持前端页面调用百炼API，解决CORS跨域问题
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.error
from urllib.parse import urlparse, parse_qs
import os

PORT = 8080

# 百炼API配置 - 使用标准DashScope API
BAILIAN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
BAILIAN_API_KEY = 'sk-330b01bd665a49c88ebc7ec5a16bc72b'
BAILIAN_MODEL = 'qwen-plus'

# 系统提示词
SYSTEM_PROMPT = """你是一个专业的商户经营分析助手，专门为商户提供数据驱动的经营建议。

请严格按照以下JSON格式回复，不要返回其他内容：
{"conclusion":"数据结论（一句话总结当前经营状况）","analysis":"原因分析（分析数据变化的主要原因）","suggestions":"优化建议（2-3条可执行的改进建议，用分号分隔）"}

注意事项：
1. 请根据实际数据进行分析，不要编造数据
2. 如果数据不足，明确告知用户
3. 建议要具体可执行
4. 使用中文回复
5. 只返回JSON，不要有任何其他文字"""

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '3600')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/chat':
            self.handle_chat_api()
        else:
            self.send_error(404)

    def handle_chat_api(self):
        try:
            # 读取请求体
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            request_json = json.loads(post_data.decode('utf-8'))

            user_message = request_json.get('message', '')
            context_data = request_json.get('contextData', None)
            full_raw_data = request_json.get('fullRawData', [])

            # 构建prompt
            prompt = user_message
            
            # 优先使用完整原始数据
            if full_raw_data and len(full_raw_data) > 0:
                prompt = self.format_full_data_for_ai(full_raw_data) + f"\n\n请根据以上数据回答用户问题：{user_message}"
            elif context_data:
                top_products = context_data.get('topProducts', [])
                top_categories = context_data.get('topCategories', [])
                products_text = '、'.join([p.get('name', '') for p in top_products[:3]]) if top_products else '暂无'
                categories_text = '、'.join([c.get('category', '') for c in top_categories[:3]]) if top_categories else '暂无'
                revenue_change = context_data.get('revenueChange', 0)
                change_text = f"+{revenue_change:.1f}%" if revenue_change > 0 else f"{revenue_change:.1f}%" if revenue_change else '暂无'
                
                prompt = f"""基于以下数据回答用户问题：
数据摘要：
- 时间范围：{context_data.get('timeRange', '当日')}
- 总收入：¥{context_data.get('totalRevenue', 0):.2f}
- 订单量：{context_data.get('orderCount', 0)}笔
- 客单价：¥{context_data.get('aov', 0):.2f}
- 线上收入：¥{context_data.get('onlineRevenue', 0):.2f}
- 线下收入：¥{context_data.get('offlineRevenue', 0):.2f}
- 热销商品：{products_text}
- 热销品类：{categories_text}
- 销售变化：{change_text}
- 折扣率：{context_data.get('discountRate', 0):.1f}%
- 销售高峰：{context_data.get('peakHour', {}).get('hour', 0)}点

用户问题：{user_message}"""

            # 调用百炼API - 使用标准DashScope API
            api_request = urllib.request.Request(
                BAILIAN_API_URL,
                data=json.dumps({
                    'model': BAILIAN_MODEL,
                    'input': {
                        'messages': [
                            {'role': 'system', 'content': SYSTEM_PROMPT},
                            {'role': 'user', 'content': prompt}
                        ]
                    },
                    'parameters': {'temperature': 0.7}
                }).encode('utf-8'),
                headers={
                    'Authorization': f'Bearer {BAILIAN_API_KEY}',
                    'Content-Type': 'application/json'
                },
                method='POST'
            )

            with urllib.request.urlopen(api_request, timeout=30) as api_response:
                api_data = json.loads(api_response.read().decode('utf-8'))
                
                # 返回响应
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(api_data).encode('utf-8'))

        except Exception as e:
            error_response = {'error': str(e)}
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def end_headers(self):
        # 添加CORS头
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def format_full_data_for_ai(self, raw_data):
        if not raw_data or len(raw_data) == 0:
            return '暂无销售数据'

        def parse_date_str(s):
            from datetime import datetime
            try:
                return datetime.strptime(str(s), '%Y-%m-%d %H:%M:%S')
            except:
                try:
                    return datetime.strptime(str(s)[:10], '%Y-%m-%d')
                except:
                    return None

        # 获取数据日期范围
        dates = [parse_date_str(r.get('parsedDate')) for r in raw_data if r.get('parsedDate')]
        dates = [d for d in dates if d]
        if not dates:
            return '无法解析数据日期'
        
        min_date = min(dates)
        max_date = max(dates)
        
        def format_date(d):
            return d.strftime('%Y-%m-%d')
        
        # 基本统计
        total_revenue = sum(r.get('order_amount', 0) or 0 for r in raw_data)
        order_count = len(raw_data)
        aov = total_revenue / order_count if order_count > 0 else 0

        # 按日期统计
        date_stats = {}
        for r in raw_data:
            d = parse_date_str(r.get('parsedDate'))
            if d:
                date_key = format_date(d)
                if date_key not in date_stats:
                    date_stats[date_key] = {'revenue': 0, 'count': 0}
                date_stats[date_key]['revenue'] += r.get('order_amount', 0) or 0
                date_stats[date_key]['count'] += 1

        # 按商品统计
        product_stats = {}
        for r in raw_data:
            name = r.get('product_name', '未知商品')
            if name not in product_stats:
                product_stats[name] = {'sales': 0, 'revenue': 0}
            product_stats[name]['sales'] += 1
            product_stats[name]['revenue'] += r.get('order_amount', 0) or 0

        top_products = sorted(product_stats.items(), key=lambda x: x[1]['revenue'], reverse=True)[:10]

        # 按品类统计
        category_stats = {}
        for r in raw_data:
            cat = r.get('product_category', '未分类')
            if cat not in category_stats:
                category_stats[cat] = 0
            category_stats[cat] += r.get('order_amount', 0) or 0

        top_categories = sorted(category_stats.items(), key=lambda x: x[1], reverse=True)[:5]

        # 按支付方式统计
        payment_stats = {}
        for r in raw_data:
            method = r.get('payment_method') or r.get('payment_source') or '未知'
            if method not in payment_stats:
                payment_stats[method] = 0
            payment_stats[method] += r.get('order_amount', 0) or 0

        # 按小时统计
        hour_stats = {}
        for r in raw_data:
            d = parse_date_str(r.get('parsedDate'))
            if d:
                hour = d.hour
                if hour not in hour_stats:
                    hour_stats[hour] = {'revenue': 0, 'count': 0}
                hour_stats[hour]['revenue'] += r.get('order_amount', 0) or 0
                hour_stats[hour]['count'] += 1

        peak_hour = max(hour_stats.items(), key=lambda x: x[1]['revenue']) if hour_stats else None

        # 格式化数据摘要
        summary = f"""【销售数据概览】
- 数据时间范围：{format_date(min_date)} 至 {format_date(max_date)}
- 总订单数：{order_count}笔
- 总收入：¥{total_revenue:.2f}
- 客单价：¥{aov:.2f}
- 销售高峰时段：{peak_hour[0] if peak_hour else '暂无'}点

【每日销售明细】"""
        
        for date_key in sorted(date_stats.keys()):
            stats = date_stats[date_key]
            summary += f"\n- {date_key}: {stats['count']}笔, ¥{stats['revenue']:.2f}"

        summary += '\n【热销商品排行（按销售额）】'
        for i, (name, stats) in enumerate(top_products):
            summary += f"\n{i+1}. {name}: {stats['sales']}笔, ¥{stats['revenue']:.2f}"

        summary += '\n【品类销售占比】'
        for i, (cat, revenue) in enumerate(top_categories):
            ratio = (revenue / total_revenue * 100) if total_revenue > 0 else 0
            summary += f"\n{i+1}. {cat}: ¥{revenue:.2f} ({ratio:.1f}%)"

        summary += '\n【支付方式分布】'
        for method, revenue in sorted(payment_stats.items(), key=lambda x: x[1], reverse=True):
            ratio = (revenue / total_revenue * 100) if total_revenue > 0 else 0
            summary += f"\n- {method}: ¥{revenue:.2f} ({ratio:.1f}%)"

        return summary


# 切换到项目目录
os.chdir('D:\\opencodeproject')

with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
    print(f"代理服务器启动: http://localhost:{PORT}")
    print(f"静态文件目录: D:\\opencodeproject")
    print(f"API代理: http://localhost:{PORT}/api/chat")
    print("\n按 Ctrl+C 停止服务器")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
