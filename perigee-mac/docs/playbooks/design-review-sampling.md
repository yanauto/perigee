# 设计像素采样评审法（引路人用 · 2026-08-01 实战打通）

> 用途：把「界面像不像参照」从主观争论变成硬数字闭环。本场用它完成 CCD 对齐的 r01→r02 两轮收敛（tile 111×43、热力格 14.5+3 分毫不差）。

## 流程

1. **参照图入仓**：目标产品各页面截图（Retina 2x，窗口尺寸一致）→ `docs/design/reference/`，语义命名（`ccd-01-home-overview.png`…）。记录倍率：**CSS px = 原图像素 ÷ 2**。
2. **采样出规格**：PIL 脚本对参照图逐点采样色值（5×5 均值防抖）+ 行/列扫描色彩突变边界得间距 → 产出规格表（如 `docs/design/CCD-SPEC.md`），**每个值标〔实测〕/〔目测〕**；执行方照抄实测值，目测值 ±10% 内可调。
3. **迭代评审**：执行方每轮 CDP 截图存 `docs/design/iterations/rNN/` + 轮次说明 → 引路人肉眼对比 + **对成品截图跑同一采样脚本复核** → 差异清单写 `rNN-review.md`（分组：结构/密度/bug，逐项带目标值）→ 循环至收敛判定。
4. **收敛后**：微瑕并入装机前一次修（不再要求截图轮），装机 → 用户终验。

## 采样脚本骨架（python3 + PIL，本机已装）

```python
from PIL import Image
def px(path, dx, dy, scale):   # scale = 原图宽/显示宽；采样点用显示坐标
    img = Image.open(path).convert("RGB")
    x, y = int(dx*scale), int(dy*scale)
    rs=gs=bs=n=0
    for xx in range(x-2,x+3):
        for yy in range(y-2,y+3):
            r,g,b = img.getpixel((xx,yy)); rs+=r; gs+=g; bs+=b; n+=1
    return "#%02x%02x%02x" % (rs//n, gs//n, bs//n)
# 边界扫描：沿行/列比较相邻像素 RGB 差 >18 记边界，合并 <2px 邻近点，÷2 得 CSS px
```

## 坑

- 采样点落在文字/边缘会得脏值——选纯色平坦区，存疑的换点复采。
- 不同截图倍率不同（2880 vs 3164 宽），逐图算 scale，别复用。
- 色值只解决「像」的一半；**收纳结构与密度（字号/内边距比）必须单独钉数字**，否则执行方会在这两层放飞（r01 教训）。

## 相关

- 规格表：`docs/design/CCD-SPEC.md` · 参照图：`docs/design/reference/`
- 迭代记录：`docs/design/iterations/`（rNN + rNN-review 成对）
- 协作协议：`docs/工单/README.md`（引路人⇄执行方）
