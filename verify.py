import asyncio, os, re, json
from playwright.async_api import async_playwright

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.localtest.html")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width":1400,"height":1300})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console:"+m.text) if m.type=="error" else None)
        await page.goto(f"file://{FILE}?showA=1")
        await page.wait_for_timeout(600)

        mode = await page.text_content("#mode-line")
        print("T10 default mode:", mode.strip())
        kpi = await page.text_content("#kpi-row")
        m1 = re.search(r"HCM01.*?Nh.{1,3}ng cho T.n Kim.*?(-?\d[\d,\.]*%)", kpi, re.S)
        print("T10 default HCM01 pct:", m1.group(1) if m1 else "NOT FOUND")

        # sanity: official T10 HCM01 pct should be (12596260-11699237)/12596260
        expected = (12596260-11699237)/12596260*100
        print(f"expected official T10 HCM01 pct = {expected:.2f}%")

        # switch to T11, add a quan-level rule: Ho Chi Minh / Quan Tan Binh, chieu lay, hang Ca hai
        await page.click('button.month-btn:has-text("T11")')
        await page.wait_for_timeout(200)
        mode11 = await page.text_content("#mode-line")
        print("T11 default mode:", mode11.strip())

        await page.click("#ver-B")  # Version A khoá (chỉ xem); chỉnh tuyến phải ở Version B
        await page.select_option("#sel-prov", label="Hồ Chí Minh")
        await page.wait_for_timeout(150)
        await page.select_option("#sel-dist", label="Quận Tân Bình")
        await page.select_option("#sel-eff", "T11")
        await page.click("#btn-add-rule")
        await page.wait_for_timeout(300)

        mode_after = await page.text_content("#mode-line")
        kpi_after = await page.text_content("#kpi-row")
        m2 = re.search(r"HCM01.*?Nh.{1,3}ng cho T.n Kim.*?(-?\d[\d,\.]*%)", kpi_after, re.S)
        print("T11 mode after adding Tan Binh rule:", mode_after.strip())
        print("T11 HCM01 pct after adding rule:", m2.group(1) if m2 else "NOT FOUND")

        rule_count = await page.text_content("#rule-count")
        print("rule count T11:", rule_count.strip())

        # check map tab reflects change
        await page.click("#tab-btn-map")
        await page.wait_for_timeout(500)
        stbody = await page.text_content("#mstbody")
        print("map stats T11:", stbody[:200].replace("\n"," "))

        # test BC-level add: search Ben Tre BC, chieu giao, hang Bulky
        await page.click("#tab-btn-sim")
        await page.wait_for_timeout(200)
        await page.click('#seg-chieu button:has-text("Giao")')
        await page.click('#seg-capdo button:has-text("Bưu cục/kho")')
        await page.fill("#bc-search", "Ben Tre")
        await page.wait_for_timeout(300)
        opt = page.locator(".bc-opt").first
        opt_text = await opt.text_content()
        print("first BC search result:", opt_text)
        await opt.click()
        await page.select_option("#sel-hang", "Bulky")
        await page.click("#btn-add-rule")
        await page.wait_for_timeout(300)
        rule_count2 = await page.text_content("#rule-count")
        print("rule count T11 after BC rule:", rule_count2.strip())

        # export
        await page.click("#btn-export")
        await page.wait_for_timeout(200)
        export_text = await page.input_value("#export-text")
        print("EXPORT TEXT:\n", export_text)

        await page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shot_sim.png"), full_page=True)
        await page.click("#tab-btn-map")
        await page.wait_for_timeout(600)
        await page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shot_map.png"), full_page=True)

        print("JS ERRORS:", errors[:20])
        await browser.close()

asyncio.run(main())
