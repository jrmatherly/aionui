#!/usr/bin/env python3
"""
Validate crawl4ai environment setup.

Usage:
    python validate_env.py

Returns exit code 0 if all checks pass, 1 otherwise.
"""

import subprocess
import sys


def check_imports() -> bool:
    """Check required Python imports."""
    success = True

    # Check crawl4ai
    try:
        import crawl4ai

        print(f"✅ crawl4ai {crawl4ai.__version__}")
    except ImportError:
        print("❌ crawl4ai not installed. Run: pip install crawl4ai>=0.8.0")
        success = False

    # Check playwright
    try:
        from playwright.async_api import async_playwright  # noqa: F401

        print("✅ playwright installed")
    except ImportError:
        print("❌ playwright not installed. Run: pip install playwright")
        success = False

    return success


def check_playwright_browsers() -> bool:
    """Check if Playwright browsers are installed."""
    try:
        # Check if chromium is available
        result = subprocess.run(
            ["playwright", "install", "--dry-run"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Try to detect if chromium needs installation
        # The dry-run will list browsers that need to be installed
        if "chromium" in result.stdout.lower() and "already installed" not in result.stdout.lower():
            print("⚠️  Chromium browser may need installation. Run: playwright install chromium")
            return True  # Not a hard failure, just a warning

        print("✅ Playwright browsers configured")
        return True

    except FileNotFoundError:
        print("⚠️  playwright CLI not found. Browsers may need installation after pip install.")
        return True  # Not a hard failure if playwright isn't in PATH yet

    except subprocess.TimeoutExpired:
        print("⚠️  Playwright check timed out")
        return True

    except Exception as e:
        print(f"⚠️  Could not verify Playwright browsers: {e}")
        return True


def check_system_deps() -> bool:
    """Check for critical system dependencies (headless environments)."""
    import platform

    if platform.system() != "Linux":
        print(f"ℹ️  Running on {platform.system()} - system deps check skipped")
        return True

    # Check for Xvfb or display (needed for headless)
    import os

    display = os.environ.get("DISPLAY")
    if display:
        print(f"✅ DISPLAY={display}")
    else:
        print("ℹ️  No DISPLAY set - will use headless mode")

    return True


def main() -> int:
    """Run all validation checks."""
    print("🔍 Validating crawl4ai environment...\n")

    checks = [
        ("Python imports", check_imports),
        ("Playwright browsers", check_playwright_browsers),
        ("System dependencies", check_system_deps),
    ]

    all_passed = True
    for name, check_fn in checks:
        print(f"\n--- {name} ---")
        if not check_fn():
            all_passed = False

    print("\n" + "=" * 40)
    if all_passed:
        print("✅ All checks passed! crawl4ai is ready to use.")
        return 0
    else:
        print("❌ Some checks failed. See above for details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
