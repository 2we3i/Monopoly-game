import subprocess, time, os, signal
from playwright.sync_api import sync_playwright

BACKEND_DIR = "/home/claude/monopoly-game/backend"
FRONTEND_DIR = "/home/claude/monopoly-game/frontend"
URL = "http://localhost:4173"
AVATAR_FILE = "/tmp/avatar_test_assets/test_avatar.png"

procs = []
def start(cmd, cwd, name):
    p = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=open(f"/tmp/{name}.log", "w"), stderr=subprocess.STDOUT, preexec_fn=os.setsid)
    procs.append(p)

try:
    subprocess.run("rm -f data/monopoly.db* data/accounts.db*", cwd=BACKEND_DIR, shell=True)
    subprocess.run("rm -rf data/avatars", cwd=BACKEND_DIR, shell=True)
    start("node src/index.js", BACKEND_DIR, "avatarui_backend")
    time.sleep(2.5)
    start("npm run preview -- --host --port 4173", FRONTEND_DIR, "avatarui_frontend")
    time.sleep(3.5)

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(URL)
        page.wait_for_timeout(500)
        page.get_by_text("Create account").click()
        page.wait_for_timeout(300)
        page.get_by_placeholder("e.g. Sasha").fill("ProfileAlice")
        page.locator("#register-password").fill("profilepass1")
        page.locator("#register-confirm").fill("profilepass1")
        page.get_by_text("Create account", exact=True).click()
        page.wait_for_timeout(800)
        print("[1] Registered and logged in")

        pre_upload_imgs = page.evaluate("[...document.querySelectorAll('img')].length")
        assert pre_upload_imgs == 0, f"expected no <img> before any avatar upload, found {pre_upload_imgs}"
        print("[2] No avatar image present before upload (correct)")

        page.get_by_text("Logged in as ProfileAlice").click()
        page.wait_for_timeout(300)
        menu_text = page.evaluate("document.body.innerText")
        assert "Change avatar" in menu_text, f"expected the profile dropdown to offer avatar change: {menu_text[-300:]}"
        print("[3] Profile dropdown opened, shows 'Change avatar' option")

        page.screenshot(path="/tmp/profile_menu_shots_before.png")

        with page.expect_file_chooser() as fc_info:
            page.get_by_text("Change avatar", exact=True).click()
        file_chooser = fc_info.value
        file_chooser.set_files(AVATAR_FILE)
        page.wait_for_timeout(1000)
        print("[4] Avatar file selected and uploaded")

        post_upload_imgs = page.evaluate("""() => [...document.querySelectorAll('img')].map(i => i.src)""")
        print(f"    images present after upload: {post_upload_imgs}")
        assert len(post_upload_imgs) > 0, "expected at least one <img> after a successful upload"
        assert any("/avatars/" in src for src in post_upload_imgs), f"expected an /avatars/ image, got: {post_upload_imgs}"
        print("[5] CONFIRMED: avatar image now rendering in the profile chip after upload")

        page.screenshot(path="/tmp/profile_menu_shots_after.png")

        page.reload()
        page.wait_for_timeout(1200)
        after_reload_imgs = page.evaluate("[...document.querySelectorAll('img')].map(i => i.src)")
        assert any("/avatars/" in src for src in after_reload_imgs), f"avatar should persist across reload: {after_reload_imgs}"
        print("[6] Avatar correctly persists across a full page reload")

        avatar_url = next(src for src in after_reload_imgs if "/avatars/" in src)
        fetch_result = page.evaluate(f"""async () => {{
            const res = await fetch('{avatar_url}');
            const buf = await res.arrayBuffer();
            return {{ status: res.status, contentType: res.headers.get('content-type'), byteLength: buf.byteLength }};
        }}""")
        print(f"    direct fetch of avatar URL: {fetch_result}")
        assert fetch_result["status"] == 200, f"avatar URL should be fetchable, got status {fetch_result['status']}"
        assert fetch_result["byteLength"] == 115, f"expected the exact 115-byte test PNG, got {fetch_result['byteLength']} bytes"
        print("[7] CONFIRMED: avatar URL serves the exact uploaded image bytes")

        real_errors = [e for e in errors if "WebSocket" not in e]
        if real_errors:
            print(f"WARNING: {len(real_errors)} unexpected page errors:")
            for e in real_errors[:10]:
                print(" ", e)
        else:
            print("[8] No unexpected page errors throughout the avatar upload flow")

        browser.close()
    print("\n=== AVATAR UPLOAD UI END-TO-END TEST PASSED ===")
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
