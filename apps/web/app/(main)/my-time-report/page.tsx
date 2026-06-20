import { PageHeader } from '@/components/shared/page-header';
import { PersonalTimeReport } from '@/components/time-tracking/personal-time-report';

export default function MyTimeReportPage() {
  return (
    <div className="p-8">
      <PageHeader title="My Time Report" description="Your personal time tracking summary." />
      <div className="mt-6">
        <PersonalTimeReport />
      </div>
    </div>
  );
}
