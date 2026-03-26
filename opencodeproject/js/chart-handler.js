// AI钱包 - 图表处理模块

let revenueChartInstance = null;
let ordersChartInstance = null;
let paymentChartInstance = null;

// 获取参考日期（使用数据的最新日期，否则使用今天）
function getChartReferenceDate(data) {
    if (data && data.dataLatestDate) {
        return new Date(data.dataLatestDate);
    }
    return new Date();
}

// 渲染收入图表
function renderRevenueChart(data, granularity) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    let labels, values;

    if (granularity === 'week') {
        labels = getWeekLabels(data.rawData, data.dataLatestDate);
        values = aggregateByWeek(data.rawData, 'order_amount', data.dataLatestDate);
    } else if (granularity === 'month') {
        labels = getMonthLabels(data.rawData, data.dataLatestDate);
        values = aggregateByMonth(data.rawData, 'order_amount', data.dataLatestDate);
    } else if (granularity === 'year') {
        labels = getYearLabels(data.rawData);
        values = aggregateByYear(data.rawData, 'order_amount');
    } else {
        labels = getDayLabels(data.rawData);
        values = data.dailyRevenue || [];
    }

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(0, 105, 64, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 105, 64, 0)');

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '销售额',
                data: values,
                borderColor: '#006940',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#006940',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#252f3d',
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'Inter', size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return '¥' + context.parsed.y.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { family: 'Inter', size: 10 },
                        color: '#6d7787'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(164, 174, 191, 0.1)'
                    },
                    ticks: {
                        font: { family: 'Inter', size: 10 },
                        color: '#6d7787',
                        callback: function(value) {
                            if (value >= 1000) {
                                return '¥' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '¥' + value;
                        }
                    }
                }
            }
        }
    });
}

// 渲染订单图表
function renderOrdersChart(data, granularity) {
    const ctx = document.getElementById('ordersChart');
    if (!ctx) return;

    let labels, values;

    if (granularity === 'week') {
        labels = getWeekLabels(data.rawData, data.dataLatestDate);
        values = aggregateByWeek(data.rawData, 'count', data.dataLatestDate);
    } else if (granularity === 'month') {
        labels = getMonthLabels(data.rawData, data.dataLatestDate);
        values = aggregateByMonth(data.rawData, 'count', data.dataLatestDate);
    } else if (granularity === 'year') {
        labels = getYearLabels(data.rawData);
        values = aggregateByYear(data.rawData, 'count');
    } else {
        labels = getDayLabels(data.rawData);
        values = data.dailyOrders || [];
    }

    if (ordersChartInstance) {
        ordersChartInstance.destroy();
    }

    ordersChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '订单量',
                data: values,
                backgroundColor: '#fed737',
                borderRadius: 4,
                hoverBackgroundColor: '#6d5a00'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#252f3d',
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'Inter', size: 14 },
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { family: 'Inter', size: 10 },
                        color: '#6d7787'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(164, 174, 191, 0.1)'
                    },
                    ticks: {
                        font: { family: 'Inter', size: 10 },
                        color: '#6d7787'
                    }
                }
            }
        }
    });
}

// 渲染支付方式饼图
function renderPaymentChart(data) {
    const ctx = document.getElementById('paymentChart');
    if (!ctx) return;

    const online = data.onlineRevenue || 0;
    const offline = data.offlineRevenue || 0;
    const total = online + offline;

    const onlinePercent = total > 0 ? (online / total * 100) : 0;
    const offlinePercent = total > 0 ? (offline / total * 100) : 0;

    // 更新显示的百分比
    const onlineEl = document.getElementById('online-percent');
    const offlineEl = document.getElementById('offline-percent');
    if (onlineEl) onlineEl.textContent = onlinePercent.toFixed(0) + '%';
    if (offlineEl) offlineEl.textContent = offlinePercent.toFixed(0) + '%';

    if (paymentChartInstance) {
        paymentChartInstance.destroy();
    }

    paymentChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['线上支付', '线下支付'],
            datasets: [{
                data: [online || 1, offline || 1],
                backgroundColor: ['#fed737', '#dce9ff'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#252f3d',
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'Inter', size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return percentage + '%';
                        }
                    }
                }
            }
        }
    });
}

// 获取天标签 - 默认14天
function getDayLabels(data) {
    const days = {};
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        const label = `${d.getMonth() + 1}.${d.getDate()}`;
        if (!days[key]) {
            days[key] = { date: d, label: label };
        }
    });
    
    const sortedKeys = Object.keys(days).sort();
    const result = sortedKeys.map(key => days[key].label);
    
    // 限制显示数量，最多14个
    if (result.length > 14) {
        return result.slice(-14);
    }
    return result;
}

// 获取数据日期范围
function getDataDateRange(data) {
    if (!data || data.length === 0) {
        return { minDate: null, maxDate: null };
    }
    const dates = data.map(r => new Date(r.parsedDate).getTime());
    return {
        minDate: new Date(Math.min(...dates)),
        maxDate: new Date(Math.max(...dates))
    };
}

// 获取周标签 - 显示最近7天（以数据的最新日期为基准，在数据范围内显示）
function getWeekLabels(data, dataLatestDate) {
    const { minDate, maxDate } = getDataDateRange(data);
    if (!minDate) return [];
    
    // 使用数据的最新日期作为"今天"
    const today = dataLatestDate ? new Date(dataLatestDate) : new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(todayStart.getDate() + 1);
    const labels = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(todayStart.getDate() - i);
        
        // 检查日期是否在数据范围内
        if (d >= minDate && d < tomorrow) {
            labels.push(`${d.getMonth() + 1}.${d.getDate()}`);
        }
    }
    
    return labels;
}

// 获取月标签 - 显示最近7个月（以数据的最新日期为基准，在数据范围内显示）
function getMonthLabels(data, dataLatestDate) {
    if (!data || data.length === 0) return [];
    
    // 使用数据的最新日期作为"今天"
    const today = dataLatestDate ? new Date(dataLatestDate) : new Date();
    
    // 收集数据中存在哪些月份
    const dataMonths = new Set();
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        dataMonths.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    });
    
    const labels = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
        
        if (dataMonths.has(monthKey)) {
            labels.push(`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
    }
    
    return labels;
}

// 获取年标签
function getYearLabels(data) {
    const years = {};
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        const key = d.getFullYear().toString();
        if (!years[key]) {
            years[key] = d.getFullYear().toString();
        }
    });
    
    const sortedKeys = Object.keys(years).sort();
    const result = sortedKeys.map(key => key);
    
    // 限制显示数量，最多10年
    if (result.length > 10) {
        return result.slice(-10);
    }
    return result;
}

// 按周聚合 - 聚合最近7天（以数据的最新日期为基准，在数据范围内有数据取数据，无数据补0）
function aggregateByWeek(data, field, dataLatestDate) {
    const { minDate, maxDate } = getDataDateRange(data);
    if (!minDate) return [];
    
    // 使用数据的最新日期作为"今天"
    const today = dataLatestDate ? new Date(dataLatestDate) : new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(todayStart.getDate() + 1);
    
    const dataMap = {};
    
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        if (!dataMap[key]) dataMap[key] = 0;
        if (field === 'count') {
            dataMap[key] += 1;
        } else {
            dataMap[key] += record.order_amount || 0;
        }
    });
    
    const values = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(todayStart.getDate() - i);
        
        // 只包含在数据范围内且在今天之前的日期
        if (d >= minDate && d < tomorrow) {
            const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            values.push(dataMap[key] || 0);
        }
    }
    
    return values;
}

// 按月聚合 - 聚合最近7个月（以数据的最新日期为基准，在数据范围内有数据取数据，无数据不显示）
function aggregateByMonth(data, field, dataLatestDate) {
    if (!data || data.length === 0) return [];
    
    // 使用数据的最新日期作为"今天"
    const today = dataLatestDate ? new Date(dataLatestDate) : new Date();
    
    // 建立月份到数据的映射
    const dataMap = {};
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!dataMap[key]) dataMap[key] = 0;
        if (field === 'count') {
            dataMap[key] += 1;
        } else {
            dataMap[key] += record.order_amount || 0;
        }
    });
    
    // 收集数据中存在哪些月份
    const dataMonths = new Set();
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        dataMonths.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    });
    
    const values = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
        
        if (dataMonths.has(monthKey)) {
            values.push(dataMap[monthKey] || 0);
        }
    }
    
    return values;
}

// 按年聚合
function aggregateByYear(data, field) {
    const years = {};
    data.forEach(record => {
        const d = new Date(record.parsedDate);
        const key = d.getFullYear().toString();
        
        if (!years[key]) years[key] = 0;
        
        if (field === 'count') {
            years[key] += 1;
        } else {
            years[key] += record.order_amount || 0;
        }
    });
    
    const sorted = Object.entries(years).sort((a, b) => a[0].localeCompare(b[0]));
    
    // 限制最多10年
    const sliced = sorted.length > 10 ? sorted.slice(-10) : sorted;
    
    return sliced.map(entry => entry[1]);
}

// 获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 导出函数
window.renderRevenueChart = renderRevenueChart;
window.renderOrdersChart = renderOrdersChart;
window.renderPaymentChart = renderPaymentChart;