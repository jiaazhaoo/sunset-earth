import { isAdminSession } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { CandidatesReview } from "./candidates-review";
import { AdminLogin } from "./admin-login";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const authed = await isAdminSession();
  return (
    <>
      <SiteHeader liveCount={null} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Camera candidates</h1>
          <p className="text-sm text-muted">
            Streams the weekly discovery run found but was not sure enough to adopt on its own.
            Approve to add as a camera, reject to drop.
          </p>
        </div>
        {authed ? <CandidatesReview /> : <AdminLogin />}
      </main>
    </>
  );
}
