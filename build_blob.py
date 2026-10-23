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
# Sửa nhãn polygon bị gán nhầm do trùng tên không dấu (ưu tiên cao nhất)
ADM2_VN_FIX = {"Huyen Hong Ngu": "Huyện Hồng Ngự"}

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
        if f["properties"]["name"] in ADM2_VN_FIX:
            f["properties"]["vn"] = ADM2_VN_FIX[f["properties"]["name"]]; n_name += 1
        elif cand:
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
    added_path = os.path.join(DATA, "wh_added_2210.json")
    if os.path.exists(added_path):
        did_of = {(w["pname"], w["dname"]): w["did"] for w in wh.values() if w.get("did")}
        n_add = 0
        for k, v in json.load(open(added_path, encoding="utf-8")).items():
            wid = int(k)
            if wid in wh: continue
            wh[wid] = {"name": v["name"], "pid": v.get("pid", ""), "pname": v["province"], "did": did_of.get((v["province"], v["district"]), ""),
                       "dname": v["district"], "dept": "", "lat": v.get("lat"), "lng": v.get("lng"), "approx": True}
            n_add += 1
        print(f"  + {n_add} BC mới (wh_added_2210.json; toạ độ = tâm quận, ước tính)")
    print(f"  {len(wh)} BC trong danh mục")

    print("[2/6] Volume theo BC + owner (1626/2388) + hàng (T6 baseline) — lấy...")
    # QUAN TRỌNG: 1 pick_warehouse_id (BC) hầu như luôn có volume dưới CẢ 2 owner
    # (1626 và 2388) cùng lúc (98% BC lấy, 99.5% BC giao) — tức 1 BC vật lý gửi
    # hàng cho cả 2 kho tuỳ tuyến, không phải "BC này thuộc kho kia". Nên phải giữ
    # owner làm 1 chiều riêng, không được cộng gộp owner lại — nếu gộp sẽ mất khả
    # năng tính đúng % nhường của từng kho HCM01/HCM20.
    base_path = os.path.join(DATA, "vol_base.csv")
    if os.path.exists(base_path):
        vb = pd.read_csv(base_path)
        print(f"  Nền volume: {base_path} ({vb.period_start.iloc[0]} → {vb.period_end.iloc[0]}, {int(vb.days.iloc[0])} ngày, {len(vb)} dòng) thay cho T6")
        vols = {"lấy": {}, "giao": {}}
        for _, r in vb.iterrows():
            vols[r.chieu].setdefault(int(r.bc_id), {}).setdefault(str(int(r.owner)), {})[r.service] = {"vol": int(r.don), "kl": int(round(r.kg * 1000))}
        vol_lay, vol_giao = vols["lấy"], vols["giao"]
        lay = vb[vb.chieu == "lấy"]
        totals = {str(w): {"vol": int(lay[lay.owner == w].don.sum()), "kl": int(round(lay[lay.owner == w].kg.sum() * 1000))} for w in (1626, 2388)}
    else:
        vol_lay = vol_giao = totals = None
    if vol_lay is None:
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

    # BC -> chỉ số polygon quận/huyện (adm2) chứa toạ độ BC (dùng cho bản đồ khoanh vùng)
    bc_dist, n_in, n_out = {}, 0, 0
    feats = [(i, f, _rings(f["geometry"])) for i, f in enumerate(adm2["features"])]
    boxes = [(i, [(min(q[0] for q in r), max(q[0] for q in r), min(q[1] for q in r), max(q[1] for q in r), r) for r in rings]) for i, f, rings in feats]
    for wid, w in wh.items():
        if w.get("lat") is None: continue
        x, y, hit = w["lng"], w["lat"], None
        for i, bs in boxes:
            if any(x0 <= x <= x1 and y0 <= y <= y1 and _inside(x, y, r) for (x0, x1, y0, y1, r) in bs):
                hit = i; break
        if hit is None: n_out += 1
        else: bc_dist[str(wid)] = hit; n_in += 1
    print(f"  bcDist: {n_in} BC nằm trong polygon quận/huyện, {n_out} ngoài polygon")
    # Quận không có BC nhưng do BC khác phục vụ (data/dist_cover.json) -> {chỉ số polygon: [wid]}
    dist_cover = {}
    cover_path = os.path.join(DATA, "dist_cover.json")
    if os.path.exists(cover_path):
        prov_rings = {f["properties"]["name"]: _rings(f["geometry"]) for f in prov["features"]}
        for wid, items in json.load(open(cover_path, encoding="utf-8")).items():
            if wid.startswith("_"): continue
            for it in items:
                dn, pn = it.split("|")
                prs = next((r for k, r in prov_rings.items() if k.endswith(pn)), [])
                for i, f, rings in feats:
                    if f["properties"].get("vn") != dn: continue
                    r = max(rings, key=len); x = sum(q[0] for q in r) / len(r); y = sum(q[1] for q in r) / len(r)
                    if any(_inside(x, y, pr) for pr in prs):
                        dist_cover.setdefault(str(i), []).append(str(wid)); break
                else:
                    print(f"  ! dist_cover: không tìm thấy polygon {it}")
        print(f"  distCover: {sum(len(v) for v in dist_cover.values())} quận được gán BC phục vụ")

    # ---- Số AOP T11/T12 theo KA v3 (data/aop_T11_T12_KA_v3.csv: vol = đơn, kg = weight nhập, tổng 3 tầng của kho) ----
    ka_path = os.path.join(DATA, "aop_T11_T12_KA_v3.csv")
    if os.path.exists(ka_path):
        ka = pd.read_csv(ka_path, dtype={"owner": str})
        idx = {"T10": 0, "T11": 1, "T12": 2}
        ratio = {}
        for _, r in ka.iterrows():
            o, i = r.owner, idx[r.month]
            for key, new in (("vol", float(r.vol)), ("w_nhap", float(r.kg))):
                old = official[o][key]["before"][i]
                f = new / old
                ratio[(o, i, key)] = f
                official[o][key]["before"][i] = new
                official[o][key]["after"][i] *= f      # giữ nguyên % nhường của AOP Sheet, chỉ đổi nền
            f = ratio[(o, i, "w_nhap")]                # w_4t: không có số mới -> đổi cùng tỷ lệ với w_nhap
            official[o]["w_4t"]["before"][i] *= f
            official[o]["w_4t"]["after"][i] *= f
        if "tk" in official:
            for key in ("vol", "w_nhap", "w_4t"):
                for i in (1, 2):
                    official["tk"][key]["after"][i] = sum(official[o][key]["before"][i] - official[o][key]["after"][i] for o in ("1626", "2388"))
        print(f"  KA v3 T11/T12: {len(ka)} dòng áp vào official")

    # ---- Kế hoạch 2027 (05/27–12/27): data/plan_2027.json + data/aop_2027.csv ----
    plan_path = os.path.join(DATA, "plan_2027.json")
    plan = None
    if os.path.exists(plan_path):
        cfgp = json.load(open(plan_path, encoding="utf-8"))
        aop27 = pd.read_csv(os.path.join(DATA, "aop_2027.csv"), dtype={"owner": str})
        for o in ("1626", "2388"):
            ratio4t = official[o]["w_4t"]["before"][2] / official[o]["w_nhap"]["before"][2]
            for m in cfgp["months"]:
                r = aop27[(aop27.owner == o) & (aop27.month == m)].iloc[0]
                for key, val in (("vol", float(r.vol)), ("w_nhap", float(r.kl)), ("w_4t", float(r.kl) * ratio4t)):
                    official[o][key]["before"].append(val); official[o][key]["after"].append(val)
        # đường thẳng nối kho Sóng Thần – Tân Tạo chia TP.HCM: phía chứa Tân Kim = Nam, còn lại = Bắc
        A = wh[int(cfgp["line"]["a"])] if int(cfgp["line"]["a"]) in wh else wh[cfgp["line"]["a"]]
        Bk = wh[int(cfgp["line"]["b"])] if int(cfgp["line"]["b"]) in wh else wh[cfgp["line"]["b"]]
        def side(lat, lng):
            return (Bk["lng"] - A["lng"]) * (lat - A["lat"]) - (Bk["lat"] - A["lat"]) * (lng - A["lng"])
        tk_side = side(tk["lat"], tk["lng"])
        north, south, nocoord = [], [], []
        dside = {}
        split_provs = cfgp.get("split_provs", ["Hồ Chí Minh"])
        for wid, w in wh.items():
            if w.get("pname") not in split_provs: continue
            if w.get("lat") is None: nocoord.append(wid); continue
            is_s = side(w["lat"], w["lng"]) * tk_side > 0
            (south if is_s else north).append(str(wid))
            dside.setdefault((w["pname"], w["dname"]), []).append(is_s)
        # BC không có toạ độ: theo phía chiếm đa số của quận (mặc định Nam nếu quận không có BC nào có toạ độ)
        for wid in nocoord:
            v = dside.get((wh[wid]["pname"], wh[wid]["dname"]), [True])
            (south if sum(v) * 2 >= len(v) else north).append(str(wid))
        nocoord = len(nocoord)
        # quận được chỉ định về HCM01 toàn bộ (vd Thủ Thừa, Bến Lức) -> tất cả BC của quận tính là phía bắc
        forced = {(pn, dn) for pn, dn in cfgp.get("force_north", [])}
        moved = [w for w in south if (wh[int(w)]["pname"], wh[int(w)]["dname"]) in forced]
        south = [w for w in south if w not in set(moved)]; north += moved
        print(f"  force_north: {len(moved)} BC chuyển sang phía bắc ({', '.join(d for _, d in sorted(forced))})")
        print(f"  plan 2027: TP.HCM + Long An, bắc {len(north)} BC ({nocoord} BC không toạ độ xếp theo quận), nam {len(south)} BC")
        base = {(r["chieu"], str(r["wid"])): r for r in default_rules[cfgp["inherit"]]}
        north_set, south_set = set(north), set(south)
        for m in cfgp["months"]:
            rules = {k: v for k, v in base.items() if k[1] not in north_set}   # BC phía bắc đường ranh về HCM01, không chuyển sang Tân Kim
            for chieu, src in (("lấy", vol_lay), ("giao", vol_giao)):
                for wid in src:
                    w = wh.get(wid) or wh.get(str(wid)) or wh.get(int(wid)) or {}
                    if w.get("pname") in cfgp["mientay"] or str(wid) in south_set:
                        rules[(chieu, str(wid))] = {"chieu": chieu, "capdo": "bc", "wid": int(wid), "hang": "Cả hai"}
            default_rules[m] = list(rules.values())
            print(f"  {m}: {len(default_rules[m])} default rules")
        plan = {"months": cfgp["months"], "days": cfgp["days"], "north": north, "full": cfgp["full"]}
        # Cắt polygon quận/huyện (TP.HCM, Long An) mà đường ranh đi qua thành 2 nửa Bắc/Nam để bản đồ khoanh vùng vẽ đúng đường chia
        def clip(ring, keep_south):
            out = []
            n = len(ring)
            for k in range(n):
                P, Q = ring[k - 1], ring[k]
                sp, sq = side(P[1], P[0]) * tk_side, side(Q[1], Q[0]) * tk_side
                inP, inQ = (sp > 0) == keep_south, (sq > 0) == keep_south
                if inQ:
                    if not inP:
                        t = sp / (sp - sq); out.append([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])])
                    out.append(list(Q))
                elif inP:
                    t = sp / (sp - sq); out.append([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])])
            return [[round(x, 5), round(y, 5)] for x, y in out]
        dist_of_bc, n_bc, n_sp = {}, {}, {}
        for wid, i in bc_dist.items():
            w = wh.get(int(wid)) or {}
            n_bc[i] = n_bc.get(i, 0) + 1
            if w.get("pname") in split_provs:
                dist_of_bc.setdefault(i, set()).add((w["pname"], w["dname"])); n_sp[i] = n_sp.get(i, 0) + 1
        splits = []
        for i, f, rings in feats:
            names = dist_of_bc.get(i, set())
            if not names or names & forced or n_sp.get(i, 0) * 2 <= n_bc.get(i, 0): continue
            signs = {side(q[1], q[0]) * tk_side > 0 for r in rings for q in r}
            if len(signs) < 2: continue
            halves = {}
            for key, ks in (("N", False), ("S", True)):
                polys = [[c] for c in (clip(r, ks) for r in rings) if len(c) >= 3]
                if polys: halves[key] = {"type": "MultiPolygon", "coordinates": polys}
            if len(halves) == 2: splits.append({"i": i, **halves})
        # đường ranh kéo dài, cắt ngang khung TP.HCM + Long An
        def at_lng(x): return A["lat"] + (Bk["lat"] - A["lat"]) * (x - A["lng"]) / (Bk["lng"] - A["lng"])
        plan["split"] = splits
        ns = set(north)
        plan["bcSide"] = {wid: ("N" if wid in ns else "S") for wid, i in bc_dist.items() if i in {x["i"] for x in splits}}
        plan["line"] = [[round(at_lng(105.45), 5), 105.45], [round(at_lng(107.05), 5), 107.05]]
        print(f"  plan 2027: cắt đôi {len(splits)} quận/huyện theo đường ranh")

    # Số thực tế (trung bình/ngày) theo BC, tách Normal/Bulky: data/actual_<tháng>.csv
    actual = {}
    for fn in sorted(os.listdir(DATA)):
        if not (fn.startswith("actual_") and fn.endswith(".csv")): continue
        a = pd.read_csv(os.path.join(DATA, fn))
        for _, r in a.iterrows():
            d = float(r["days"]) or 1.0
            e = actual.setdefault(r["month"], {}).setdefault(r["chieu"], {}).setdefault(str(int(r["warehouse_id"])), {})
            for sv, sk in (("Normal", "normal"), ("Bulky", "bulky")):
                e[sv] = {"vol": float(r["don_" + sk]) / d, "kl": float(r["kg_" + sk]) / d}
        print(f"  actual {fn}: {len(a)} dòng")

    print("[6/6] Ghi unified_blob.json...")
    blob = {
        "wh": {str(k): v for k, v in wh.items()},
        "volLay": {str(k): v for k, v in vol_lay.items()},
        "volGiao": {str(k): v for k, v in vol_giao.items()},
        "totals": totals,
        "defaultRules": default_rules,
        "official": official, "actual": actual, "plan": plan, "bcDist": bc_dist, "distCover": dist_cover,
        "prov": prov, "adm2": adm2, "tk": tk,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
    print(f"XONG -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB)")


if __name__ == "__main__":
    build()
