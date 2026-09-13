import subprocess, time, os, signal
from playwright.sync_api import sync_playwright

BACKEND_DIR = "/home/claude/monopoly-game/backend"
FRONTEND_DIR = "/home/claude/monopoly-game/frontend"
URL = "http://localhost:4173"
SHOTS = "/tmp/trade_shots"
os.makedirs(SHOTS, exist_ok=True)

procs = []
def start(cmd, cwd, name):
    p = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=open(f"/tmp/{name}.log", "w"), stderr=subprocess.STDOUT, preexec_fn=os.setsid)
    procs.append(p)

def enter_as_guest(page, nickname):
    page.goto(URL)
    page.wait_for_timeout(500)
    page.get_by_text("Continue as guest").click()
    page.get_by_placeholder("e.g. Sasha").fill(nickname)
    page.get_by_text("Continue as guest", exact=True).click()
    page.wait_for_timeout(400)

try:
    subprocess.run("rm -f data/monopoly.db* data/accounts.db*", cwd=BACKEND_DIR, shell=True)
    start("node src/index.js", BACKEND_DIR, "trade_backend")
    time.sleep(2.5)
    start("npm run preview -- --host --port 4173", FRONTEND_DIR, "trade_frontend")
    time.sleep(3.5)

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page2 = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page2.on("pageerror", lambda e: errors.append(str(e)))

        enter_as_guest(page, "TradeAlice")
        page.get_by_text("Host a new game").click()
        page.wait_for_timeout(400)
        page.get_by_text("Create room", exact=True).click()
        page.wait_for_selector("text=Room code", timeout=10000)
        page.wait_for_timeout(400)
        room_code = page.evaluate("""() => {
            const els = [...document.querySelectorAll('p')];
            const el = els.find(e => e.className.includes('tracking-[0.15em]') && e.className.includes('text-6xl'));
            return el ? el.textContent.trim() : null;
        }""")
        print(f"[1] Room created: {room_code}")

        enter_as_guest(page2, "TradeBob")
        page2.get_by_text("Join with a code").click()
        page2.get_by_placeholder("e.g. K7QXM").fill(room_code)
        page2.get_by_text("Join room", exact=True).click()
        page2.wait_for_selector("text=Room code", timeout=10000)

        page.get_by_text("Start game").click()
        page.wait_for_selector("text=Roll dice", timeout=10000)
        page.wait_for_timeout(500)
        print("[2] Game started with Alice and Bob")

        alice_owns_tile = False
        for _ in range(80):
            if alice_owns_tile:
                break
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
                # Query the actual button element and its real disabled
                # property, rather than a free-text innerText.includes()
                # check - an earlier version of this loop used the latter
                # and produced a false positive (matched leftover log/DOM
                # text reading "End turn" even when no such button was
                # actually rendered at that moment), which stalled the
                # loop indefinitely without ever detecting the real,
                # correctly-owned properties Alice already had.
                et_locator = pg.locator("button", has_text="End turn")
                if et_locator.count() > 0 and et_locator.first.is_enabled():
                    et_locator.first.click()
                    time.sleep(0.2)

            alice_owns_tile = "TradeAlice bought" in page.evaluate("document.body.innerText")

        assert alice_owns_tile, "Alice should own at least one property after many turns"
        print("[3] Alice owns at least one property, proceeding to trade UI test")

        page.screenshot(path=f"{SHOTS}/01_before_trade.png")

        page.get_by_label("Players", exact=True).click()
        page.wait_for_timeout(200)
        trade_buttons = page.get_by_label("Trade", exact=True)
        assert trade_buttons.count() > 0, "expected at least one trade-initiation button in the player list"
        trade_buttons.first.click()
        page.wait_for_timeout(300)

        body_after_open = page.evaluate("document.body.innerText")
        assert "TradeBob gives" in body_after_open, f"expected trade composer to open targeting Bob: {body_after_open[:300]}"
        print("[4] Trade composer opened correctly, targeting Bob")

        page.screenshot(path=f"{SHOTS}/02_composer_open.png")

        offer_options = page.locator('[data-testid="trade-offer-option"]:not([disabled])')
        assert offer_options.count() > 0, "expected at least one tradable property in the composer"
        offer_options.first.click()
        money_inputs = page.locator('input[type="number"]')
        assert money_inputs.count() >= 2, "expected two money inputs (offer and request)"
        money_inputs.nth(1).fill("75")

        page.get_by_text("Send trade offer", exact=True).click()
        page.wait_for_timeout(600)
        print("[5] Trade offer sent")

        page2.get_by_label("Trades", exact=True).click()
        page2.wait_for_timeout(400)
        bob_body = page2.evaluate("document.body.innerText")
        assert "TradeAlice wants to trade" in bob_body, f"expected Bob to see the incoming trade: {bob_body[:400]}"
        print("[6] Bob sees the incoming trade in his Trades tab")

        page2.screenshot(path=f"{SHOTS}/03_bob_incoming_trade.png")

        page2.get_by_text("Accept", exact=True).click()
        page2.wait_for_timeout(600)

        bob_body_after = page2.evaluate("document.body.innerText")
        assert "wants to trade" not in bob_body_after, "trade should be gone from Bob's view after accepting"
        print("[7] Bob accepted the trade; it correctly disappeared from the pending list")

        page2.screenshot(path=f"{SHOTS}/04_after_accept.png")

        real_errors = [e for e in errors if "WebSocket" not in e]
        if real_errors:
            print(f"WARNING: {len(real_errors)} unexpected page errors:")
            for e in real_errors[:10]:
                print(" ", e)
        else:
            print("[8] No unexpected page errors throughout the trading flow")

        browser.close()
    print("\n=== TRADING UI END-TO-END TEST PASSED ===")
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
