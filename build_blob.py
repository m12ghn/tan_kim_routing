#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build unified data blob for the Config_Rules-driven Tan Kim app.
Merges: dim_warehouse (master BC dimension), vol_from/vol_to (BC+service volume),
config_v3.csv (default rules per month), official AOP numbers (from simdata.json),
and prov/adm2 geojson (from the old map blob) into ONE json consumed by the
unified engine (KPI + live map): unified_blob.json.

Chạy: python3 build_blob.py   (cần: pip install pandas openpyxl)
Rồi chạy build_app.py để đóng gói unified_template.html + unified_blob.json -> index.html
"""
import json, csv, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
DIM_WH = os.path.join(DATA, "dim_warehouse.csv")
VOL_FROM = os.path.join(DATA, "vol_from.xlsx")
VOL_TO = os.path.join(DATA, "vol_to.csv")
CFG_CSV = os.path.join(DATA, "config_v3.csv")
OVERRIDE = os.path.join(DATA, "wh_geo_override.json")
OLD_BLOB = os.path.join(DATA, "old_map_blob.json")
OLD_SIMDATA = os.path.join(DATA, "simdata.json")
OUT = os.path.join(HERE, "unified_blob.json")


def parse_config_from_csv(path, tc, ic):
    o = {"lấy": set(), "giao": set()}
    with open(path, encoding="utf-8") as f:
        rows = list(csv.reader(f))
    for row in rows[1:]:
        if len(row) <= ic:
            continue
        t = row[tc].strip()
        i = row[ic].strip()
        if t and i:
            try:
                i = int(i)
            except ValueError:
                continue
            o.setdefault(t, set()).add(i)
    return o

# Các quận/huyện không có BC trong dim_warehouse (đảo, huyện mới...) nên không suy ra được tên có dấu -> ghi tay.
ADM2_VN_OVERRIDE = {
    "Ba To": "Huyện Ba Tơ", "Bac Ai": "Huyện Bác Ái", "Bach Long Vi": "Huyện Bạch Long Vĩ",
    "Buon Don": "Huyện Buôn Đôn", "Cat Hai": "Huyện Cát Hải", "Co To": "Huyện Cô Tô",
    "Con Co": "Huyện Cồn Cỏ", "Con Dao": "Huyện Côn Đảo", "Cu Mgar": "Huyện Cư M'gar",
    "Da Huoai": "Huyện Đạ Huoai", "Da Krong": "Huyện Đakrông", "Dak Po": "Huyện Đak Pơ",
    "Dak Rlap": "Huyện Đắk R'Lấp", "Dat Do": "Huyện Đất Đỏ", "EA Hleo": "Huyện Ea H'leo",
    "Gio Linh": "Huyện Gio Linh", "Hoa Lu": "Huyện Hoa Lư", "Hoang Sa": "Huyện Hoàng Sa",
    "Ia Pa": "Huyện Ia Pa", "Kien Hai": "Huyện Kiên Hải", "Kong Chro": "Huyện Kông Chro",
    "Krong Pa": "Huyện Krông Pa", "Long Dien": "Huyện Long Điền", "Long Phu": "Huyện Long Phú",
    "Ly Son": "Huyện Lý Sơn", "Mdrak District": "Huyện M'Đrắk", "Minh Long": "Huyện Minh Long",
    "Moc Hoa": "Huyện Mộc Hóa", "Mu Cang Chai": "Huyện Mù Cang Chải", "Muong Lay": "Thị xã Mường Lay",
    "Nam Po": "Huyện Nậm Pồ", "Phan Rang-Thap Cham": "Thành phố Phan Rang - Tháp Chàm",
    "Phu Quy": "Huyện Phú Quý", "Phu Yen": "Huyện Phù Yên", "Quan Ba": "Huyện Quản Bạ",
    "Quan Hoa": "Huyện Quan Hóa", "Quan Son": "Huyện Quan Sơn", "Quang Dien": "Huyện Quảng Điền",
    "Quang Tri": "Thị xã Quảng Trị", "Tam Dao": "Huyện Tam Đảo", "Tan Phu Dong": "Huyện Tân Phú Đông",
    "Tay Tra": "Huyện Tây Trà", "Thai Hoa": "Thị xã Thái Hòa", "Tien Lu": "Huyện Tiên Lữ",
    "Tinh Gia": "Huyện Tĩnh Gia", "Trieu Phong": "Huyện Triệu Phong", "Truong Sa": "Huyện Trường Sa",
    "Van Don": "Huyện Vân Đồn", "Yen Dung": "Huyện Yên Dũng",
}


def _strip(s):
    import unicodedata, re
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"^(quan|huyen|thanh pho|thi xa|thi tran|tp\.?)\s+", "", s)


def _rings(geom):
    c = geom["coordinates"]
    polys = [c] if geom["type"] == "Polygon" else c
    return [p[0] for p in polys]  # chỉ vòng ngoài của từng polygon


def _inside(x, y, ring):
    ins = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi:
            ins = not ins
        j = i
    return ins


def label_adm2(adm2, wh):
    """Gắn tên quận/huyện CÓ DẤU (property `vn`) cho từng polygon adm2 (tên gốc không dấu).
    Cách 1: các BC (toạ độ trong dim_warehouse) nằm trong polygon -> lấy district_name phổ biến nhất
            (kèm kiểm tra khớp tên không dấu để tránh nhầm khi ranh giới lệch).
    Cách 2: nếu tên không dấu chỉ khớp đúng 1 district_name trong dim_warehouse thì dùng luôn.
    Không có -> giữ tên gốc không dấu (vn = "")."""
    from collections import Counter, defaultdict
    by_name = defaultdict(set)
    pts = []
    for w in wh.values():
        if w.get("dname"):
            by_name[_strip(w["dname"])].add(w["dname"])
            if w.get("lat") is not None:
                pts.append((w["lng"], w["lat"], w["dname"]))
    n_pip = n_name = n_none = 0
    for f in adm2["features"]:
        key = _strip(f["properties"]["name"])
        rings = _rings(f["geometry"])
        cnt = Counter()
        for ring in rings:
            xs = [q[0] for q in ring]; ys = [q[1] for q in ring]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            for (x, y, dn) in pts:
                if x0 <= x <= x1 and y0 <= y <= y1 and _inside(x, y, ring):
                    cnt[dn] += 1
        cand = [dn for dn, _ in cnt.most_common() if _strip(dn) == key]
        if cand:
            f["properties"]["vn"] = cand[0]; n_pip += 1
        elif len(by_name.get(key, ())) == 1:
            f["properties"]["vn"] = next(iter(by_name[key])); n_name += 1
        elif f["properties"]["name"] in ADM2_VN_OVERRIDE:
            f["properties"]["vn"] = ADM2_VN_OVERRIDE[f["properties"]["name"]]; n_name += 1
        else:
            f["properties"]["vn"] = ""; n_none += 1
    print(f"  adm2 có dấu: {n_pip} theo toạ độ BC, {n_name} theo tên duy nhất, {n_none} giữ tên gốc không dấu")


def build():
    print("[1/6] Load dim_warehouse (master BC dimension: id -> name/province_id/district_id/lat/lng)...")
    dw = pd.read_csv(DIM_WH, dtype=str, keep_default_na=False)
    dw["warehouse_id"] = dw["warehouse_id"].str.replace(",", "").str.strip()
    dw["province_id"] = dw["province_id"].str.replace(",", "").str.strip()
    dw["district_id"] = dw["district_id"].str.replace(",", "").str.strip()

    def parse_coord(s):
        if not s or "," not in str(s):
            return None
        try:
            a, b = str(s).split(",", 1)
            return float(a), float(b)
        except Exception:
            return None

    wh = {}
    for _, r in dw.iterrows():
        try:
            wid = int(r["warehouse_id"])
        except Exception:
            continue
        c = parse_coord(r.get("_col9", ""))
        lat = lng = None
        if c and 5 < c[0] < 25 and 100 < c[1] < 115 and c[0] != 1.0:
            lat, lng = round(c[0], 5), round(c[1], 5)
        wh[wid] = {
            "name": r.get("warehouse_name", "").strip(),
            "pid": r.get("province_id", "") or "",
            "pname": r.get("province_name", "").strip(),
            "did": r.get("district_id", "") or "",
            "dname": r.get("district_name", "").strip(),
            "dept": r.get("department_name", "").strip(),
            "lat": lat, "lng": lng,
        }

    if os.path.exists(OVERRIDE):
        ovr = json.load(open(OVERRIDE))
        for k, v in ovr.items():
            if k.startswith("_"):
                continue
            try:
                wid = int(k)
            except Exception:
                continue
            if wid not in wh or wh[wid]["lat"] is None:
                wh.setdefault(wid, {})
                wh[wid].update({
                    "name": v.get("name", wh.get(wid, {}).get("name", "")),
                    "pname": v.get("province", wh.get(wid, {}).get("pname", "")),
                    "dname": v.get("district", wh.get(wid, {}).get("dname", "")),
                    "dept": v.get("dept", wh.get(wid, {}).get("dept", "")),
                    "pid": wh.get(wid, {}).get("pid", ""),
                    "did": wh.get(wid, {}).get("did", ""),
                    "lat": v.get("lat"), "lng": v.get("lng"),
                })
    print(f"  {len(wh)} BC trong danh mục")

    print("[2/6] Volume theo BC + owner (1626/2388) + hàng (T6 baseline) — lấy...")
    # QUAN TRỌNG: 1 pick_warehouse_id (BC) hầu như luôn có volume dưới CẢ 2 owner
    # (1626 và 2388) cùng lúc (98% BC lấy, 99.5% BC giao) — tức 1 BC vật lý gửi
    # hàng cho cả 2 kho tuỳ tuyến, không phải "BC này thuộc kho kia". Nên phải giữ
    # owner làm 1 chiều riêng, không được cộng gộp owner lại — nếu gộp sẽ mất khả
    # năng tính đúng % nhường của từng kho HCM01/HCM20.
    df_from = pd.read_excel(VOL_FROM, header=1)
    df_from["pick_warehouse_id"] = pd.to_numeric(df_from["pick_warehouse_id"], errors="coerce").astype("Int64")
    vol_lay = {}
    for (wid, owner, svc), g in df_from.groupby(["pick_warehouse_id", "warehouse_id", "service"]):
        if pd.isna(wid):
            continue
        vol_lay.setdefault(int(wid), {}).setdefault(str(int(owner)), {})[svc] = {
            "vol": int(g["total_vol"].sum()), "kl": int(g["total_kl"].sum())}

    print("[3/6] Volume theo BC + owner + hàng (T6 baseline) — giao...")
    df_to = pd.read_csv(VOL_TO)
    df_to["deliver_warehouse_id"] = pd.to_numeric(df_to["deliver_warehouse_id"], errors="coerce").astype("Int64")
    vol_giao = {}
    for (wid, owner, svc), g in df_to.groupby(["deliver_warehouse_id", "warehouse_id", "service"]):
        if pd.isna(wid):
            continue
        vol_giao.setdefault(int(wid), {}).setdefault(str(int(owner)), {})[svc] = {
            "vol": int(g["total_vol"].sum()), "kl": int(g["total_kl"].sum())}

    totals = {
        str(w): {"vol": int(df_from[df_from["warehouse_id"] == w]["total_vol"].sum()),
                 "kl": int(df_from[df_from["warehouse_id"] == w]["total_kl"].sum())}
        for w in (1626, 2388)
    }

    print("[4/6] Default rules từ config_v3.csv (BC-level, hàng=Cả hai, cumulative T10->T11->T12)...")
    t10 = parse_config_from_csv(CFG_CSV, 0, 1); t10["lấy"].discard(1327)
    t11 = parse_config_from_csv(CFG_CSV, 4, 5); t11["lấy"].discard(1327)
    t12 = parse_config_from_csv(CFG_CSV, 8, 9); t12["lấy"].discard(1327)
    default_rules = {}
    for month, cfg in (("T10", t10), ("T11", t11), ("T12", t12)):
        rows = []
        for chieu in ("lấy", "giao"):
            for wid in sorted(cfg[chieu]):
                rows.append({"chieu": chieu, "capdo": "bc", "wid": wid, "hang": "Cả hai"})
        default_rules[month] = rows
        print(f"  {month}: {len(rows)} default rules ({len(cfg['lấy'])} lấy / {len(cfg['giao'])} giao)")

    print("[5/6] Official AOP numbers (simdata.json) + prov/adm2 geojson (old_map_blob.json)...")
    sim = json.load(open(OLD_SIMDATA))
    official = sim["official"]
    old_blob = json.load(open(OLD_BLOB))
    prov = old_blob["prov"]
    adm2 = old_blob["adm2"]
    tk = old_blob["tk"]

    label_adm2(adm2, wh)

    print("[6/6] Ghi unified_blob.json...")
    blob = {
        "wh": {str(k): v for k, v in wh.items()},
        "volLay": {str(k): v for k, v in vol_lay.items()},
        "volGiao": {str(k): v for k, v in vol_giao.items()},
        "totals": totals,
        "defaultRules": default_rules,
        "official": official,
        "prov": prov, "adm2": adm2, "tk": tk,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
    print(f"XONG -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB)")


if __name__ == "__main__":
    build()
