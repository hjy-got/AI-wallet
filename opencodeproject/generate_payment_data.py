import openpyxl
from openpyxl import Workbook
import random
from datetime import datetime, timedelta
import uuid

random.seed(42)

PRODUCTS = [
    ("盲抽-罗小黑战记2-S系列徽章", "盲抽", "罗小黑战记"),
    ("盲抽-明日方舟干员系列徽章", "盲抽", "明日方舟"),
    ("盲抽-原神神里绫人纪念徽章", "盲抽", "原神"),
    ("盲抽-蓝色监狱蜂乐回徽章", "盲抽", "蓝色监狱"),
    ("毛绒玩具-跑跑小动物公仔", "玩偶", "原创IP"),
    ("毛绒玩具-豆豆眼企鹅公仔", "玩偶", "原创IP"),
    ("毛绒玩具-哈基米猫猫虫", "玩偶", "原创IP"),
    ("毛绒玩具-奶龙系列公仔", "玩偶", "奶龙"),
    ("盲盒-疯狂动物城-疯狂转转乐盲盒桌面摆件", "盲盒", "疯狂动物城"),
    ("盲盒-蜡笔小新动感超活力系列盲盒", "盲盒", "蜡笔小新"),
    ("盲盒-我的英雄学院手办盲盒", "盲盒", "我的英雄学院"),
    ("盲盒-星之卡比系列盲盒", "盲盒", "星之卡比"),
    ("盲盒-三丽鸥家族盲盒", "盲盒", "三丽鸥"),
    ("盲盒-库洛米魔法系列盲盒", "盲盒", "三丽鸥"),
    ("毛绒-四叶草眼睛狗钥匙扣挂件", "挂饰", "原创IP"),
    ("毛绒-芝士猫爪钥匙扣挂件", "挂饰", "原创IP"),
    ("毛绒-奶黄包小鸡挂件", "挂饰", "原创IP"),
    ("迪士尼-唐老鸭系列钥匙扣挂件（柠檬晃晃款）", "挂饰", "迪士尼"),
    ("迪士尼-玲娜贝儿系列挂件", "挂饰", "迪士尼"),
    ("迪士尼-星黛露钥匙扣挂件", "挂饰", "迪士尼"),
    ("【苹果IP16 Pro】韩系萌宠手机壳iphone苹果收集保护套", "手机壳", "原创IP"),
    ("【苹果IP15】奶油色系猫咪手机壳", "手机壳", "原创IP"),
    ("【苹果IP14】多巴胺渐变手机壳", "手机壳", "原创IP"),
    ("【三星S24】韩系萌宠手机壳", "手机壳", "原创IP"),
    ("痛包-咒术回战五条悟痛包", "背包", "咒术回战"),
    ("痛包-排球少年及川彻痛包", "背包", "排球少年"),
    ("痛包-文豪野犬芥川龙之介痛包", "背包", "文豪野犬"),
    ("痛包-chiikawa小八痛包", "背包", "chiikawa"),
    ("盲盒-chiikawa吉伊卡哇盲盒", "盲盒", "chiikawa"),
    ("盲盒-宫崎骏系列盲盒", "盲盒", "吉卜力"),
    ("盲盒-宝可梦朱紫系列盲盒", "盲盒", "宝可梦"),
    ("毛绒玩具-角落生物系列公仔", "玩偶", "角落生物"),
    ("挂饰-库洛米美乐蒂钥匙扣", "挂饰", "三丽鸥"),
    ("盲抽-间谍过家家约尔夫人徽章", "盲抽", "间谍过家家"),
    ("盲抽-排球少年西谷夕徽章", "盲抽", "排球少年"),
]

IP_LIST = ["罗小黑战记", "明日方舟", "原神", "蓝色监狱", "原创IP", "奶龙", "疯狂动物城", "蜡笔小新", "我的英雄学院", "星之卡比", "三丽鸥", "迪士尼", "咒术回战", "排球少年", "文豪野犬", "chiikawa", "吉卜力", "宝可梦", "角落生物", "间谍过家家"]

PAYMENT_METHODS = ["微信", "支付宝", "银行卡", "现金"]
PAYMENT_SOURCES = ["线上", "线下"]

PROMOTIONS = [
    ("", "", 0),
    ("PROMO001", "新人首单满减", round(random.uniform(5, 15), 2)),
    ("PROMO002", "限时8折优惠", 0),
    ("PROMO003", "满99减10", 10),
    ("PROMO004", "会员95折", 0),
    ("PROMO005", "节假日特惠", round(random.uniform(5, 20), 2)),
    ("PROMO006", "盲盒买三送一", 0),
    ("PROMO007", "新品8.5折", 0),
    ("PROMO008", "满58包邮", 0),
    ("PROMO009", "积分抵扣", round(random.uniform(2, 8), 2)),
    ("PROMO010", "周末狂欢满减", round(random.uniform(10, 25), 2)),
]

START_DATE = datetime(2025, 12, 1)
END_DATE = datetime(2026, 3, 22)
DAYS_COUNT = (END_DATE - START_DATE).days + 1

def generate_order_id():
    return f"ORD{uuid.uuid4().hex[:12].upper()}"

def generate_customer_id():
    return f"CUST{random.randint(100000, 999999)}"

def generate_order_time(base_date):
    hour = random.choices(
        range(24),
        weights=[1,1,1,1,1,2,3,5,7,8,8,7,6,5,6,7,8,9,10,9,7,5,4,2]
    )[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return base_date.replace(hour=hour, minute=minute, second=second)

def generate_order_amount(product_category):
    price_ranges = {
        "盲抽": (15, 80),
        "盲盒": (39, 168),
        "玩偶": (29, 188),
        "挂饰": (12, 68),
        "手机壳": (25, 128),
        "背包": (88, 268),
    }
    low, high = price_ranges.get(product_category, (20, 100))
    return round(random.uniform(low, high), 2)

def select_promotion():
    weights = [40, 8, 8, 10, 8, 6, 5, 5, 4, 3, 3]
    promo = random.choices(PROMOTIONS, weights=weights)[0]
    if promo[2] == 0 and random.random() < 0.3:
        return ("", "", 0)
    return promo

print(f"Generating data for {DAYS_COUNT} days...")
print(f"Target: at least {DAYS_COUNT * 45} records")

all_data = []
records_per_day = {}

for day_offset in range(DAYS_COUNT):
    current_date = START_DATE + timedelta(days=day_offset)
    target_records = random.randint(45, 65)
    records_per_day[current_date.strftime("%Y-%m-%d")] = target_records
    
    for _ in range(target_records):
        product = random.choice(PRODUCTS)
        product_name = product[0]
        product_category = product[1]
        product_ip = product[2]
        
        order_amount = generate_order_amount(product_category)
        
        promo = select_promotion()
        promotion_id = promo[0]
        promotion_name = promo[1]
        discount_amount = promo[2]
        
        if discount_amount == 0 and random.random() < 0.3:
            discount_amount = round(order_amount * random.choice([0.05, 0.1, 0.15, 0.2]), 2)
        
        order_amount = round(order_amount - discount_amount, 2)
        if order_amount < 0.01:
            order_amount = 0.01
        
        payment_method = random.choice(PAYMENT_METHODS)
        payment_source = random.choice(PAYMENT_SOURCES)
        
        order_time = generate_order_time(current_date)
        
        all_data.append({
            "order_id": generate_order_id(),
            "order_time": order_time.strftime("%Y-%m-%d %H:%M:%S"),
            "product_name": product_name,
            "product_category": product_category,
            "product_ip": product_ip,
            "order_amount": order_amount,
            "payment_method": payment_method,
            "payment_source": payment_source,
            "customer_id": generate_customer_id(),
            "promotion_id": promotion_id,
            "promotion_name": promotion_name,
            "discount_amount": discount_amount,
        })

print(f"Total records generated: {len(all_data)}")

all_data.sort(key=lambda x: x["order_time"])

wb = Workbook()
ws = wb.active
ws.title = "支付数据"

headers = [
    "order_id", "order_time", "product_name", "product_category", "product_ip",
    "order_amount", "payment_method", "payment_source", "customer_id",
    "promotion_id", "promotion_name", "discount_amount"
]
ws.append(headers)

for row in all_data:
    ws.append([
        row["order_id"],
        row["order_time"],
        row["product_name"],
        row["product_category"],
        row["product_ip"],
        row["order_amount"],
        row["payment_method"],
        row["payment_source"],
        row["customer_id"],
        row["promotion_id"],
        row["promotion_name"],
        row["discount_amount"]
    ])

output_file = "D:\\opencodeproject\\payment_data.xlsx"
wb.save(output_file)

print(f"\nData saved to: {output_file}")
print(f"Date range: {START_DATE.strftime('%Y-%m-%d')} to {END_DATE.strftime('%Y-%m-%d')}")
print(f"Total days: {DAYS_COUNT}")
print(f"Total records: {len(all_data)}")

daily_counts = {}
for row in all_data:
    date = row["order_time"].split(" ")[0]
    daily_counts[date] = daily_counts.get(date, 0) + 1

min_day = min(daily_counts.values())
max_day = max(daily_counts.values())
print(f"Records per day: min={min_day}, max={max_day}")

total_amount = sum(row["order_amount"] for row in all_data)
print(f"Total revenue: ¥{total_amount:,.2f}")
