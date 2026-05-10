import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { SocketProvider } from '@/components/dashboard/SocketProvider';
import { AtmosphericBackground } from '@/components/dashboard/AtmosphericBackground';
import { SmoothScrollMain } from '@/components/dashboard/SmoothScrollMain';
import { DashboardLoadIntro } from '@/components/dashboard/DashboardLoadIntro';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <SocketProvider>
      <DashboardLoadIntro />
      <div className="relative flex h-screen overflow-hidden" style={{ background: 'var(--paper-0)' }}>
        <AtmosphericBackground />
        <div className="relative flex flex-1 min-w-0 z-10">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
            <Topbar />
            <SmoothScrollMain className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 pb-12 pt-2">
              <div className="mx-auto w-full max-w-[1600px]">
                {children}
              </div>
            </SmoothScrollMain>
          </div>
        </div>
      </div>
    </SocketProvider>
  );
}
