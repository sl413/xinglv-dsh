"""量化对比几张星履截图的美术指标。

为什么需要它：美术效果不能只靠肉眼看截图 —— 尤其在「对比度提高了没有」这种问题上，
人的印象会被前一张图锚定。这里给出四个可比的数字：

  平均亮度    整幅（含背景）的平均亮度
  银河区亮度  只取画面中央那块（银河所在）的平均亮度
  有效对比    银河区 p90 - p10 （拉开黑位与亮位的差距）
  暗部占比    银河区里亮度低于 12/255 的像素比例 —— 参考图的臂间间隙接近全黑，
              这个数字越大，说明「黑间隙」越成立

用法：python scripts/art-metrics.py 图1.png 图2.png ...
"""
import sys

from PIL import Image

BOX = (0.10, 0.15, 0.85, 0.85)  # 中央区域（避开顶栏与底部时间轴）


def metrics(path: str) -> dict:
    img = Image.open(path).convert('L')
    w, h = img.size
    full = img.histogram()
    total = sum(full)
    mean_all = sum(i * n for i, n in enumerate(full)) / total

    x0, y0, x1, y1 = int(w * BOX[0]), int(h * BOX[1]), int(w * BOX[2]), int(h * BOX[3])
    crop = img.crop((x0, y0, x1, y1))
    hist = crop.histogram()
    n = sum(hist)
    mean_gal = sum(i * c for i, c in enumerate(hist)) / n
    # 分位数
    acc, p10, p50, p90 = 0, 0, 0, 0
    for i, c in enumerate(hist):
        acc += c
        if p10 == 0 and acc >= n * 0.10:
            p10 = i
        if p50 == 0 and acc >= n * 0.50:
            p50 = i
        if p90 == 0 and acc >= n * 0.90:
            p90 = i
    dark = sum(hist[:13]) / n
    # 细节密度：相邻像素亮度差的平均值（梯度能量）。
    # 「对比度」看不见细尘丝，这个数字能 —— 参考图的细节密度极高，就是靠它比。
    import numpy as np

    arr = np.asarray(crop, dtype=np.float32)
    gx = np.abs(np.diff(arr, axis=1)).mean()
    gy = np.abs(np.diff(arr, axis=0)).mean()
    detail = (gx + gy) / 2.0
    return {
        'mean_all': mean_all,
        'mean_gal': mean_gal,
        'p10': p10,
        'p50': p50,
        'p90': p90,
        'contrast': p90 - p10,
        'dark_ratio': dark,
        'detail': detail,
    }


rows = [(p, metrics(p)) for p in sys.argv[1:]]
print(f"{'file':<24}{'all':>7}{'galaxy':>8}{'p10':>6}{'p50':>6}{'p90':>6}{'contrast':>10}{'dark%':>8}{'detail':>9}")
for name, m in rows:
    short = name.split('/')[-1].split('\\')[-1]
    print(
        f"{short:<24}{m['mean_all']:>7.1f}{m['mean_gal']:>8.1f}{m['p10']:>6}{m['p50']:>6}{m['p90']:>6}"
        f"{m['contrast']:>10}{m['dark_ratio'] * 100:>7.1f}%{m['detail']:>9.2f}"
    )

