import { Suspense } from "react";
import { getRoiAssumptions, getSettings } from "@/lib/queries";
import { PageHeader, Skeleton } from "@/components/ui";
import { SettingsForm } from "./form";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="ROI settings">
        The assumptions behind the return figures on the overview. Change them as your baseline gets better.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96 max-w-2xl" />}>
        <Loaded />
      </Suspense>
    </>
  );
}

async function Loaded() {
  const [s, assumptions] = await Promise.all([getSettings(), getRoiAssumptions()]);
  return <SettingsForm brand={s.brand.name} hourly={s.roi.hourly_rate_sgd} fx={s.roi.usd_to_sgd} assumptions={assumptions} />;
}
