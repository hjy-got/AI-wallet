// AI钱包 - AI对话处理模块（接入阿里云百炼大模型）

// 本地代理服务器配置
const LOCAL_PROXY_URL = '/api/chat';

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的商户经营分析助手，专门为商户提供数据驱动的经营建议。你的职责是：

1. 基于用户上传的销售数据进行分析
2. 用数据结论、原因分析、优化建议三个维度回答用户问题
3. 回答要简洁、实用、可执行
4. 语气专业但易懂

数据分析维度包括：
- 销售趋势（销售额、订单量、客单价及较上期变化）
- 商品销售排行（销量、销售额）
- 品类销售占比
- 支付方式分布（线上/线下）
- 营销活动效果（ROI）
- 时段分析（销售高峰）
- 折扣分析（折扣率是否合理）

请根据实际数据给出分析，不要编造数据。`;

// 格式化完整原始数据为AI可理解的文本
function formatFullDataForAI(rawData) {
    if (!rawData || rawData.length === 0) {
        return '暂无销售数据';
    }

    // 获取数据日期范围
    const dates = rawData.map(r => new Date(r.parsedDate)).filter(d => !isNaN(d));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    const formatDate = (d) => d.toLocaleDateString('zh-CN');
    
    // 基本统计
    const totalRevenue = rawData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const orderCount = rawData.length;
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 按日期统计
    const dateStats = {};
    rawData.forEach(r => {
        const dateKey = formatDate(new Date(r.parsedDate));
        if (!dateStats[dateKey]) {
            dateStats[dateKey] = { revenue: 0, count: 0 };
        }
        dateStats[dateKey].revenue += r.order_amount || 0;
        dateStats[dateKey].count += 1;
    });

    // 按商品统计
    const productStats = {};
    rawData.forEach(r => {
        const name = r.product_name || '未知商品';
        if (!productStats[name]) {
            productStats[name] = { sales: 0, revenue: 0 };
        }
        productStats[name].sales += 1;
        productStats[name].revenue += r.order_amount || 0;
    });

    const topProducts = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    // 按品类统计
    const categoryStats = {};
    rawData.forEach(r => {
        const cat = r.product_category || '未分类';
        if (!categoryStats[cat]) categoryStats[cat] = 0;
        categoryStats[cat] += r.order_amount || 0;
    });

    const topCategories = Object.entries(categoryStats)
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // 按支付方式统计
    const paymentStats = {};
    rawData.forEach(r => {
        const method = r.payment_method || r.payment_source || '未知';
        if (!paymentStats[method]) paymentStats[method] = 0;
        paymentStats[method] += r.order_amount || 0;
    });

    // 按小时统计
    const hourStats = {};
    rawData.forEach(r => {
        const hour = new Date(r.parsedDate).getHours();
        if (!hourStats[hour]) hourStats[hour] = { revenue: 0, count: 0 };
        hourStats[hour].revenue += r.order_amount || 0;
        hourStats[hour].count += 1;
    });

    const peakHour = Object.entries(hourStats)
        .map(([hour, stats]) => ({ hour: parseInt(hour), ...stats }))
        .sort((a, b) => b.revenue - a.revenue)[0];

    // 格式化数据摘要
    let summary = `【销售数据概览】
- 数据时间范围：${formatDate(minDate)} 至 ${formatDate(maxDate)}
- 总订单数：${orderCount}笔
- 总收入：¥${totalRevenue.toFixed(2)}
- 客单价：¥${aov.toFixed(2)}
- 销售高峰时段：${peakHour ? peakHour.hour + '点' : '暂无'}

【每日销售明细】`;
    
    Object.entries(dateStats).sort((a, b) => new Date(a[0]) - new Date(b[0])).forEach(([date, stats]) => {
        summary += `\n- ${date}: ${stats.count}笔, ¥${stats.revenue.toFixed(2)}`;
    });

    summary += '\n【热销商品排行（按销售额）】';
    topProducts.forEach((p, i) => {
        summary += `\n${i+1}. ${p.name}: ${p.sales}笔, ¥${p.revenue.toFixed(2)}`;
    });

    summary += '\n【品类销售占比】';
    topCategories.forEach((c, i) => {
        const ratio = (c.revenue / totalRevenue * 100).toFixed(1);
        summary += `\n${i+1}. ${c.category}: ¥${c.revenue.toFixed(2)} (${ratio}%)`;
    });

    summary += '\n【支付方式分布】';
    Object.entries(paymentStats).sort((a, b) => b[1] - a[1]).forEach(([method, revenue]) => {
        const ratio = (revenue / totalRevenue * 100).toFixed(1);
        summary += `\n- ${method}: ¥${revenue.toFixed(2)} (${ratio}%)`;
    });

    return summary;
}

// 发送消息到 阿里云百炼 API（通过本地代理）
async function callBailianAPI(userMessage, contextData = null, fullRawData = null) {
    let prompt = userMessage;

    // 如果有完整原始数据，发送给代理服务器处理
    if (fullRawData && fullRawData.length > 0) {
        // 格式化完整数据为易读的文本
        const dataSummary = formatFullDataForAI(fullRawData);
        prompt = `${dataSummary}\n\n请根据以上数据回答用户问题：${userMessage}`;
    } else if (contextData) {
        // 备用：如果没有完整数据，使用摘要
        const topProducts = contextData.topProducts?.slice(0, 3).map(p => p.name).join('、') || '暂无';
        const topCategories = contextData.topCategories?.slice(0, 3).map(c => c.category).join('、') || '暂无';
        const changeText = contextData.revenueChange ? `${contextData.revenueChange > 0 ? '+' : ''}${contextData.revenueChange.toFixed(1)}%` : '暂无';
        
        prompt = `基于以下数据回答用户问题：
数据摘要：
- 时间范围：${contextData.timeRange}
- 总收入：¥${contextData.totalRevenue?.toFixed(2) || 0}
- 订单量：${contextData.orderCount || 0}笔
- 客单价：¥${contextData.aov?.toFixed(2) || 0}
- 线上收入：¥${contextData.onlineRevenue?.toFixed(2) || 0}
- 线下收入：¥${contextData.offlineRevenue?.toFixed(2) || 0}
- 热销商品：${topProducts}
- 热销品类：${topCategories}
- 销售变化：${changeText}
- 折扣率：${contextData.discountRate?.toFixed(1) || 0}%
- 销售高峰：${contextData.peakHour?.hour || 0}点

用户问题：${userMessage}`;
    }

    try {
        // 调用本地代理服务器
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: prompt,
                contextData: contextData,
                fullRawData: fullRawData
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API调用失败');
        }

        const data = await response.json();
        console.log('百炼API响应:', data);
        
        // 解析百炼返回的内容
        return data.output?.text || data.output?.content || '';
    } catch (error) {
        console.error('百炼API调用失败:', error);
        return null;
    }
}

// 解析AI响应，提取三个部分
function parseAIResponse(response) {
    const result = {
        conclusion: '',
        analysis: '',
        suggestions: ''
    };

    if (!response) {
        return {
            conclusion: 'AI响应失败，请稍后重试。',
            analysis: '暂时无法获取分析结果。',
            suggestions: '请检查网络连接后重试。'
        };
    }

    // 方法1：尝试解析JSON格式
    try {
        // 提取JSON部分（可能包含在```json ```中）
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.conclusion) result.conclusion = jsonData.conclusion;
            if (jsonData.analysis) result.analysis = jsonData.analysis;
            if (jsonData.suggestions) result.suggestions = jsonData.suggestions;
            
            // 如果成功解析到内容，直接返回
            if (result.conclusion || result.analysis || result.suggestions) {
                return result;
            }
        }
    } catch (e) {
        // JSON解析失败，继续用方法2
    }

    // 方法2：按关键词分割（备用）
    const lines = response.split('\n').filter(line => line.trim());
    
    // 尝试提取各个部分
    let currentSection = '';

    lines.forEach(line => {
        if (line.includes('结论') || line.includes('数据结论') || line.includes('结论：')) {
            currentSection = 'conclusion';
        } else if (line.includes('分析') || line.includes('原因') || line.includes('原因分析') || line.includes('分析：')) {
            currentSection = 'analysis';
        } else if (line.includes('建议') || line.includes('优化') || line.includes('建议：') || line.includes('优化建议')) {
            currentSection = 'suggestions';
        }

        if (currentSection && line.length > 10) {
            if (!result[currentSection]) {
                result[currentSection] = line.replace(/^[#\-●◆\d\.].*?[:：]\s*/, '').trim();
            }
        }
    });

    // 如果解析失败，返回原始响应
    if (!result.conclusion && !result.analysis && !result.suggestions) {
        result.conclusion = response.substring(0, 200);
        result.analysis = 'AI已根据数据进行分析。';
        result.suggestions = '请参考AI的完整回复。';
    }

    return result;
}

// 准备数据上下文
function prepareDataContext(data, granularity) {
    if (!data || !data.rawData) return null;

    const now = getReferenceDate(data);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let filteredData = data.rawData;
    const timeRangeText = {
        'day': '当日',
        'week': '本周',
        'month': '本月',
        'year': '本年'
    };

    if (granularity === 'day') {
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= today && d < tomorrow;
        });
    } else if (granularity === 'week') {
        const day = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monday && d < tomorrow;
        });
    } else if (granularity === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monthStart && d < tomorrow;
        });
    } else if (granularity === 'year') {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= yearStart && d < tomorrow;
        });
    }

    // 计算当前周期指标
    const totalRevenue = filteredData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const orderCount = filteredData.length;
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 计算上一周期指标（用于趋势对比）
    let prevFilteredData = [];
    if (granularity === 'day') {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        prevFilteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= yesterday && d < todayStart;
        });
    } else if (granularity === 'week') {
        const day = today.getDay();
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        const lastMonday = new Date(thisMonday);
        lastMonday.setDate(thisMonday.getDate() - 7);
        prevFilteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= lastMonday && d < thisMonday;
        });
    } else if (granularity === 'month') {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevFilteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= lastMonthStart && d < thisMonthStart;
        });
    }

    const prevTotalRevenue = prevFilteredData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const prevOrderCount = prevFilteredData.length;
    const prevAov = prevOrderCount > 0 ? prevTotalRevenue / prevOrderCount : 0;

    // 计算变化率
    const revenueChange = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100) : 0;
    const orderChange = prevOrderCount > 0 ? ((orderCount - prevOrderCount) / prevOrderCount * 100) : 0;
    const aovChange = prevAov > 0 ? ((aov - prevAov) / prevAov * 100) : 0;

    // 统计支付方式
    const onlinePaymentMethods = ['微信', '支付宝', '线上', 'app', 'wechat', 'alipay'];
    let onlineRevenue = 0;
    let offlineRevenue = 0;
    const paymentStats = {};

    filteredData.forEach(record => {
        const method = record.payment_method || record.payment_source || '未知';
        const isOnline = onlinePaymentMethods.some(m => method.toLowerCase().includes(m));
        if (isOnline) {
            onlineRevenue += record.order_amount || 0;
        } else {
            offlineRevenue += record.order_amount || 0;
        }
        if (!paymentStats[method]) paymentStats[method] = 0;
        paymentStats[method] += record.order_amount || 0;
    });

    // 统计商品排行
    const productStats = {};
    filteredData.forEach(record => {
        const name = record.product_name || '未知商品';
        if (!productStats[name]) productStats[name] = { sales: 0, revenue: 0 };
        productStats[name].sales += 1;
        productStats[name].revenue += record.order_amount || 0;
    });

    const topProducts = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    // 统计品类排行
    const categoryStats = {};
    filteredData.forEach(record => {
        const category = record.product_category || '未分类';
        if (!categoryStats[category]) categoryStats[category] = { revenue: 0, count: 0 };
        categoryStats[category].revenue += record.order_amount || 0;
        categoryStats[category].count += 1;
    });

    const topCategories = Object.entries(categoryStats)
        .map(([category, stats]) => ({ category, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // 统计活动效果
    const campaignStats = {};
    filteredData.forEach(record => {
        const campaign = record.promotion_name || '无活动';
        if (!campaignStats[campaign]) campaignStats[campaign] = { revenue: 0, count: 0, discount: 0 };
        campaignStats[campaign].revenue += record.order_amount || 0;
        campaignStats[campaign].count += 1;
        campaignStats[campaign].discount += record.discount_amount || 0;
    });

    const topCampaigns = Object.entries(campaignStats)
        .map(([name, stats]) => ({
            name,
            revenue: stats.revenue,
            count: stats.count,
            discount: stats.discount,
            avgDiscount: stats.count > 0 ? stats.discount / stats.count : 0
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // 统计折扣情况
    const totalDiscount = filteredData.reduce((sum, r) => sum + (r.discount_amount || 0), 0);
    const discountRate = totalRevenue > 0 ? (totalDiscount / totalRevenue * 100) : 0;
    const ordersWithDiscount = filteredData.filter(r => r.discount_amount > 0).length;
    const discountPenetration = orderCount > 0 ? (ordersWithDiscount / orderCount * 100) : 0;

    // 统计时段分布
    const hourStats = {};
    filteredData.forEach(record => {
        const d = new Date(record.parsedDate);
        const hour = d.getHours();
        if (!hourStats[hour]) hourStats[hour] = { revenue: 0, count: 0 };
        hourStats[hour].revenue += record.order_amount || 0;
        hourStats[hour].count += 1;
    });

    const peakHour = Object.entries(hourStats)
        .map(([hour, stats]) => ({ hour: parseInt(hour), ...stats }))
        .sort((a, b) => b.revenue - a.revenue)[0] || { hour: 0, revenue: 0, count: 0 };

    return {
        timeRange: timeRangeText[granularity] || '当日',
        totalRevenue,
        orderCount,
        aov,
        onlineRevenue,
        offlineRevenue,
        topProducts,
        topCategories,
        topCampaigns,
        // 新增分析维度
        prevTotalRevenue,
        prevOrderCount,
        prevAov,
        revenueChange,
        orderChange,
        aovChange,
        totalDiscount,
        discountRate,
        discountPenetration,
        peakHour,
        paymentStats
    };
}

// 发送聊天消息
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;

    addUserMessage(message);
    input.value = '';

    // 显示加载状态
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const loadingEl = document.createElement('div');
    loadingEl.id = 'ai-loading';
    loadingEl.className = 'chat-message flex justify-start items-start gap-3 max-w-[92%]';
    loadingEl.innerHTML = `
        <div class="flex-shrink-0 mt-1">
            <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
                <span class="material-symbols-outlined text-on-primary-container text-lg" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
            </div>
        </div>
        <div class="ai-bubble p-6 rounded-2xl rounded-tl-none border-outline-variant/15">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary animate-spin">sync</span>
                <span class="text-sm text-on-surface-variant">AI正在分析中...</span>
            </div>
        </div>
    `;
    container.appendChild(loadingEl);
    scrollToBottom();

    // 准备数据上下文（使用分析页面的时间筛选）
    const state = getAppState();
    const granularity = state?.analysisTimeGranularity || 'day';
    const contextData = state?.processedData ? prepareDataContext(state.processedData, granularity) : null;
    const fullRawData = state?.processedData?.rawData || [];

    // 调用百炼API进行AI分析
    let response;
    try {
        const aiText = await callBailianAPI(message, contextData, fullRawData);
        if (aiText) {
            response = parseAIResponse(aiText);
        } else {
            response = {
                conclusion: 'AI分析暂时不可用',
                analysis: '请稍后重试',
                suggestions: '如果问题持续存在，请检查网络连接'
            };
        }
    } catch (e) {
        console.error('AI分析出错:', e);
        response = {
            conclusion: '分析过程中出现错误',
            analysis: '请稍后重试',
            suggestions: '如果问题持续存在，请检查数据是否正确'
        };
    }
    
    // 移除加载状态
    const loadingEl2 = document.getElementById('ai-loading');
    if (loadingEl2) loadingEl2.remove();

    // 显示响应
    addAIMessage(response);
    scrollToBottom();
}

// 添加用户消息
function addUserMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'none';

    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message flex justify-end items-end gap-3 max-w-[85%] ml-auto';
    messageEl.innerHTML = `
        <div class="flex flex-col items-end gap-1">
            <div class="user-bubble px-5 py-3 rounded-2xl rounded-br-none shadow-sm">
                <p class="text-on-primary-container font-medium text-[15px] leading-relaxed">${escapeHtml(message)}</p>
            </div>
            <span class="text-[10px] font-label text-outline uppercase tracking-wider px-1">${time}</span>
        </div>
    `;

    container.appendChild(messageEl);
}

// 添加AI消息
function addAIMessage(response) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message flex justify-start items-start gap-3 max-w-[92%]';
    messageEl.innerHTML = `
        <div class="flex-shrink-0 mt-1">
            <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
                <span class="material-symbols-outlined text-on-primary-container text-lg" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
            </div>
        </div>
        <div class="flex flex-col gap-2 w-full">
            <div class="ai-bubble p-6 rounded-2xl rounded-tl-none border-outline-variant/15 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
                <div class="space-y-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-xl">analytics</span>
                        <h3 class="font-headline font-bold text-on-surface tracking-tight">数据结论</h3>
                    </div>
                    <div class="bg-surface-container-lowest p-4 rounded-xl">
                        <p class="text-sm text-on-surface leading-relaxed">${response.conclusion || '暂无结论'}</p>
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-xl">psychology</span>
                        <h3 class="font-headline font-bold text-on-surface tracking-tight">原因分析</h3>
                    </div>
                    <p class="text-sm text-on-surface-variant leading-relaxed">${response.analysis || '暂无分析'}</p>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-tertiary text-xl">tips_and_updates</span>
                        <h3 class="font-headline font-bold text-on-surface tracking-tight">优化建议</h3>
                    </div>
                    <div class="bg-tertiary-container/20 border-l-4 border-tertiary p-4 rounded-r-xl">
                        <p class="text-sm font-semibold text-on-surface italic">${response.suggestions || '暂无建议'}</p>
                    </div>
                </div>
            </div>
            <span class="text-[10px] font-label text-outline uppercase tracking-wider px-1">${time}</span>
        </div>
    `;

    container.appendChild(messageEl);
}

// 获取appState（兼容处理：如果window.appState为空，尝试从localStorage加载）
function getAppState() {
    if (window.appState && window.appState.processedData) {
        return window.appState;
    }
    // 尝试从localStorage恢复
    const stored = localStorage.getItem('aiwallet_data');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            if (data.processedData && data.processedData.rawData) {
                data.processedData.rawData.forEach(record => {
                    if (typeof record.parsedDate === 'string') {
                        record.parsedDate = new Date(record.parsedDate);
                    }
                });
            }
            window.appState = data;
            return window.appState;
        } catch (e) {
            console.error('恢复数据失败:', e);
        }
    }
    return null;
}

// 生成AI响应（兼容旧接口）
async function generateAIResponse(question) {
    const state = getAppState();
    const data = state?.processedData;
    
    if (!data) {
        return {
            conclusion: '暂无销售数据，请先上传Excel销售数据文件。',
            analysis: '系统需要分析您的销售数据后才能给出专业建议。',
            suggestions: '请在首页点击"上传Excel销售数据"按钮上传您的数据。'
        };
    }

    const contextData = prepareDataContext(data, 'day');
    const fullRawData = data.rawData || [];
    const aiText = await callBailianAPI(question, contextData, fullRawData);
    return parseAIResponse(aiText);
}

// 滚动到底部
function scrollToBottom() {
    const container = document.getElementById('chat-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 格式化货币
function formatCurrency(amount) {
    return '¥' + (amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 本地规则AI分析（增强版）
function localAIAnalysis(contextData) {
    // 空数据检查
    if (!contextData) {
        return {
            conclusion: '暂无销售数据',
            analysis: '请先上传销售数据文件进行分析',
            suggestions: '点击上传按钮上传Excel或CSV文件'
        };
    }
    
    const { 
        totalRevenue, orderCount, aov, 
        onlineRevenue, offlineRevenue, 
        topProducts, topCategories, topCampaigns,
        prevTotalRevenue, prevOrderCount, prevAov,
        revenueChange, orderChange, aovChange,
        totalDiscount, discountRate, discountPenetration,
        peakHour, timeRange
    } = contextData;
    
    // 计算线上占比
    const onlineRatio = totalRevenue > 0 ? onlineRevenue / totalRevenue : 0;
    
    // ==================== 生成数据结论 ====================
    let conclusion = '';
    
    if (orderCount === 0) {
        conclusion = `${timeRange}暂无销售数据`;
    } else {
        // 结合变化趋势生成结论
        const trendText = revenueChange > 10 ? '增长强劲' : revenueChange > 0 ? '稳步增长' : revenueChange < -10 ? '下滑明显' : revenueChange < 0 ? '略有下降' : '保持稳定';
        const aovText = aov > 40 ? '客单价较高' : aov > 25 ? '客单价适中' : '客单价偏低';
        
        conclusion = `${timeRange}销售额${trendText}，${aovText}。`;
        
        // 添加具体数据
        const changeSign = revenueChange >= 0 ? '+' : '';
        conclusion += `总收入${formatCurrency(totalRevenue)}，订单${orderCount}笔，${changeSign}${revenueChange.toFixed(1)}%较上期`;
    }
    
    // ==================== 生成原因分析 ====================
    let analysis = '';
    const analysisParts = [];
    
    // 1. 商品分析
    if (topProducts && topProducts.length > 0) {
        const top = topProducts[0];
        const topRatio = totalRevenue > 0 ? (top.revenue / totalRevenue * 100).toFixed(1) : 0;
        analysisParts.push(`「${top.name}」销售${top.sales}笔，收入${formatCurrency(top.revenue)}，占比${topRatio}%`);
    }
    
    // 2. 品类分析
    if (topCategories && topCategories.length > 0) {
        const topCat = topCategories[0];
        const catRatio = totalRevenue > 0 ? (topCat.revenue / totalRevenue * 100).toFixed(1) : 0;
        analysisParts.push(`${topCat.category}品类收入占比${catRatio}%`);
    }
    
    // 3. 渠道分析
    const onlinePercent = (onlineRatio * 100).toFixed(0);
    if (onlineRatio > 0.7) {
        const topPayment = contextData.paymentStats ? Object.entries(contextData.paymentStats).sort((a,b) => b[1]-a[1])[0]?.[0] : '';
        analysisParts.push(`线上渠道主导（${onlinePercent}%）${topPayment ? '，' + topPayment + '为主' : ''}`);
    } else if (onlineRatio > 0.3) {
        analysisParts.push(`线上线下均衡（线上${onlinePercent}%）`);
    } else {
        analysisParts.push(`线下渠道为主（${100-onlinePercent}%）`);
    }
    
    // 4. 时段分析
    if (peakHour && peakHour.count > 0) {
        const hourText = peakHour.hour >= 12 ? '中午' : peakHour.hour >= 18 ? '晚间' : '上午';
        analysisParts.push(`销售高峰在${hourText}${peakHour.hour}点左右`);
    }
    
    // 5. 活动分析
    if (topCampaigns && topCampaigns.length > 0 && topCampaigns[0].name !== '无活动') {
        const camp = topCampaigns[0];
        analysisParts.push(`「${camp.name}」活动带来${formatCurrency(camp.revenue)}收入`);
    }
    
    // 6. 折扣分析
    if (discountRate > 10) {
        analysisParts.push(`折扣率较高（${discountRate.toFixed(1)}%），注意利润空间`);
    }
    
    // 7. 趋势分析
    if (Math.abs(revenueChange) > 5) {
        const trend = revenueChange > 0 ? '增长' : '下降';
        analysisParts.push(`较上期${trend}${Math.abs(revenueChange).toFixed(1)}%，${Math.abs(revenueChange) > 20 ? '变化显著' : '变化平稳'}`);
    }
    
    analysis = analysisParts.slice(0, 4).join('；') + '。';
    
    // ==================== 生成优化建议 ====================
    const suggestions = [];
    
    // 1. 销售趋势建议
    if (revenueChange > 20) {
        suggestions.push('销售增长显著，可考虑增加推广预算或拓展新商品');
    } else if (revenueChange > 10) {
        suggestions.push('保持良好增长势头，建议复盘成功经验');
    } else if (revenueChange < -20) {
        suggestions.push('销售下滑严重，建议分析原因并推出促销活动');
    } else if (revenueChange < -10) {
        suggestions.push('销售有所下降，建议关注竞品动态并优化营销');
    }
    
    // 2. 客单价建议
    if (aov < 25) {
        suggestions.push('客单价偏低，建议推出套餐组合或加价购活动提升客单');
    } else if (aov > 50) {
        suggestions.push('客单价较高，注意保持商品品质以匹配价格');
    }
    
    if (aovChange < -10) {
        suggestions.push(`客单价较上期下降${Math.abs(aovChange).toFixed(1)}%，需关注价格策略`);
    } else if (aovChange > 10) {
        suggestions.push(`客单价较上期上升${aovChange.toFixed(1)}%，表现优秀`);
    }
    
    // 3. 订单量建议
    if (orderCount > 0 && orderCount < 10) {
        suggestions.push('订单量较少，建议加强推广引流，激活更多客户');
    } else if (orderChange > 20) {
        suggestions.push('订单量增长显著，客户活跃度高');
    }
    
    // 4. 渠道建议
    if (onlineRatio > 0.8) {
        suggestions.push('线上渠道表现强劲，建议加强私域流量运营，沉淀客户');
    } else if (onlineRatio < 0.3) {
        suggestions.push('线上渠道占比较低，建议开通更多线上支付方式，拓展线上渠道');
    }
    
    // 5. 商品集中度建议
    if (topProducts && topProducts.length > 1) {
        const first = topProducts[0];
        const second = topProducts[1];
        if (first.revenue > second.revenue * 5) {
            suggestions.push('商品集中度过高，建议培育第二梯队热销商品，降低风险');
        }
    }
    
    // 6. 品类集中度建议
    if (topCategories && topCategories.length > 1) {
        const first = topCategories[0];
        const second = topCategories[1];
        if (first.revenue > second.revenue * 3) {
            suggestions.push('品类过于集中，建议丰富产品线，降低品类风险');
        }
    }
    
    // 7. 折扣建议
    if (discountRate > 15) {
        suggestions.push('折扣率过高（>' + discountRate.toFixed(0) + '%），注意利润压缩，建议优化折扣策略');
    } else if (discountRate > 10 && discountPenetration > 50) {
        suggestions.push('折扣订单占比过高，建议设置更精准的优惠门槛');
    }
    
    // 8. 活动建议
    if (topCampaigns && topCampaigns.length > 0) {
        const bestCampaign = topCampaigns.find(c => c.name !== '无活动');
        if (bestCampaign && bestCampaign.revenue > totalRevenue * 0.3) {
            suggestions.push(`「${bestCampaign.name}」活动效果显著，可考虑加大投入`);
        }
    }
    
    // 9. 时段建议
    if (peakHour && peakHour.hour >= 20) {
        suggestions.push('晚间销售表现好，可考虑延长晚间营业时间');
    } else if (peakHour && peakHour.hour < 10) {
        suggestions.push('上午销售相对较弱，可推出早餐套餐吸引客户');
    }
    
    // 默认建议
    if (suggestions.length === 0) {
        suggestions.push('继续保持当前经营策略，定期关注数据变化');
    }
    
    return {
        conclusion,
        analysis,
        suggestions: suggestions.slice(0, 3).join('；') + '。'
    };
}

// 生成AI经营建议
async function generateAIInsights(data, granularity) {
    const contextData = prepareDataContext(data, granularity);
    const fullRawData = data.rawData || [];
    
    // 空数据检查
    if (!contextData) {
        return {
            conclusion: '暂无销售数据',
            analysis: '请先上传销售数据文件进行分析',
            suggestions: '点击上传按钮上传Excel或CSV文件'
        };
    }
    
    // 调用百炼API，使用完整数据让AI自己分析
    const prompt = `作为商户经营分析专家，请根据用户上传的全部销售数据给出经营建议：

数据摘要：
- 时间范围：${contextData.timeRange}
- 总收入：¥${contextData.totalRevenue.toFixed(2)}
- 订单量：${contextData.orderCount}笔
- 客单价：¥${contextData.aov.toFixed(2)}
- 线上收入：¥${contextData.onlineRevenue.toFixed(2)}
- 线下收入：¥${contextData.offlineRevenue.toFixed(2)}
- 销售变化：${contextData.revenueChange ? (contextData.revenueChange > 0 ? '+' : '') + contextData.revenueChange.toFixed(1) + '%' : '暂无'}
- 折扣率：${contextData.discountRate ? contextData.discountRate.toFixed(1) + '%' : '0%'}

请从以下三个方面进行分析：
1. 数据结论：用一句话总结当前经营状况
2. 原因分析：分析数据变化的主要原因
3. 优化建议：给出2-3条可执行的改进建议

注意：要基于实际数据进行分析，不要编造数据。用户可能随时问不同时间范围的问题（如昨天、上周等），请灵活分析数据。`;

    const aiText = await callBailianAPI(prompt, contextData, fullRawData);
    return parseAIResponse(aiText);
}

// 导出函数
window.sendChatMessage = sendChatMessage;
window.addUserMessage = addUserMessage;
window.addAIMessage = addAIMessage;
window.generateAIResponse = generateAIResponse;
window.callBailianAPI = callBailianAPI;
window.prepareDataContext = prepareDataContext;
window.generateAIInsights = generateAIInsights;
window.parseAIResponse = parseAIResponse;