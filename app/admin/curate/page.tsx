import { isAdminSession } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { AdminLogin } from "../candidates/admin-login";
import { CurateReview } from "./curate-review";

export const dynamic = "force-dynamic";

export default async function CuratePage() {
  const authed = await isAdminSession();
  return (
    <>
      <SiteHeader liveCount={null} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Curate cameras</h1>
          <p className="text-sm text-muted">
            Every camera on air with its current frame and what the numbers make of it. Stars weigh the
            ranking: three is neutral, one all but hides a camera, five lifts it. Click a lit star again to clear.
          </p>
        </div>
        {authed ? <CurateReview /> : <AdminLogin />}
      </main>
    </>
  );
}
