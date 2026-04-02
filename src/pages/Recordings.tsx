import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

export default function Recordings() {
  return (
    <DashboardLayout>
      <div style={{ padding: '40px', color: '#fff' }}>
        <h1>Meetings Page</h1>
        <p>If you see this text, the page loaded successfully!</p>
        <p style={{ marginTop: '20px', fontSize: '14px', color: '#78716C' }}>
          Stats: 0 meetings, 0m recorded, 0 summaries
        </p>
        <p style={{ marginTop: '20px', color: '#F97316' }}>
          Empty state: No meetings yet
        </p>
      </div>
    </DashboardLayout>
  );
}
