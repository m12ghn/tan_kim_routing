import asyncio, re
from playwright.async_api import async_playwright

import os
FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.localtest.html")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width":1400,"height":1300})
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(f"file://{FILE}")
        await page.wait_for_timeout(400)

        autosave1 = await page.text_content("#autosave-line")
        print("autosave line on fresh load (no prior save):", autosave1)

        # switch to T11, add a quan-level rule
        await page.click('button.month-btn:has-text("T11")')
        await page.wait_for_timeout(150)
        await page.click("#ver-B")  # Version A khoá (chỉ xem); chỉnh tuyến phải ở Version B
        await page.select_option("#sel-prov", label="Hồ Chí Minh")
        await page.wait_for_timeout(100)
        await page.select_option("#sel-dist", label="Quận Tân Bình")
        await page.select_option("#sel-eff", "T11")
        await page.click("#btn-add-rule")
        await page.wait_for_timeout(200)

        rule_count_before = await page.text_content("#rule-count")
        print("rule count before reload:", rule_count_before.strip())
        autosave2 = await page.text_content("#autosave-line")
        print("autosave line after adding rule:", autosave2)

        ls_raw = await page.evaluate("localStorage.getItem('tk_config_autosave_v1')")
        print("localStorage has data:", ls_raw is not None, "len=", len(ls_raw) if ls_raw else 0)

        # simulate refresh: reload same page (same origin/localStorage), fresh in-memory state
        await page.reload()
        await page.wait_for_timeout(500)

        # need to re-select T11 tab (currentMonth resets to T10 default on reload, that's fine —
        # what matters is the RULES persisted, not which month tab is active)
        await page.click('button.month-btn:has-text("T11")')
        await page.wait_for_timeout(200)

        rule_count_after = await page.text_content("#rule-count")
        mode_after = await page.text_content("#mode-line")
        autosave3 = await page.text_content("#autosave-line")
        print("rule count AFTER reload (T11):", rule_count_after.strip())
        print("mode line AFTER reload (T11):", mode_after.strip())
        print("autosave line AFTER reload:", autosave3)

        ok = "58 tuyến" in rule_count_after or "58" in rule_count_after
        print("PERSISTENCE OK:", ok)

        # test clear-autosave button
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.click("#btn-clear-autosave")
        await page.wait_for_timeout(200)
        ls_raw2 = await page.evaluate("localStorage.getItem('tk_config_autosave_v1')")
        print("localStorage after clear:", ls_raw2)

        print("JS ERRORS:", errors)
        await browser.close()

asyncio.run(main())
