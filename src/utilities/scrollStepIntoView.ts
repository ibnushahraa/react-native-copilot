import type { LayoutRectangle, NativeMethods, ScrollView } from "react-native";
import { type Step } from "../types";

// Jumlah frame maksimum menunggu posisi langkah stabil setelah digulir (~0,5 dtk).
const MAX_SETTLE_FRAMES = 30;
const MIN_MARGIN = 16;

type MeasureLayoutTarget = Parameters<NativeMethods["measureLayout"]>[0];

const nextFrame = async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
};

// Area ScrollView yang tampak di layar (koordinat window). Ref ScrollView
// adalah instance native yang punya measure(), meski tipe ScrollView RN tidak
// mencantumkannya.
const measureViewport = async (scrollView: ScrollView) =>
  await new Promise<{ y: number; height: number }>((resolve) => {
    (scrollView as unknown as NativeMethods).measure(
      (_x, _y, _w, height, _pageX, pageY) => {
        resolve({ y: pageY, height });
      }
    );
  });

// Posisi langkah relatif ke konten ScrollView. New Architecture mewajibkan ref
// komponen native di measureLayout — bukan angka dari findNodeHandle.
const measureInScrollView = async (step: Step, scrollView: ScrollView) =>
  await new Promise<{ y: number; height: number } | null>((resolve) => {
    const node = step.wrapperRef.current;
    if (node == null) {
      resolve(null);
      return;
    }
    node.measureLayout(
      scrollView as unknown as MeasureLayoutTarget,
      (_x, y, _w, height) => {
        resolve({ y, height });
      },
      () => {
        resolve(null);
      }
    );
  });

const isFullyVisible = (
  rect: LayoutRectangle,
  viewport: { y: number; height: number }
) =>
  rect.y >= viewport.y && rect.y + rect.height <= viewport.y + viewport.height;

/**
 * Gulir ScrollView hanya bila langkah belum terlihat penuh, lalu tunggu
 * posisinya berubah & stabil supaya sorotan diukur setelah gulir selesai.
 * Di New Architecture offset gulir baru tidak langsung terbaca measure().
 */
export const scrollStepIntoView = async (
  scrollView: ScrollView,
  step: Step
) => {
  const viewport = await measureViewport(scrollView);
  const before = await step.measure();
  if (isFullyVisible(before, viewport)) {
    return;
  }

  const layout = await measureInScrollView(step, scrollView);
  if (layout == null) {
    return;
  }

  const margin = Math.max(MIN_MARGIN, (viewport.height - layout.height) / 2);
  scrollView.scrollTo({ y: Math.max(0, layout.y - margin), animated: false });

  let prev = before;
  for (let i = 0; i < MAX_SETTLE_FRAMES; i++) {
    await nextFrame();
    const now = await step.measure();
    if (Math.abs(now.y - before.y) > 1 && Math.abs(now.y - prev.y) < 1) {
      return;
    }
    prev = now;
  }
};
