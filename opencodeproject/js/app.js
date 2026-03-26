// AI钱包 - 核心应用逻辑

// 全局状态
let appState = {
    rawData: [],
    processedData: null,
    timeGranularity: 'day',
    chartGranularity: {
        revenue: 'week',
        orders: 'week'
    },
    analysisTimeGranularity: 'day',
    productRankingType: 'sales',
    selectedCampaign: '',
    chatHistory: []
};

// 初始化
function initApp() {
    loadStoredData();
    if (appState.processedData) {
        updateAllModules();
    }
}

// 数据加载
function loadStoredData() {
    const stored = localStorage.getItem('aiwallet_data');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            appState.rawData = data.rawData || [];
            appState.processedData = data.processedData;
            
            // 确保 parsedDate 是 Date 对象（localStorage 可能将其转换为字符串）
            if (appState.processedData && appState.processedData.rawData) {
                appState.processedData.rawData.forEach(record => {
                    if (typeof record.parsedDate === 'string') {
                        record.parsedDate = new Date(record.parsedDate);
                    }
                });
            }
            
            // 同步到全局window对象
            window.appState = appState;
            
            showDataStatus(appState.rawData.length);
            console.log('[AI钱包] 数据已加载:', appState.rawData.length, '条记录');
        } catch (e) {
            console.error('数据加载失败:', e);
        }
    }
}

// 数据保存
function saveData() {
    const data = {
        rawData: appState.rawData,
        processedData: appState.processedData
    };
    localStorage.setItem('aiwallet_data', JSON.stringify(data));
}

// 显示数据状态
function showDataStatus(count) {
    const statusEl = document.getElementById('data-status');
    if (statusEl) {
        statusEl.classList.remove('hidden');
        document.getElementById('record-count').textContent = count;
    }
}

// 处理文件上传
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        // 清除旧数据
        localStorage.removeItem('aiwallet_data');
        appState.rawData = [];
        appState.processedData = null;
        
        const data = await parseExcelFile(file);
        if (data && data.length > 0) {
            appState.rawData = data;
            appState.processedData = processData(data);
            
            // 同步到全局window对象
            window.appState = appState;
            
            saveData();
            showDataStatus(data.length);
            updateAllModules();
            showNotification(`成功加载 ${data.length} 条记录`);
            
            // 打印详细调试信息
            console.log('[AI钱包] === 上传完成，调试信息 ===');
            console.log('[AI钱包] 总记录数:', data.length);
            console.log('[AI钱包] 第一条原始数据:', data[0]);
            console.log('[AI钱包] 第一条parsedDate:', data[0]?.parsedDate);
            
            // 触发自定义事件通知其他页面
            window.dispatchEvent(new CustomEvent('dataUpdated', { detail: appState }));
        }
    } catch (error) {
        console.error('文件解析失败:', error);
        showNotification('文件解析失败，请检查格式', 'error');
    }
    
    // 清空input以便重复选择同一文件
    event.target.value = '';
}

// 更新所有模块
function updateAllModules() {
    if (!appState.processedData) return;

    updateKPICards();
    updateCharts();
    updateAnalysisPage();
    updateAIInsights();
}

// 更新KPI卡片
function updateKPICards() {
    const data = appState.processedData;
    if (!data) return;

    const metrics = calculateMetrics(data, appState.timeGranularity);
    
    document.getElementById('kpi-revenue').textContent = formatCurrency(metrics.totalRevenue);
    document.getElementById('kpi-orders').textContent = formatNumber(metrics.orderCount);
    document.getElementById('kpi-aov').textContent = formatCurrency(metrics.aov);

    // 更新变化率
    const prevMetrics = calculatePreviousPeriodMetrics(data, appState.timeGranularity);
    updateChangeIndicator('revenue-change', metrics.totalRevenue, prevMetrics.totalRevenue);
    updateChangeIndicator('orders-change', metrics.orderCount, prevMetrics.orderCount);
    updateChangeIndicator('aov-change', metrics.aov, prevMetrics.aov);
}

// 更新变化指示器
function updateChangeIndicator(elementId, current, previous) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (previous === 0) {
        el.textContent = '+0%';
        el.className = 'text-xs font-bold text-tertiary';
        return;
    }
    
    const change = ((current - previous) / previous * 100).toFixed(1);
    const isPositive = change >= 0;
    
    el.textContent = (isPositive ? '+' : '') + change + '%';
    el.className = 'text-xs font-bold ' + (isPositive ? 'text-tertiary' : 'text-error');
}

// 更新图表
function updateCharts() {
    if (!appState.processedData || typeof Chart === 'undefined') return;

    const data = appState.processedData;
    const revenueGranularity = appState.chartGranularity.revenue;
    const ordersGranularity = appState.chartGranularity.orders;

    renderRevenueChart(data, revenueGranularity);
    renderOrdersChart(data, ordersGranularity);
}

// 更新分析页面
function updateAnalysisPage() {
    const data = appState.processedData;
    if (!data) return;

    // 根据时间粒度过滤数据
    const now = getReferenceDate(data);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const granularity = appState.analysisTimeGranularity;
    let filteredData = data.rawData;
    
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
    }

    // 计算支付方式统计
    const onlinePaymentMethods = ['微信', '支付宝', '线上', 'app', 'wechat', 'alipay'];
    let onlineRevenue = 0;
    let offlineRevenue = 0;

    filteredData.forEach(record => {
        const method = (record.payment_method || record.payment_source || '').toLowerCase();
        const isOnline = onlinePaymentMethods.some(m => method.includes(m));
        
        if (isOnline) {
            onlineRevenue += record.order_amount || 0;
        } else {
            offlineRevenue += record.order_amount || 0;
        }
    });

    // 更新预测
    updateForecast(data);

    // 更新支付方式图表
    renderPaymentChart({ onlineRevenue, offlineRevenue });

    // 更新营销活动
    updateCampaignSelect(data);
    updateCampaignAnalysis();

    // 更新商品排行
    updateProductRanking();

    // 更新AI经营助手
    updateAIInsights();
}

// 更新预测
function updateForecast(data) {
    const metrics = calculateMetrics(data, appState.analysisTimeGranularity);
    
    // 简单预测：基于历史趋势预测未来7天
    const revenueTrend = calculateTrend(data.dailyRevenue);
    const trafficTrend = calculateTrend(data.dailyOrders);
    
    const forecastRevenue = metrics.totalRevenue * (1 + revenueTrend * 0.1);
    const forecastTraffic = Math.round(metrics.orderCount * (1 + trafficTrend * 0.1));

    const forecastEl = document.getElementById('forecast-revenue');
    const trafficEl = document.getElementById('forecast-traffic');
    
    if (forecastEl) {
        forecastEl.textContent = formatCurrency(forecastRevenue);
        document.getElementById('forecast-revenue-change').textContent = '+' + (revenueTrend * 10).toFixed(1) + '%';
    }
    if (trafficEl) {
        trafficEl.textContent = formatNumber(forecastTraffic);
        document.getElementById('forecast-traffic-change').textContent = '+' + (trafficTrend * 10).toFixed(1) + '%';
    }
}

// 计算趋势
function calculateTrend(values) {
    if (values.length < 2) return 0;
    const recent = values.slice(-7);
    const earlier = values.slice(-14, -7);
    if (earlier.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    if (earlierAvg === 0) return 0;
    return (recentAvg - earlierAvg) / earlierAvg;
}

// 更新活动选择器
function updateCampaignSelect(data) {
    const select = document.getElementById('campaign-select');
    if (!select) return;

    const campaigns = getUniqueCampaigns(data);
    select.innerHTML = '<option value="">选择活动</option>';
    
    campaigns.forEach(campaign => {
        const option = document.createElement('option');
        option.value = campaign;
        option.textContent = campaign || '无活动';
        select.appendChild(option);
    });
}

// 更新活动分析
function updateCampaignAnalysis() {
    const select = document.getElementById('campaign-select');
    if (!select || !appState.processedData) return;

    const campaignName = select.value;
    const data = appState.processedData;
    
    const campaignData = data.campaigns.find(c => c.name === campaignName);
    
    const revenueEl = document.getElementById('campaign-revenue');
    const roiEl = document.getElementById('campaign-roi');
    const barEl = document.getElementById('campaign-performance-bar');
    const commentEl = document.getElementById('campaign-comment');

    if (campaignData) {
        if (revenueEl) revenueEl.textContent = formatCurrency(campaignData.revenue);
        if (roiEl) roiEl.textContent = campaignData.roi.toFixed(1) + 'x';
        if (barEl) barEl.style.width = Math.min(campaignData.roi * 20, 100) + '%';
        if (commentEl) commentEl.textContent = `"${campaignName}" 表现处于${campaignData.roi > 3 ? '优秀' : '良好'}水平`;
    } else {
        if (revenueEl) revenueEl.textContent = '¥0';
        if (roiEl) roiEl.textContent = '0x';
        if (barEl) barEl.style.width = '0%';
        if (commentEl) commentEl.textContent = '暂无活动数据';
    }
}

// 更新商品排行
function updateProductRanking() {
    const tbody = document.getElementById('product-ranking-body');
    if (!tbody) return;

    const data = appState.processedData;
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-on-surface-variant text-sm">暂无数据，请先上传销售数据</td></tr>';
        return;
    }

    // 根据时间粒度过滤数据
    const now = getReferenceDate(data);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    let filteredData = data.rawData;
    const granularity = appState.analysisTimeGranularity;
    
    if (granularity === 'day') {
        // 当日数据
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= today && d < tomorrow;
        });
    } else if (granularity === 'week') {
        // 本周数据（周一~今天）
        const day = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monday && d < tomorrow;
        });
    } else if (granularity === 'month') {
        // 本月数据
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monthStart && d < tomorrow;
        });
    }

    // 统计过滤后的商品数据
    const productStats = {};
    filteredData.forEach(record => {
        const productName = record.product_name || '未知商品';
        if (!productStats[productName]) {
            productStats[productName] = { sales: 0, revenue: 0 };
        }
        productStats[productName].sales += 1;
        productStats[productName].revenue += record.order_amount || 0;
    });

    // 根据排行类型排序
    const sortedProducts = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats, trend: Math.random() * 20 - 10 }))
        .sort((a, b) => {
            if (appState.productRankingType === 'sales') {
                return b.sales - a.sales;
            } else {
                return b.revenue - a.revenue;
            }
        });

    let html = '';
    sortedProducts.slice(0, 10).forEach((product, index) => {
        const trendIcon = product.trend >= 0 ? 'trending_up' : 'trending_down';
        const trendClass = product.trend >= 0 ? 'text-tertiary' : 'text-error';
        
        html += `
            <tr class="group">
                <td class="py-4">
                    <span class="w-5 h-5 flex items-center justify-center ${index === 0 ? 'bg-primary-container text-on-primary-container' : index === 1 ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'} text-[10px] font-black rounded-sm">
                        ${String(index + 1).padStart(2, '0')}
                    </span>
                </td>
                <td class="py-4 text-sm font-bold">${product.name}</td>
                <td class="py-4 text-sm font-medium text-right">${formatNumber(product.sales)}</td>
                <td class="py-4 text-sm font-bold text-right">${formatCurrency(product.revenue)}</td>
                <td class="py-4 text-right">
                    <span class="material-symbols-outlined ${trendClass} text-lg">${trendIcon}</span>
                </td>
            </tr>
        `;
    });

    if (html === '') {
        html = '<tr><td colspan="5" class="py-8 text-center text-on-surface-variant text-sm">当前时间范围内无数据</td></tr>';
    }

    tbody.innerHTML = html;
}

// 更新AI洞察 - 调用百炼API
async function updateAIInsights() {
    const container = document.getElementById('ai-insight-content');
    if (!container) return;

    // 获取数据（优先使用appState，否则从localStorage恢复）
    const state = window.appState || (() => {
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
                return data;
            } catch (e) {}
        }
        return null;
    })();

    const processedData = state?.processedData;

    // 无数据时显示提示
    if (!processedData || !processedData.rawData || processedData.rawData.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <span class="material-symbols-outlined text-outline text-4xl mb-2">upload_file</span>
                <p class="text-sm text-on-surface-variant">请先上传销售数据</p>
                <p class="text-xs text-outline mt-1">支持Excel或CSV格式</p>
            </div>
        `;
        return;
    }

    const data = processedData;
    const granularity = (state?.analysisTimeGranularity) || 'day';

    // 调用百炼API进行AI分析
    const aiResponse = await generateAIInsights(data, granularity);

    if (aiResponse && (aiResponse.conclusion || aiResponse.analysis || aiResponse.suggestions)) {
        container.innerHTML = `
            <div>
                <h4 class="text-xs font-bold text-outline uppercase tracking-wider mb-1">数据结论</h4>
                <p class="text-sm font-medium leading-relaxed">${aiResponse.conclusion || '暂无结论'}</p>
            </div>
            <div>
                <h4 class="text-xs font-bold text-outline uppercase tracking-wider mb-1">原因分析</h4>
                <p class="text-sm text-on-surface-variant leading-relaxed">${aiResponse.analysis || '暂无分析'}</p>
            </div>
            <div class="bg-tertiary-container/20 p-3 rounded-lg border-l-4 border-tertiary">
                <h4 class="text-xs font-bold text-tertiary uppercase tracking-wider mb-1">优化建议</h4>
                <p class="text-sm font-semibold text-on-surface italic">${aiResponse.suggestions || '暂无建议'}</p>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div>
                <h4 class="text-xs font-bold text-outline uppercase tracking-wider mb-1">数据结论</h4>
                <p class="text-sm font-medium leading-relaxed">AI分析暂时不可用，请稍后重试。</p>
            </div>
            <div>
                <h4 class="text-xs font-bold text-outline uppercase tracking-wider mb-1">原因分析</h4>
                <p class="text-sm text-on-surface-variant leading-relaxed">请检查网络连接后重试。</p>
            </div>
            <div class="bg-tertiary-container/20 p-3 rounded-lg border-l-4 border-tertiary">
                <h4 class="text-xs font-bold text-tertiary uppercase tracking-wider mb-1">优化建议</h4>
                <p class="text-sm font-semibold text-on-surface italic">请确保API配置正确。</p>
            </div>
        `;
    }
}

// 设置顶部筛选时间粒度 - 只控制KPI卡片
function setTimeGranularity(granularity) {
    appState.timeGranularity = granularity;
    
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        btn.classList.add('text-on-surface-variant');
    });
    
    const activeBtn = document.getElementById('btn-' + granularity);
    if (activeBtn) {
        activeBtn.classList.add('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        activeBtn.classList.remove('text-on-surface-variant');
    }
    
    // 只更新KPI卡片，不影响图表
    updateKPICards();
}

// 设置分析页面时间粒度
function setAnalysisTimeGranularity(granularity) {
    appState.analysisTimeGranularity = granularity;
    
    document.querySelectorAll('.analysis-time-btn').forEach(btn => {
        btn.classList.remove('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        btn.classList.add('text-slate-500');
    });
    
    const activeBtn = document.getElementById('analysis-btn-' + granularity);
    if (activeBtn) {
        activeBtn.classList.add('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        activeBtn.classList.remove('text-slate-500');
    }
    
    updateAnalysisPage();
}

// 设置图表粒度 - 只更新对应的图表
function setChartGranularity(chartType, granularity) {
    appState.chartGranularity[chartType] = granularity;
    
    // 更新按钮样式
    document.querySelectorAll(`.chart-granularity-${chartType}`).forEach(btn => {
        btn.classList.remove('bg-surface-container', 'text-on-surface-variant');
        btn.classList.add('text-on-surface-variant');
    });
    
    const activeBtn = document.getElementById(`${chartType}-${granularity}-btn`);
    if (activeBtn) {
        activeBtn.classList.add('bg-surface-container', 'text-on-surface-variant');
    }
    
    // 只更新对应的图表
    if (chartType === 'revenue') {
        renderRevenueChart(appState.processedData, granularity);
    } else if (chartType === 'orders') {
        renderOrdersChart(appState.processedData, granularity);
    }
}

// 设置商品排行类型
function setProductRankingType(type) {
    appState.productRankingType = type;
    
    document.getElementById('ranking-sales-btn').classList.toggle('bg-surface-container', type === 'sales');
    document.getElementById('ranking-sales-btn').classList.toggle('text-on-surface-variant', type === 'sales');
    document.getElementById('ranking-revenue-btn').classList.toggle('bg-surface-container', type === 'revenue');
    document.getElementById('ranking-revenue-btn').classList.toggle('text-on-surface-variant', type === 'revenue');
    
    updateProductRanking();
}

// 清除数据
function clearData() {
    if (confirm('确定要清除所有数据吗？')) {
        localStorage.removeItem('aiwallet_data');
        appState.rawData = [];
        appState.processedData = null;
        
        const statusEl = document.getElementById('data-status');
        if (statusEl) statusEl.classList.add('hidden');
        
        // 重置显示
        document.getElementById('kpi-revenue').textContent = '¥0.00';
        document.getElementById('kpi-orders').textContent = '0';
        document.getElementById('kpi-aov').textContent = '¥0.00';
        
        showNotification('数据已清除');
    }
}

// 显示通知
function showNotification(message, type = 'success') {
    // 简单的通知实现
    const notification = document.createElement('div');
    notification.className = `fixed top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 transition-all duration-300 ${type === 'success' ? 'bg-tertiary text-white' : 'bg-error text-white'}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// 工具函数
function formatCurrency(amount) {
    return '¥' + (amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(num) {
    return (num || 0).toLocaleString('zh-CN');
}

// 初始化分析页面专用函数
function initAnalysisPage() {
    if (appState.processedData) {
        updateAnalysisPage();
    }
    // 初始化按钮样式
    const granularity = appState.analysisTimeGranularity;
    document.querySelectorAll('.analysis-time-btn').forEach(btn => {
        btn.classList.remove('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        btn.classList.add('text-slate-500');
    });
    const activeBtn = document.getElementById('analysis-btn-' + granularity);
    if (activeBtn) {
        activeBtn.classList.add('bg-primary-container', 'text-on-primary-container', 'shadow-sm');
        activeBtn.classList.remove('text-slate-500');
    }
}

// 聊天输入回车处理
function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// 快捷问题发送
function sendQuickQuestion(question) {
    document.getElementById('chat-input').value = question;
    sendChatMessage();
}

// 全局暴露函数供其他脚本使用
window.appState = appState;
window.handleFileUpload = handleFileUpload;
window.setTimeGranularity = setTimeGranularity;
window.setAnalysisTimeGranularity = setAnalysisTimeGranularity;
window.setChartGranularity = setChartGranularity;
window.setProductRankingType = setProductRankingType;
window.updateCampaignAnalysis = updateCampaignAnalysis;
window.clearData = clearData;
window.sendQuickQuestion = sendQuickQuestion;
window.handleChatKeyPress = handleChatKeyPress;
window.showNotification = showNotification;