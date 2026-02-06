/**
 * Mobile gesture utilities using percentage-based coordinates.
 * Provides device-agnostic swipe and scroll operations.
 */

import { Environment } from "../core/environment.js";

/**
 * Gesture configuration options.
 */
export interface GestureOptions {
  /** Percentage from left edge (0-100) */
  fromX?: number;
  /** Percentage from top edge (0-100) */
  fromY?: number;
  /** Percentage from left edge (0-100) */
  toX?: number;
  /** Percentage from top edge (0-100) */
  toY?: number;
  /** Duration of the gesture in milliseconds */
  duration?: number;
}

/**
 * Get the browser instance.
 */
function getBrowser(): WebdriverIO.Browser {
  return Environment.getInstance().browser;
}

/**
 * Get screen dimensions.
 */
async function getScreenSize(): Promise<{ width: number; height: number }> {
  const browser = getBrowser();
  const { width, height } = await browser.getWindowSize();
  return { width, height };
}

/**
 * Calculate absolute coordinates from percentages.
 */
async function calculateCoordinates(
  xPercent: number,
  yPercent: number
): Promise<{ x: number; y: number }> {
  const { width, height } = await getScreenSize();
  return {
    x: Math.round((width * xPercent) / 100),
    y: Math.round((height * yPercent) / 100),
  };
}

/**
 * Perform a swipe gesture.
 */
export async function swipe(options: GestureOptions): Promise<void> {
  const browser = getBrowser();
  const {
    fromX = 50,
    fromY = 50,
    toX = 50,
    toY = 50,
    duration = 800,
  } = options;

  const from = await calculateCoordinates(fromX, fromY);
  const to = await calculateCoordinates(toX, toY);

  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: from.x, y: from.y },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: 100 },
        { type: "pointerMove", duration, origin: "viewport", x: to.x, y: to.y },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);

  await browser.releaseActions();
}

/**
 * Swipe up (scroll down).
 */
export async function swipeUp(options: Partial<GestureOptions> = {}): Promise<void> {
  await swipe({
    fromX: 50,
    fromY: 70,
    toX: 50,
    toY: 30,
    duration: 800,
    ...options,
  });
}

/**
 * Swipe down (scroll up).
 */
export async function swipeDown(options: Partial<GestureOptions> = {}): Promise<void> {
  await swipe({
    fromX: 50,
    fromY: 30,
    toX: 50,
    toY: 70,
    duration: 800,
    ...options,
  });
}

/**
 * Swipe left.
 */
export async function swipeLeft(options: Partial<GestureOptions> = {}): Promise<void> {
  await swipe({
    fromX: 80,
    fromY: 50,
    toX: 20,
    toY: 50,
    duration: 800,
    ...options,
  });
}

/**
 * Swipe right.
 */
export async function swipeRight(options: Partial<GestureOptions> = {}): Promise<void> {
  await swipe({
    fromX: 20,
    fromY: 50,
    toX: 80,
    toY: 50,
    duration: 800,
    ...options,
  });
}

/**
 * Check if an element is displayed, scrolling up to find it if needed.
 * @param element WebDriverIO element or selector
 * @param maxScrolls Maximum number of scroll attempts
 */
export async function checkIfDisplayedWithSwipeUp(
  element: WebdriverIO.Element | string,
  maxScrolls = 5
): Promise<boolean> {
  const browser = getBrowser();
  const el = typeof element === "string" ? await browser.$(element) : element;

  for (let i = 0; i < maxScrolls; i++) {
    try {
      const displayed = await (el as WebdriverIO.Element).isDisplayed();
      if (displayed) {
        return true;
      }
    } catch {
      // Element might not exist yet
    }
    await swipeUp();
  }

  // Final check
  try {
    return await (el as WebdriverIO.Element).isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Check if an element is displayed, scrolling down to find it if needed.
 * @param element WebDriverIO element or selector
 * @param maxScrolls Maximum number of scroll attempts
 */
export async function checkIfDisplayedWithSwipeDown(
  element: WebdriverIO.Element | string,
  maxScrolls = 5
): Promise<boolean> {
  const browser = getBrowser();
  const el = typeof element === "string" ? await browser.$(element) : element;

  for (let i = 0; i < maxScrolls; i++) {
    try {
      const displayed = await (el as WebdriverIO.Element).isDisplayed();
      if (displayed) {
        return true;
      }
    } catch {
      // Element might not exist yet
    }
    await swipeDown();
  }

  // Final check
  try {
    return await (el as WebdriverIO.Element).isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Tap at a specific location.
 */
export async function tap(xPercent: number, yPercent: number): Promise<void> {
  const browser = getBrowser();
  const coords = await calculateCoordinates(xPercent, yPercent);

  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: coords.x, y: coords.y },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: 100 },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);

  await browser.releaseActions();
}

/**
 * Long press at a specific location.
 */
export async function longPress(
  xPercent: number,
  yPercent: number,
  duration = 1000
): Promise<void> {
  const browser = getBrowser();
  const coords = await calculateCoordinates(xPercent, yPercent);

  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: coords.x, y: coords.y },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);

  await browser.releaseActions();
}

/**
 * Double tap at a specific location.
 */
export async function doubleTap(xPercent: number, yPercent: number): Promise<void> {
  const browser = getBrowser();
  const coords = await calculateCoordinates(xPercent, yPercent);

  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: coords.x, y: coords.y },
        { type: "pointerDown", button: 0 },
        { type: "pointerUp", button: 0 },
        { type: "pause", duration: 100 },
        { type: "pointerDown", button: 0 },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);

  await browser.releaseActions();
}
