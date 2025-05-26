import { Header } from '@/app/components/Header';
import { NetworkStatus } from '@/app/components/NetworkStatus';
import { PortalSettings } from '@/app/components/PortalSettings';

export function App() {
  return (
    <div className="app">
      <Header />
      <main>
        <section>
          <h2>Portal Status</h2>
          <PortalSettings />
        </section>
        <section>
          <h2>Protection Status</h2>
          <NetworkStatus />
        </section>
      </main>
    </div>
  );
}

