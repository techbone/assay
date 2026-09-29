import { api } from "./api.js";
import { Footer, Header } from "./components/Layout.js";
import { Buy } from "./pages/Buy.js";
import { Findings } from "./pages/Findings.js";
import { Home } from "./pages/Home.js";
import { Scorecard } from "./pages/Scorecard.js";
import { Ticker } from "./pages/Ticker.js";
import { useRoute } from "./router.js";
import { useAsync } from "./useAsync.js";

export function App() {
  const route = useRoute();
  const s = useAsync(() => api.summary(), []);

  return (
    <>
      <Header route={route} summary={s.data} />
      {route.page === "ticker" ? <Ticker ticker={route.ticker} />
        : route.page === "buy" ? <Buy ticker={route.ticker} />
        : route.page === "scorecard" ? <Scorecard />
        : route.page === "findings" ? <Findings />
        : <Home summary={s.data} />}
      <Footer summary={s.data} />
    </>
  );
}
