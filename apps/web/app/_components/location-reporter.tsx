"use client";

import { useEffect } from "react";

import { mySharingOnAction, reportMyLocationAction } from "../(auth)/location-actions";

/** How often an open, visible app says where it is, while sharing is on. */
const EVERY_MS = 5 * 60_000;

/**
 * Sends this device's position while WonderHome is open and visible, only for
 * a person whose location sharing is on (asked of the server once per app
 * open). Never in the background, never a history: each report overwrites the
 * last. The browser asks the person's permission the first time, and a
 * refusal is simply respected.
 */
export function LocationReporter() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let stopped = false;
    let timer: number | undefined;
    let last = 0;
    const report = () => {
      if (stopped || document.visibilityState !== "visible" || Date.now() - last < EVERY_MS - 5_000) return;
      last = Date.now();
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void reportMyLocationAction({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        },
        () => {
          // Refused or unavailable: nothing is sent, and nothing is asked again this visit.
          stopped = true;
        },
        { enableHighAccuracy: false, maximumAge: 2 * 60_000, timeout: 20_000 },
      );
    };
    const onVisible = () => report();
    void mySharingOnAction().then((on) => {
      if (!on || stopped) return;
      report();
      timer = window.setInterval(report, EVERY_MS);
      document.addEventListener("visibilitychange", onVisible);
    });
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
