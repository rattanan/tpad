"use client";

import { useEffect, useRef, useState } from "react";
import { shouldShowSaveSuccess } from "@/lib/client/save-notification";

const visibleForMs = 3200;

export default function SaveSuccessNotifier() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const notifyingFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const requestMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
      const requestUrl = input instanceof Request ? input.url : String(input);
      const pathname = new URL(requestUrl, window.location.origin).pathname;
      if (response.ok && shouldShowSaveSuccess(pathname, requestMethod)) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(true);
        timerRef.current = setTimeout(() => setVisible(false), visibleForMs);
      }
      return response;
    };
    window.fetch = notifyingFetch;
    return () => {
      if (window.fetch === notifyingFetch) window.fetch = originalFetch;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <div className={`save-success-toast ${visible ? "visible" : ""}`} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">✓</span><div><strong>บันทึกสำเร็จ</strong><small>ข้อมูลล่าสุดถูกบันทึกเรียบร้อยแล้ว</small></div></div>;
}
