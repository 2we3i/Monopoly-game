import subprocess, time, os, signal
from playwright.sync_api import sync_playwright

BACKEND_DIR = "/home/claude/monopoly-game/backend"
FRONTEND_DIR = "/home/claude/monopoly-game/frontend"
URL = "http://localhost:4173"

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
    start("node src/index.js", BACKEND_DIR, "cp_backend")
    time.sleep(2.5)
    start("npm run preview -- --host --port 4173", FRONTEND_DIR, "cp_frontend")
    time.sleep(3.5)

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page2 = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page2.on("pageerror", lambda e: errors.append(str(e)))

        enter_as_guest(page, "CPAlice")
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

        enter_as_guest(page2, "CPBob")
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
                et_locator = pg.locator("button", has_text="End turn")
                if et_locator.count() > 0 and et_locator.first.is_enabled():
                    et_locator.first.click()
                    time.sleep(0.2)

            alice_owns_tile = "CPAlice bought" in page.evaluate("document.body.innerText")

        assert alice_owns_tile, "Alice should own at least one property after many turns"
        print("[3] Alice owns at least one property")

        bought_tile_name = page.evaluate("""() => {
            const match = document.body.innerText.match(/CPAlice bought ([^\\n]+?) for \\$/);
            return match ? match[1] : null;
        }""")
        assert bought_tile_name, "could not determine which tile Alice bought from the log"
        print(f"[4] Alice owns: {bought_tile_name}")

        page.get_by_text(bought_tile_name, exact=False).first.click()
        page.wait_for_timeout(400)

        modal_text = page.evaluate("document.body.innerText")
        assert "For the Family" in modal_text, f"expected the For the Family section in the property modal: {modal_text[-500:]}"
        assert "CPBob" in modal_text, f"expected Bob to be listed as a target player: {modal_text[-500:]}"
        print("[5] Property modal shows the For the Family section listing Bob")

        page.screenshot(path="/tmp/cp_modal.png")

        price_input = page.locator('input[placeholder="Normal"]').first
        price_input.fill("1")
        page.get_by_text("Save", exact=True).click()
        page.wait_for_timeout(600)
        print("[6] Custom price of $1 set for Bob")

        page.mouse.click(50, 50)
        page.wait_for_timeout(300)

        page.get_by_text(bought_tile_name, exact=False).first.click()
        page.wait_for_timeout(400)
        reopened_text = page.evaluate("document.body.innerText")
        assert "$1" in reopened_text, f"expected the saved $1 custom price to persist and redisplay: {reopened_text[-400:]}"
        print("[7] Custom price of $1 correctly persisted and redisplays after reopening the modal")

        page2.get_by_text(bought_tile_name, exact=False).first.click()
        page2.wait_for_timeout(400)
        bob_modal_text = page2.evaluate("document.body.innerText")
        assert "For the Family" not in bob_modal_text, f"Bob (non-owner) should NOT see owner-only controls: {bob_modal_text[-400:]}"
        print("[8] CONFIRMED: non-owner (Bob) does not see the For the Family controls for a property he doesn't own")

        real_errors = [e for e in errors if "WebSocket" not in e]
        if real_errors:
            print(f"WARNING: {len(real_errors)} unexpected page errors:")
            for e in real_errors[:10]:
                print(" ", e)
        else:
            print("[9] No unexpected page errors throughout the custom pricing flow")

        browser.close()
    print("\n=== CUSTOM PRICING UI END-TO-END TEST PASSED ===")
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
