// AI钱包 - 数据处理模块

// Excel文件解析
async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // 使用 cellDates: true 获取日期对象，并指定本地时区格式
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    raw: true,
                    cellDates: true,
                    dateNF: 'yyyy-mm-dd hh:mm:ss'
                });
                
                // 标准化字段名
                const normalizedData = jsonData.map(normalizeFieldNames);
                
                // 验证必要字段
                const validData = normalizedData.filter(record => {
                    return record.order_id || record.orderTime || record.order_time;
                });
                
                console.log('[AI钱包] Excel解析完成:', validData.length, '条记录');
                if (validData.length > 0) {
                    console.log('[AI钱包] 原始日期样本:', validData[0].order_time);
                }
                
                resolve(validData);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// 字段名标准化
function normalizeFieldNames(record) {
    const fieldMapping = {
        'order_id': ['order_id', '订单ID', '订单号'],
        'order_time': ['order_time', 'orderTime', '订单时间', '下单时间'],
        'product_name': ['product_name', 'productName', '商品名称', '商品'],
        'product_category': ['product_category', 'productCategory', '商品类别', '品类', '分类'],
        'product_ip': ['product_ip', 'productIP', '商品IP', '品牌IP', '品牌'],
        'order_amount': ['order_amount', 'orderAmount', '订单金额', '金额', '销售金额'],
        'payment_method': ['payment_method', 'paymentMethod', '支付方式', '支付'],
        'payment_source': ['payment_source', 'paymentSource', '支付来源', '来源', '渠道'],
        'customer_id': ['customer_id', 'customerId', '用户ID', '顾客ID', '会员ID'],
        'promotion_id': ['promotion_id', 'promotionId', '活动ID'],
        'promotion_name': ['promotion_name', 'promotionName', '活动名称', '活动'],
        'discount_amount': ['discount_amount', 'discountAmount', '优惠金额', '折扣', '减免']
    };
    
    const normalized = {};
    
    for (const [standardField, possibleFields] of Object.entries(fieldMapping)) {
        for (const field of possibleFields) {
            if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
                // 对于 order_time 字段，如果是 Date 对象则保留
                if (standardField === 'order_time' && record[field] instanceof Date) {
                    normalized[standardField] = record[field];
                } else if (standardField === 'order_time') {
                    // 如果是字符串或数字，转换为字符串保留
                    normalized[standardField] = String(record[field]);
                } else {
                    normalized[standardField] = record[field];
                }
                break;
            }
        }
    }
    
    // 确保数值字段为数字类型
    if (normalized.order_amount) {
        normalized.order_amount = parseFloat(normalized.order_amount) || 0;
    }
    if (normalized.discount_amount) {
        normalized.discount_amount = parseFloat(normalized.discount_amount) || 0;
    }
    
    return normalized;
}

// 数据处理
function processData(rawData) {
    if (!rawData || rawData.length === 0) {
        return null;
    }

    // 解析日期 - 修复时区问题
    const parsedData = rawData.map(record => {
        const orderTime = record.order_time || record.orderTime;
        let date;
        
        if (orderTime instanceof Date) {
            date = orderTime;
        } else if (typeof orderTime === 'string') {
            // 处理 "YYYY-MM-DD HH:MM:SS" 格式
            const parts = orderTime.match(/(\d+)-(\d+)-(\d+)\s+(\d+):(\d+):(\d+)/);
            if (parts) {
                // 使用本地时区创建日期
                date = new Date(
                    parseInt(parts[1]),      // 年
                    parseInt(parts[2]) - 1,  // 月 (0-indexed)
                    parseInt(parts[3]),      // 日
                    parseInt(parts[4]),      // 时
                    parseInt(parts[5]),      // 分
                    parseInt(parts[6])       // 秒
                );
            } else {
                date = new Date(orderTime);
            }
        } else {
            date = new Date();
        }
        
        return {
            ...record,
            parsedDate: isNaN(date.getTime()) ? new Date() : date
        };
    }).filter(r => !isNaN(r.parsedDate.getTime()));

    // 调试日志
    console.log('[AI钱包] 数据解析完成:', parsedData.length, '条记录');
    if (parsedData.length > 0) {
        const dates = parsedData.map(r => new Date(r.parsedDate).toLocaleDateString('zh-CN'));
        const uniqueDates = [...new Set(dates)];
        console.log('[AI钱包] 数据日期范围:', uniqueDates[0], '~', uniqueDates[uniqueDates.length - 1]);
    }

    // 按日期分组
    const dailyData = {};
    const dailyRevenue = [];
    const dailyOrders = [];

    parsedData.forEach(record => {
        const dateKey = formatDateKey(record.parsedDate, 'day');
        if (!dailyData[dateKey]) {
            dailyData[dateKey] = { revenue: 0, orders: 0 };
        }
        dailyData[dateKey].revenue += record.order_amount || 0;
        dailyData[dateKey].orders += 1;
    });

    Object.keys(dailyData).sort().forEach(key => {
        dailyRevenue.push(dailyData[key].revenue);
        dailyOrders.push(dailyData[key].orders);
    });

    // 按周分组
    const weeklyData = {};
    const weeklyRevenue = [];
    
    parsedData.forEach(record => {
        const weekKey = getWeekKey(record.parsedDate);
        if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = { revenue: 0, orders: 0 };
        }
        weeklyData[weekKey].revenue += record.order_amount || 0;
        weeklyData[weekKey].orders += 1;
    });

    Object.keys(weeklyData).sort().forEach(key => {
        weeklyRevenue.push(weeklyData[key].revenue);
    });

    // 按月分组
    const monthlyData = {};
    const monthlyRevenue = [];
    
    parsedData.forEach(record => {
        const monthKey = formatDateKey(record.parsedDate, 'month');
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, orders: 0 };
        }
        monthlyData[monthKey].revenue += record.order_amount || 0;
        monthlyData[monthKey].orders += 1;
    });

    Object.keys(monthlyData).sort().forEach(key => {
        monthlyRevenue.push(monthlyData[key].revenue);
    });

    // 计算总收入和订单量
    const totalRevenue = parsedData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const orderCount = parsedData.length;
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 按商品统计
    const productStats = {};
    parsedData.forEach(record => {
        const productName = record.product_name || '未知商品';
        if (!productStats[productName]) {
            productStats[productName] = { sales: 0, revenue: 0 };
        }
        productStats[productName].sales += 1;
        productStats[productName].revenue += record.order_amount || 0;
    });

    const topProductsBySales = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats, trend: Math.random() * 20 - 10 }))
        .sort((a, b) => b.sales - a.sales);

    const topProductsByRevenue = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats, trend: Math.random() * 20 - 10 }))
        .sort((a, b) => b.revenue - a.revenue);

    // 按品类统计
    const categoryStats = {};
    parsedData.forEach(record => {
        const category = record.product_category || '未分类';
        if (!categoryStats[category]) {
            categoryStats[category] = { revenue: 0, orders: 0 };
        }
        categoryStats[category].revenue += record.order_amount || 0;
        categoryStats[category].orders += 1;
    });

    const categoryRevenue = Object.entries(categoryStats)
        .map(([category, stats]) => ({ category, ...stats }))
        .sort((a, b) => b.revenue - a.revenue);

    // 支付方式统计
    const onlinePaymentMethods = ['微信', '支付宝', '线上', 'app', 'wechat', 'alipay'];
    let onlineRevenue = 0;
    let offlineRevenue = 0;

    parsedData.forEach(record => {
        const method = (record.payment_method || record.payment_source || '').toLowerCase();
        const isOnline = onlinePaymentMethods.some(m => method.includes(m));
        
        if (isOnline) {
            onlineRevenue += record.order_amount || 0;
        } else {
            offlineRevenue += record.order_amount || 0;
        }
    });

    // 活动统计 - 使用新ROI计算公式
    // ROI = （活动期间订单总金额 - 基准收入 - 优惠总金额） ÷ 优惠总金额
    const campaignStats = {};
    const campaignDates = {}; // 记录每个活动的日期范围
    
    parsedData.forEach(record => {
        const campaign = record.promotion_name || record.promotion_id || '无活动';
        if (!campaignStats[campaign]) {
            campaignStats[campaign] = { revenue: 0, orders: 0, discount: 0 };
            campaignDates[campaign] = [];
        }
        campaignStats[campaign].revenue += record.order_amount || 0;
        campaignStats[campaign].orders += 1;
        campaignStats[campaign].discount += record.discount_amount || 0;
        campaignDates[campaign].push(record.parsedDate);
    });

    // 计算每个活动的ROI
    const campaigns = Object.entries(campaignStats)
        .map(([name, stats]) => {
            if (name === '无活动') {
                return { name, revenue: stats.revenue, orders: stats.orders, roi: 0 };
            }

            // 找出活动期间
            const dates = campaignDates[name].sort((a, b) => a - b);
            const campaignStart = dates[0];
            const campaignEnd = dates[dates.length - 1];
            const campaignDays = Math.ceil((campaignEnd - campaignStart) / (1000 * 60 * 60 * 24)) + 1;

            // 计算活动前7天的基准收入
            const beforeStart = new Date(campaignStart);
            beforeStart.setDate(beforeStart.getDate() - 7);
            const beforeEnd = new Date(campaignStart);
            
            const preCampaignData = parsedData.filter(r => {
                const d = r.parsedDate;
                return d >= beforeStart && d < campaignStart;
            });
            
            const preCampaignRevenue = preCampaignData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
            const preCampaignDays = Math.max(1, preCampaignData.length > 0 ? 7 : 0);
            const avgDailyRevenue = preCampaignData.length > 0 ? preCampaignRevenue / preCampaignDays : 
                (parsedData.length > 0 ? parsedData.reduce((sum, r) => sum + (r.order_amount || 0), 0) / 30 : 0);
            
            const baselineRevenue = avgDailyRevenue * campaignDays;

            // 计算ROI
            const totalRevenue = stats.revenue;
            const totalDiscount = stats.discount;
            
            let roi = 0;
            if (totalDiscount > 0) {
                roi = (totalRevenue - baselineRevenue - totalDiscount) / totalDiscount;
            }

            return {
                name,
                revenue: stats.revenue,
                orders: stats.orders,
                discount: totalDiscount,
                roi: roi,
                campaignDays: campaignDays,
                baselineRevenue: baselineRevenue
            };
        })
        .sort((a, b) => b.revenue - a.revenue);

    // 获取数据中的最新日期
    const dates = parsedData.map(r => r.parsedDate.getTime());
    const maxDate = new Date(Math.max(...dates));
    const dataLatestDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());

    return {
        totalRevenue,
        orderCount,
        aov,
        dailyRevenue,
        dailyOrders,
        weeklyRevenue,
        monthlyRevenue,
        topProductsBySales,
        topProductsByRevenue,
        categoryRevenue,
        onlineRevenue,
        offlineRevenue,
        campaigns,
        dataLatestDate,
        rawData: parsedData
    };
}

// 获取参考日期（优先使用数据的最新日期，否则使用当前日期）
function getReferenceDate(data) {
    if (data && data.dataLatestDate) {
        return new Date(data.dataLatestDate);
    }
    return new Date();
}

// 计算指标
function calculateMetrics(data, granularity) {
    if (!data || !data.rawData) {
        return { totalRevenue: 0, orderCount: 0, aov: 0 };
    }

    const now = getReferenceDate(data);
    let filteredData = data.rawData;
    let startDate, endDate;
    
    // 获取今天的开始时间（00:00:00）
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 获取明天的开始时间（00:00:00），用于包含今天所有时间的数据
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (granularity === 'day') {
        // 今日
        startDate = today;
        endDate = today;
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= today && d < tomorrow;
        });
    } else if (granularity === 'week') {
        // 本周（周一~今天）
        const day = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        startDate = monday;
        endDate = today;
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monday && d < tomorrow;
        });
    } else if (granularity === 'month') {
        // 本月（1日~今天）
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = monthStart;
        endDate = today;
        filteredData = data.rawData.filter(r => {
            const d = new Date(r.parsedDate);
            return d >= monthStart && d < tomorrow;
        });
    }

    const totalRevenue = filteredData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const orderCount = filteredData.length;
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 调试日志
    console.log(`[AI钱包] === 计算指标 ${granularity} ===`);
    console.log(`[AI钱包] 筛选范围: ${startDate?.toLocaleDateString('zh-CN')} ~ ${endDate?.toLocaleDateString('zh-CN')}`);
    console.log(`[AI钱包] 匹配记录数: ${orderCount}`);

    return { totalRevenue, orderCount, aov };
}

// 计算上一周期指标
function calculatePreviousPeriodMetrics(data, granularity) {
    if (!data || !data.rawData) {
        return { totalRevenue: 0, orderCount: 0, aov: 0 };
    }

    const now = getReferenceDate(data);
    let previousPeriodStart, previousPeriodEnd;

    // 获取今天的开始时间（00:00:00）
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 获取明天的开始时间（00:00:00），用于包含当天所有时间的数据
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (granularity === 'day') {
        // 昨日：昨日0点 ~ 今日0点
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        previousPeriodStart = yesterday;
        previousPeriodEnd = today;
    } else if (granularity === 'week') {
        // 上周：上周周一 ~ 本周一
        const day = today.getDay();
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        const lastMonday = new Date(thisMonday);
        lastMonday.setDate(thisMonday.getDate() - 7);
        previousPeriodStart = lastMonday;
        previousPeriodEnd = thisMonday;
    } else if (granularity === 'month') {
        // 上月：上月1日 ~ 本月1日
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        previousPeriodStart = lastMonth;
        previousPeriodEnd = thisMonth;
    } else {
        return { totalRevenue: 0, orderCount: 0, aov: 0 };
    }

    const filteredData = data.rawData.filter(r => {
        const d = new Date(r.parsedDate);
        return d >= previousPeriodStart && d < previousPeriodEnd;
    });

    const totalRevenue = filteredData.reduce((sum, r) => sum + (r.order_amount || 0), 0);
    const orderCount = filteredData.length;
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    return { totalRevenue, orderCount, aov };
}

// 获取唯一活动列表
function getUniqueCampaigns(data) {
    if (!data || !data.campaigns) return [];
    return data.campaigns.map(c => c.name);
}

// 日期格式化
function formatDateKey(date, granularity) {
    const d = new Date(date);
    if (granularity === 'day') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (granularity === 'month') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return d.toISOString().split('T')[0];
}

// 获取周键
function getWeekKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const firstDay = new Date(year, 0, 1);
    const pastDays = (d - firstDay) / 86400000;
    const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// 导出函数到全局
window.parseExcelFile = parseExcelFile;
window.processData = processData;
window.calculateMetrics = calculateMetrics;
window.calculatePreviousPeriodMetrics = calculatePreviousPeriodMetrics;
window.getUniqueCampaigns = getUniqueCampaigns;
window.getReferenceDate = getReferenceDate;