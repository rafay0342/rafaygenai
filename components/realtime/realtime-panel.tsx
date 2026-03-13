"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type RealtimeEvent = {
  type: string;
  table: string;
  timestamp: string;
};

export function RealtimePanel() {
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const table = useMemo(
    () => process.env.NEXT_PUBLIC_SUPABASE_REALTIME_TABLE || "VideoJob",
    [],
  );

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null = null;

    try {
      const supabase = getSupabaseClient();
      channel = supabase
        .channel("realtime:rafaygen")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
          },
          (payload) => {
            setLastEvent({
              type: payload.eventType,
              table,
              timestamp: new Date().toISOString(),
            });
          },
        )
        .subscribe((state) => {
          if (state === "SUBSCRIBED") setStatus("connected");
        });
    } catch (error) {
      console.error(error);
      setStatus("error");
    }

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [table]);

  return (
    <div className="saas-card saas-card--realtime">
      <div className="saas-card__header">
        <div>
          <p className="saas-eyebrow">Realtime sync</p>
          <h3>Supabase Change Stream</h3>
          <p className="saas-muted">
            Listening to <strong>{table}</strong> via websockets for instant updates.
          </p>
        </div>
        <span className={`saas-status saas-status--${status}`}>
          {status === "connected" ? "Live" : status === "error" ? "Needs keys" : "Connecting"}
        </span>
      </div>
      <div className="saas-card__body">
        <div className="saas-metric">
          <span>Last event</span>
          <strong>{lastEvent ? `${lastEvent.type} @ ${lastEvent.timestamp}` : "Waiting for activity"}</strong>
        </div>
        <p className="saas-note">
          Set <code>NEXT_PUBLIC_SUPABASE_REALTIME_TABLE</code> if you want a different table.
        </p>
      </div>
    </div>
  );
}
