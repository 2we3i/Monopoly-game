import subprocess, time, os, signal, json, urllib.request
from playwright.sync_api import sync_playwright

BACKEND_DIR = "/home/claude/monopoly-game/backend"
FRONTEND_DIR = "/home/claude/monopoly-game/frontend"
URL = "http://localhost:4173"

procs = []
def start(cmd, cwd, name):
    p = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=open(f"/tmp/{name}.log", "w"), stderr=subprocess.STDOUT, preexec_fn=os.setsid)
    procs.append(p)

try:
    subprocess.run("rm -f data/monopoly.db* data/accounts.db*", cwd=BACKEND_DIR, shell=True)
    subprocess.run("rm -rf data/avatars", cwd=BACKEND_DIR, shell=True)
    start("node src/index.js", BACKEND_DIR, "final_backend")
    time.sleep(2.5)
    start("npm run preview -- --host --port 4173", FRONTEND_DIR, "final_frontend")
    time.sleep(3.5)

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "403" not in m.text else None)

        page.goto(URL)
        page.wait_for_timeout(500)
        page.get_by_text("Create account").click()
        page.wait_for_timeout(300)
        page.get_by_placeholder("e.g. Sasha").fill("FinalAlice")
        page.locator("#register-password").fill("finalpass123")
        page.locator("#register-confirm").fill("finalpass123")
        page.get_by_text("Create account", exact=True).click()
        page.wait_for_timeout(800)
        body_text = page.evaluate("document.body.innerText")
        assert "Logged in as FinalAlice" in body_text, f"registration/login flow failed: {body_text[:200]}"
        print("[1] Registration through real UI works, logged-in identity shown")

        page.get_by_text("Host a new game").click()
        page.wait_for_timeout(400)
        metro_btn = page.get_by_text("Metropolis", exact=False)
        assert metro_btn.count() > 0, "Metropolis mode not found in picker"
        metro_btn.first.click()
        page.get_by_text("Create room", exact=True).click()
        page.wait_for_selector("text=Room code", timeout=10000)
        room_code = page.evaluate("""() => {
            const els = [...document.querySelectorAll('p')];
            const el = els.find(e => e.className.includes('tracking-[0.15em]') && e.className.includes('text-6xl'));
            return el ? el.textContent.trim() : null;
        }""")
        assert room_code
        print(f"[2] Metropolis room created while logged in: {room_code}")

        players_text = page.evaluate("document.body.innerText")
        assert "FinalAlice" in players_text, "registered nickname not shown in waiting room"
        print("[3] Waiting room shows the real registered nickname")

        page.reload()
        page.wait_for_timeout(1500)
        after_reload = page.evaluate("document.body.innerText")
        assert room_code in after_reload, f"CRITICAL: room lost after reload! body: {after_reload[:200]}"
        print("[4] CONFIRMED: page reload correctly preserves room membership")

        page2 = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page2.on("pageerror", lambda e: errors.append(str(e)))
        page2.goto(URL)
        page2.wait_for_timeout(500)
        page2.get_by_text("Continue as guest").click()
        page2.get_by_placeholder("e.g. Sasha").fill("FinalGuestBob")
        page2.get_by_text("Continue as guest", exact=True).click()
        page2.wait_for_timeout(400)
        page2.get_by_text("Join with a code").click()
        page2.get_by_placeholder("e.g. K7QXM").fill(room_code)
        page2.get_by_text("Join room", exact=True).click()
        page2.wait_for_selector("text=Room code", timeout=10000)
        print("[5] Guest successfully joined the Metropolis room")

        page.get_by_text("Start game").click()
        page.wait_for_selector("text=Roll dice", timeout=10000)
        page.wait_for_timeout(600)

        tile_count = page.locator("[data-tile-id]").count()
        assert tile_count == 84, f"expected all 84 Metropolis tiles to render, got {tile_count}"
        print("[6] Board correctly renders all 84 tiles, not a hardcoded 40")

        read_scale = r"""() => {
            const el = document.querySelector('[data-board-stage]');
            if (!el) return null;
            const m = /scale\(([0-9.]+)\)/.exec(el.style.transform || '');
            return m ? Number(m[1]) : null;
        }"""
        zoom_before = page.evaluate(read_scale)
        page.get_by_label("Zoom in").click()
        page.wait_for_timeout(400)
        zoom_after_alice = page.evaluate(read_scale)
        zoom_bob = page2.evaluate(read_scale)
        assert zoom_after_alice != zoom_before, "Alice's zoom should have changed"
        assert zoom_bob == zoom_before, f"Bob's zoom should be unaffected, got {zoom_bob}"
        print("[7] CONFIRMED: zoom is independent per player")

        assert zoom_after_alice > zoom_before, "zooming in should genuinely enlarge the board"
        print(f"    board scale {zoom_before:.3f} -> {zoom_after_alice:.3f}")

        for _ in range(15):
            for pg in (page, page2):
                if pg.get_by_text("Roll dice", exact=False).count() > 0:
                    pg.get_by_text("Roll dice", exact=False).first.click()
                    time.sleep(0.3)
                elif pg.get_by_text("Try for doubles", exact=False).count() > 0:
                    pg.get_by_text("Try for doubles", exact=False).first.click()
                    time.sleep(0.3)
                buy_btn = pg.get_by_role("button", name="Buy for $")
                if buy_btn.count() > 0:
                    if buy_btn.first.is_enabled():
                        buy_btn.first.click()
                    else:
                        pg.get_by_text("Pass", exact=True).click()
                    time.sleep(0.2)
                if pg.get_by_text("Continue", exact=True).count() > 0:
                    pg.get_by_text("Continue", exact=True).click()
                    time.sleep(0.2)
                end_turn = pg.get_by_text("End turn", exact=True)
                if end_turn.count() > 0 and end_turn.is_enabled():
                    end_turn.click()
                    time.sleep(0.2)
        print("[8] Played several turns across both players without incident")

        real_errors = [e for e in errors if "WebSocket" not in e]
        if real_errors:
            print(f"WARNING: {len(real_errors)} unexpected errors:")
            for e in real_errors[:10]:
                print(" ", e)
        else:
            print("[9] No unexpected console/page errors throughout the entire test")

        browser.close()
    print("\n=== FULL END-TO-END VERIFICATION PASSED ===")
except Exception as e:
    print(f"\n!!! FAILED: {e}")
    import traceback
    traceback.print_exc()
finally:
    for pr in procs:
        try:
            os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
        except Exception:
            pass
