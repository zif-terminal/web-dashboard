import { useEffect } from 'react';
import { useStore } from './store/store';
import { useLiveData } from './store/useLiveData';
import { Layout } from './components/Layout';
import { Overview } from './components/Overview';
import { Performance } from './components/Performance';
import { Activity } from './components/Activity';
import { Income } from './components/Income';
import { RiskPlan } from './components/RiskPlan';
import { Accounts } from './components/Accounts';
import { Login } from './components/Login';
import { LiveTradeToastContainer } from './components/LiveTradeToast';
import { ErrorToastContainer } from './components/ErrorToast';
import { IS_MOCK } from './data/createDataSource';
import { useAuth, isTokenValid, clearSession } from './data/authStore';

function Dashboard() {
  useLiveData(); // boots subscriptions + rAF ingest once
  const tab = useStore((s) => s.tab);

  return (
    <>
      <Layout>
        {/* #208: Positions is no longer a standalone tab — the Overview page
            now renders the full Positions section inline below its summary. */}
        {tab === 'overview' && <Overview />}
        {tab === 'performance' && <Performance />}
        {tab === 'activity' && <Activity />}
        {tab === 'income' && <Income />}
        {tab === 'plan' && <RiskPlan />}
        {tab === 'accounts' && <Accounts />}
      </Layout>
      {/* Global live trade-event toasts (bottom-right). Mounted once here so
          they persist across tab changes. Only subscribes after auth. */}
      <LiveTradeToastContainer />
    </>
  );
}

export function App() {
  const token = useAuth((s) => s.token);

  // Proactive expiry check: if the stored token has expired since the store was
  // initialised (e.g. the app was left open overnight), clear it so we drop to
  // <Login/> rather than spinning with anonymous Hasura subscriptions.
  useEffect(() => {
    if (!IS_MOCK && token && !isTokenValid(token)) {
      clearSession();
    }
  }, [token]);

  // Also check synchronously so the first render never shows the dashboard
  // with a token that just flipped invalid between store init and first paint.
  const effectiveToken = IS_MOCK ? 'mock' : token;
  const tokenOk = IS_MOCK || isTokenValid(effectiveToken);

  // Mock mode needs no auth; live mode gates on a valid, non-expired token.
  // Mounting <Dashboard/> only after auth means subscriptions never start
  // unauthenticated. The global error toasts (#204) mount OUTSIDE the auth gate
  // so login/network failures surface on the <Login/> screen too.
  return (
    <>
      {!IS_MOCK && !tokenOk ? <Login /> : <Dashboard />}
      <ErrorToastContainer />
    </>
  );
}
