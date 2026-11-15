"use client";

import dynamic from "next/dynamic";

/** Loads the expedition/auth bridge on the client only, so Firebase stays out of the server render. */
export const ExpeditionBridgeLoader = dynamic(() => import("./expedition-bridge").then((m) => m.ExpeditionBridge), { ssr: false });
