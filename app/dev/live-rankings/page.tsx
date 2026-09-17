import { notFound } from "next/navigation";
import { devToolsEnabled } from "@/lib/auth";
import { LiveRankingsClient } from "./live-rankings-client";

export const dynamic = "force-dynamic";

export default function LiveRankingsPage() {
  if (!devToolsEnabled()) {
    notFound();
  }
  return <LiveRankingsClient />;
}
