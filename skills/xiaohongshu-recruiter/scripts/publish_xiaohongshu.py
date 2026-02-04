import os
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

# Ensure logs flush immediately
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass


def log(msg: str) -> None:
    print(msg, flush=True)


def find_free_port():
    """Find a free port for Chrome debugging."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def is_port_in_use(port):
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def launch_standalone_chrome(profile_dir, debug_port):
    """Launch Chrome as a standalone process that won't close when script exits."""
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        os.path.expanduser(
            "~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        ),
    ]

    chrome_path = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_path = path
            break

    if not chrome_path:
        return None

    # Launch Chrome with remote debugging enabled
    # Using start_new_session=True makes Chrome independent of this script
    # --disable-features=ChromeWhatsNewUI prevents some popups
    # --no-service-autorun prevents service workers from keeping Chrome alive
    cmd = [
        chrome_path,
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=ChromeWhatsNewUI",
        "--disable-background-networking",
        "about:blank",
    ]

    try:
        # start_new_session=True on Unix creates a new process group
        # This prevents Chrome from being killed when the parent script exits
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        log(f"ℹ️ Chrome process started, PID: {process.pid}")
        # Wait for Chrome to start and listen on the debug port
        for i in range(30):
            if is_port_in_use(debug_port):
                log(f"ℹ️ Chrome ready, debug port {debug_port} is open")
                return debug_port
            time.sleep(0.5)
        log("⚠️ Chrome startup timed out, debug port not open")
    except Exception as e:
        log(f"⚠️ Failed to launch standalone Chrome: {e}")
    return None


def publish(title, content, images):
    """
    Automates the Xiaohongshu publishing process.
    """
    log("🚀 Xiaohongshu publishing script started")
    log("Instructions:")
    log("1) Watch the browser window: Xiaohongshu Creator Center has opened.")
    log("2) If a login page appears, scan the QR code to log in.")
    log("3) After login, the script will auto-upload images and fill in title/body.")
    log('4) Review the content in the browser, then click "Publish" when ready.')
    log("5) The browser will remain open after the script exits.")
    log(f"Title: {title}")
    log(f"Images: {images}")

    # Determine profile directory - use a unique directory to avoid conflicts with user's Chrome
    env_profile = os.environ.get("XHS_PROFILE_DIR")
    default_xhs_profile = os.path.join(
        os.path.expanduser("~"), ".aionui", "xiaohongshu-chrome-profile"
    )
    profile_dir = env_profile or default_xhs_profile
    os.makedirs(profile_dir, exist_ok=True)
    log(f"ℹ️ Using browser profile: {profile_dir}")

    # Find a port for Chrome debugging
    debug_port = 9222
    existing_chrome = is_port_in_use(debug_port)

    if existing_chrome:
        log(f"ℹ️ Port {debug_port} is in use, attempting to connect to existing Chrome instance...")
    else:
        log("ℹ️ Launching standalone Chrome process (browser will remain open after script exits)...")
        launched_port = launch_standalone_chrome(profile_dir, debug_port)
        if not launched_port:
            # Fallback: find another port
            debug_port = find_free_port()
            log(f"ℹ️ Trying fallback port {debug_port}...")
            launched_port = launch_standalone_chrome(profile_dir, debug_port)
        if launched_port:
            debug_port = launched_port
        else:
            log(
                "⚠️ Unable to launch standalone Chrome, falling back to Playwright managed mode (browser may close when script exits)"
            )
            debug_port = None

    with sync_playwright() as p:
        if debug_port and is_port_in_use(debug_port):
            # Connect to standalone Chrome via CDP
            log(f"ℹ️ Connecting to Chrome via CDP (port {debug_port})...")
            browser = p.chromium.connect_over_cdp(f"http://localhost:{debug_port}")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.new_page()
        else:
            # Fallback to Playwright-managed browser
            log("ℹ️ Using Playwright managed mode to launch browser...")
            context = p.chromium.launch_persistent_context(profile_dir, headless=False)
            page = context.new_page()

        try:
            # 1. Navigate to Publish Page
            log("🌐 Opening Xiaohongshu Creator Center...")
            page.goto(
                "https://creator.xiaohongshu.com/publish/publish",
                wait_until="domcontentloaded",
            )
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                log("⚠️ networkidle wait timed out, continuing...")
            try:
                log(f"ℹ️ Current page title: {page.title()}")
            except Exception:
                log("⚠️ Failed to read page title, continuing...")

            # 2. Check login status - wait if on login page
            start = time.time()
            while "/login" in page.url:
                elapsed = int(time.time() - start)
                if elapsed == 0 or elapsed % 5 == 0:
                    log("⚠️ Not logged in. Please complete login in the browser window, script will continue automatically.")
                if elapsed > 120:
                    log("❌ Login wait timed out (2 minutes), please proceed manually.")
                    break
                time.sleep(2)

            # Also check for login prompts on publish page
            try:
                if page.locator("text=扫码登录").count() > 0:
                    log("⚠️ Login popup detected, please scan QR code to log in...")
                    # Wait for login to complete (URL change or popup disappear)
                    for _ in range(60):
                        if page.locator("text=扫码登录").count() == 0:
                            log("✅ Login successful!")
                            break
                        time.sleep(2)
            except Exception:
                pass

            page.wait_for_timeout(1000)

            # 3. Switch to Image Tab - use direct URL navigation for reliability
            log("🔄 [Step 2] Switching to image post mode...")
            current_url = page.url
            if "target=video" in current_url or "上传视频" in page.content():
                # Navigate directly to image upload mode via URL
                page.goto(
                    "https://creator.xiaohongshu.com/publish/publish?from=tab_switch",
                    wait_until="domcontentloaded",
                )
                page.wait_for_timeout(2000)

            # Also try clicking the tab as backup
            try:
                # Use get_by_text with exact=False to find "上传图文" in the tab area
                tabs = page.locator("text=上传图文")
                if tabs.count() >= 2:
                    # The second occurrence is usually the clickable tab
                    tabs.nth(1).click()
                    page.wait_for_timeout(1000)
                elif tabs.count() == 1:
                    tabs.first.click()
                    page.wait_for_timeout(1000)
            except Exception as e:
                log(f"⚠️ Failed to click image tab: {e}")

            # Verify we're on image upload page
            if page.locator("text=上传图片，或写文字生成图片").count() > 0:
                log("✅ Switched to image post mode")
            else:
                log("⚠️ May not have switched successfully, continuing...")

            # 4. Upload Images BEFORE waiting for form (form appears after upload)
            log("📤 [Step 3] Uploading images...")
            try:
                # Wait for file input to be present
                page.wait_for_selector("input[type='file']", timeout=5000)

                # Set input files directly - this works even for hidden inputs
                upload_input = page.locator("input[type='file']").first
                upload_input.set_input_files(images)
                log(f"✅ Selected {len(images)} image(s)")

                # Wait for upload to process - look for the image count indicator
                log("⏳ Waiting for image upload to complete...")
                for i in range(20):
                    # Check for "(N/18)" pattern which indicates upload progress
                    if page.locator("text=/\\(\\d+\\/18\\)/").count() > 0:
                        log("✅ Image upload successful")
                        break
                    # Also check for title input which appears after upload
                    if page.locator("input[placeholder*='标题']").count() > 0:
                        log("✅ Publish form has loaded")
                        break
                    time.sleep(0.5)
                else:
                    log("⚠️ Upload confirmation timed out, continuing...")
            except Exception as e:
                log(f"❌ Image upload failed: {e}")
                log("👉 Please upload images manually and continue")

            # 5. NOW wait for form to appear (after image upload)
            log("⏳ [Step 4] Waiting for publish form to load...")

            # Wait for title input to appear (max 30 seconds)
            title_input = None
            for i in range(15):
                # Try multiple selectors
                for sel in [
                    "input[placeholder*='填写标题']",
                    "input[placeholder*='标题']",
                ]:
                    loc = page.locator(sel)
                    if loc.count() > 0 and loc.first.is_visible():
                        title_input = loc.first
                        break
                if title_input:
                    log("✅ Publish form loaded")
                    break
                if i % 5 == 0:
                    log(f"⏳ Waiting for form to load... ({i * 2}s)")
                time.sleep(2)

            if not title_input:
                log("⚠️ Title input not found, trying to find editable area...")
                # Try contenteditable as fallback
                editables = page.locator("div[contenteditable='true']")
                if editables.count() > 0:
                    title_input = editables.first
                else:
                    raise RuntimeError("Cannot find any input area")

            # 6. Fill Content
            log("✍️ [Step 5] Filling in title and body...")

            # Title (Limit 20 chars)
            if len(title) > 20:
                log(f"⚠️ Title too long ({len(title)} chars), truncating to 20 chars.")
                title = title[:20]

            try:
                title_input.click()
                title_input.fill(title)
                log(f"✅ Title filled: {title}")

                # Wait a moment for content area to be ready
                page.wait_for_timeout(500)

                # Content input - find the multiline textbox (content area)
                # Based on observation: it's a textbox that appears after the title
                content_selectors = [
                    "div[contenteditable='true'] p",  # Rich text editor paragraph
                    ".ql-editor",  # Quill editor
                    "div[contenteditable='true']",
                ]

                content_input = None
                for sel in content_selectors:
                    loc = page.locator(sel)
                    if loc.count() > 0:
                        # Get the last one (content is usually after title)
                        content_input = loc.last
                        if content_input.is_visible():
                            break

                if content_input:
                    content_input.click()
                    content_input.fill(content)
                    log("✅ Body content filled")
                else:
                    log("⚠️ Body input not found")

            except Exception as e:
                log(f"❌ Failed to fill text: {e}")

            log("✨ [Step 6] Draft created, auto-publishing...")
            try:
                publish_btn = page.get_by_role("button", name="发布")
                publish_btn.wait_for(timeout=10000)
                publish_btn.click()
                log("✅ Auto-clicked publish button, please confirm success in the browser.")
            except Exception as e:
                log(f"⚠️ Auto-click publish failed: {e}")
                log('👉 Please manually click "Publish" to complete.')
        except Exception as e:
            print(f"❌ Script execution interrupted: {e}")
            print("👉 Browser will remain open for you to complete publishing manually.")
        finally:
            # In CDP mode, browser runs independently - script can exit safely
            if debug_port and is_port_in_use(debug_port):
                log("✅ Script finished. Browser is running as an independent process and won't close with the script.")
                log("ℹ️ Please complete your actions in the browser and close it manually.")
            else:
                # Playwright-managed mode - keep script alive to prevent browser close
                log("✅ Script finished, browser will remain open. Please close the browser manually.")
                log("ℹ️ Script will continue running with heartbeat, it won't close the browser.")
                try:
                    while True:
                        time.sleep(30)
                        log("⏳ Still waiting... (Press Ctrl+C to exit script)")
                except KeyboardInterrupt:
                    log("Received exit signal, script ending.")


if __name__ == "__main__":
    # Usage: python publish_xiaohongshu.py <title> <content_file_path> <img1> <img2> ...
    if len(sys.argv) < 4:
        print(
            "Usage: python publish_xiaohongshu.py <title> <content_file> <img1> [img2 ...]"
        )
        sys.exit(1)

    title_arg = sys.argv[1]
    content_file = sys.argv[2]
    image_args = sys.argv[3:]

    # Read content from file
    if os.path.exists(content_file):
        with open(content_file, "r", encoding="utf-8") as f:
            content_arg = f.read()
    else:
        # Fallback if user passed raw text (not recommended for long text)
        content_arg = content_file

    publish(title_arg, content_arg, image_args)